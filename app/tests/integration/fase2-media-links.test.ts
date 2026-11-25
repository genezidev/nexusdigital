import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveTenantContext, type TenantContext } from "@/server/authorization/context";
import { withTenant } from "@/server/db/scope";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { createMediaLink, listMediaLinksFor, removeMediaLink } from "@/server/services/media-links";
import { appDb, makeWorld, ownerDb, type World } from "./helpers/world";
import { makePhase2, makeStaffAssigned, sys, type Phase2Data } from "./helpers/phase2";

// D-0025 / R-23: links de midia externos. Prova no BANCO (RLS forcada, FK composta, CHECK, gatilho) e no servico.
// Duas conexoes: a do app (nexo_app, sujeita a RLS) e a do dono (so para montar fixtures e conferir o estado real).

let w: World;
let a: Phase2Data;
let b: Phase2Data;
let adminA: TenantContext;
let ownerA: TenantContext;
let collabA: TenantContext;
let staffA: TenantContext;
let ownerB: TenantContext;
let draftOfA: { contentId: string; versionId: string };

const sql = (ctx: TenantContext, text: string) => withTenant(appDb, ctx, ({ tx }) => tx.$executeRawUnsafe(text));
const url = (path = randomUUID()) => `https://drive.google.com/file/d/${path}/view`;
const input = (target: Parameters<typeof createMediaLink>[2]["target"], extra: Partial<Parameters<typeof createMediaLink>[2]> = {}) => ({
  label: "Arte final",
  url: url(),
  kind: "IMAGEM" as const,
  target,
  ...extra,
});

/** Linha direta (conexao do dono, escopo de sistema): fixture que nao passa pelo servico. */
const rawLink = (clientId: string, dest: { versionId?: string; scriptId?: string; recordingId?: string }, extra: Record<string, unknown> = {}) =>
  sys((tx) =>
    tx.mediaLink.create({
      data: { clientId, ...dest, label: "fixture", url: url(), host: "drive.google.com", kind: "VIDEO", createdById: w.admin.id, ...extra },
    }),
  );

/** Conteudo compartilhado com uma versao RASCUNHO que recebe link e, depois, e ENVIADA (como no fluxo real). */
async function makeSharedWithLink(clientId: string) {
  return sys(async (tx) => {
    const cycle = await tx.editorialCycle.findFirstOrThrow({ where: { clientId } });
    const content = await tx.content.create({ data: { clientId, cycleId: cycle.id, title: `Conteudo ${randomUUID().slice(0, 6)}`, format: "ARTE", plannedOn: new Date("2026-11-25T00:00:00Z"), visibility: "COMPARTILHADO" } });
    const version = await tx.contentVersion.create({ data: { clientId, contentId: content.id, number: 1, status: "RASCUNHO", caption: "legenda", authorId: w.admin.id } });
    const link = await tx.mediaLink.create({ data: { clientId, versionId: version.id, label: "Previa", url: url(), host: "drive.google.com", kind: "IMAGEM", createdById: w.admin.id } });
    await tx.contentVersion.update({ where: { id: version.id }, data: { status: "ENVIADA", sentAt: new Date() } });
    await tx.content.update({ where: { id: content.id }, data: { currentVersionId: version.id, status: "AGUARDANDO_APROVACAO" } });
    return { contentId: content.id, versionId: version.id, linkId: link.id };
  });
}

beforeAll(async () => {
  w = await makeWorld();
  a = await makePhase2(w.clientA, w.admin.id, w.ownerA.id);
  b = await makePhase2(w.clientB, w.admin.id, w.ownerB.id);
  adminA = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientA });
  ownerA = await resolveTenantContext(appDb, { userId: w.ownerA.id, activeClientId: w.clientA });
  collabA = await resolveTenantContext(appDb, { userId: w.collabA.id, activeClientId: w.clientA });
  staffA = await resolveTenantContext(appDb, { userId: w.staffAssignedA.id, activeClientId: w.clientA });
  ownerB = await resolveTenantContext(appDb, { userId: w.ownerB.id, activeClientId: w.clientB });
  draftOfA = { contentId: a.contentInternal, versionId: a.versionDraft };
});

describe("cadastro pelo servico", () => {
  it("a agencia cadastra em versao RASCUNHO: guarda a URL normalizada e o host, e audita so o host (nunca a URL)", async () => {
    const row = await createMediaLink(appDb, adminA, input({ versionId: a.versionDraft }, { url: "HTTPS://Drive.Google.com:443/file/d/ABC123/view#", label: "  Previa do carrossel  " }));
    expect(row.url).toBe("https://drive.google.com/file/d/ABC123/view");
    expect(row.host).toBe("drive.google.com");
    expect(row.createdById).toBe(w.admin.id);
    const audit = await ownerDb.auditLog.findFirstOrThrow({ where: { clientId: w.clientA, action: "media_link.created", entityId: row.id } });
    expect(audit.actorId).toBe(w.admin.id);
    expect(audit.diff).toEqual({ host: "drive.google.com", kind: "IMAGEM", target: "version" });
    expect(JSON.stringify(audit.diff)).not.toContain("ABC123");
  });

  it("STAFF atribuida cadastra; colaborador e dono nao cadastram em versao ou roteiro (ForbiddenError)", async () => {
    await expect(createMediaLink(appDb, staffA, input({ scriptId: a.scriptDraft }))).resolves.toMatchObject({ scriptId: a.scriptDraft });
    await expect(createMediaLink(appDb, ownerA, input({ versionId: a.versionDraft }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createMediaLink(appDb, collabA, input({ scriptId: a.scriptSent }))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("endereco recusado vira ValidationError em `url`, e nada e gravado", async () => {
    const before = await ownerDb.mediaLink.count({ where: { clientId: w.clientA } });
    for (const bad of ["http://drive.google.com/x", "javascript:alert(1)", "https://evil-drive.google.com.attacker.com/x", "https://user@drive.google.com/x", "https://drive.google.com:8443/x", "https://127.0.0.1/x", "https://drive.google.com/a b"]) {
      const err = await createMediaLink(appDb, adminA, input({ scriptId: a.scriptDraft }, { url: bad })).catch((e: unknown) => e);
      expect(err, bad).toBeInstanceOf(ValidationError);
      expect(Object.keys((err as ValidationError).fields)).toEqual(["url"]);
    }
    expect(await ownerDb.mediaLink.count({ where: { clientId: w.clientA } })).toBe(before);
  });

  it("host extra configurado vale; sem ele e recusado", async () => {
    const u = "https://arquivos.exemplo.com.br/a/b";
    await expect(createMediaLink(appDb, adminA, input({ scriptId: a.scriptDraft }, { url: u }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createMediaLink(appDb, adminA, input({ scriptId: a.scriptDraft }, { url: u }), ["exemplo.com.br"])).resolves.toMatchObject({ host: "arquivos.exemplo.com.br" });
  });

  it("o mesmo link duas vezes no mesmo destino e conflito claro (409), em outro destino passa", async () => {
    const u = url();
    await createMediaLink(appDb, adminA, input({ scriptId: a.scriptDraft }, { url: u }));
    await expect(createMediaLink(appDb, adminA, input({ scriptId: a.scriptDraft }, { url: u }))).rejects.toBeInstanceOf(ConflictError);
    await expect(createMediaLink(appDb, adminA, input({ scriptId: a.scriptSent }, { url: u }))).resolves.toBeTruthy();
  });

  it("destino inexistente ou de outro cliente: NotFoundError, sem pista", async () => {
    await expect(createMediaLink(appDb, adminA, input({ versionId: b.versionDraft }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(createMediaLink(appDb, adminA, input({ scriptId: randomUUID() }))).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("versao ENVIADA e imutavel (gatilho, vale ate para o dono do banco)", () => {
  it("o servico recusa cadastrar e remover em versao ENVIADA", async () => {
    const sent = await makeSharedWithLink(w.clientA);
    await expect(createMediaLink(appDb, adminA, input({ versionId: sent.versionId }))).rejects.toThrow(/ENVIADA/);
    await expect(removeMediaLink(appDb, adminA, sent.linkId)).rejects.toThrow(/ENVIADA/);
    expect(await ownerDb.mediaLink.count({ where: { id: sent.linkId } })).toBe(1);
  });

  it("a conexao do dono tambem nao insere nem apaga (ENABLE ALWAYS)", async () => {
    const sent = await makeSharedWithLink(w.clientA);
    await expect(rawLink(w.clientA, { versionId: sent.versionId })).rejects.toThrow(/ENVIADA/);
    await expect(sys((tx) => tx.mediaLink.delete({ where: { id: sent.linkId } }))).rejects.toThrow(/ENVIADA/);
  });
});

describe("visibilidade: o cliente so ve link de destino que ele ve (RLS)", () => {
  it("rascunho interno nao aparece ao cliente; versao enviada de conteudo compartilhado aparece; a agencia ve tudo", async () => {
    const internal = await rawLink(w.clientA, { versionId: draftOfA.versionId }, { label: "SEGREDO-INTERNO" });
    const sent = await makeSharedWithLink(w.clientA);
    const asOwner = await listMediaLinksFor(appDb, ownerA, {});
    const ids = asOwner.map((l) => l.id);
    expect(ids).toContain(sent.linkId);
    expect(ids).not.toContain(internal.id);
    expect(JSON.stringify(asOwner)).not.toContain("SEGREDO-INTERNO");
    const asAdmin = (await listMediaLinksFor(appDb, adminA, {})).map((l) => l.id);
    expect(asAdmin).toEqual(expect.arrayContaining([internal.id, sent.linkId]));
    // colaborador enxerga o mesmo que o dono
    expect((await listMediaLinksFor(appDb, collabA, {})).map((l) => l.id)).toEqual(ids);
  });

  it("conteudo INTERNO com versao ENVIADA tambem nao mostra o link; roteiro RASCUNHO esconde, ENVIADO em diante mostra", async () => {
    const hidden = await sys(async (tx) => {
      const cycle = await tx.editorialCycle.findFirstOrThrow({ where: { clientId: w.clientA } });
      const c = await tx.content.create({ data: { clientId: w.clientA, cycleId: cycle.id, title: "interno", format: "ARTE", plannedOn: new Date("2026-11-26T00:00:00Z"), visibility: "INTERNO" } });
      const v = await tx.contentVersion.create({ data: { clientId: w.clientA, contentId: c.id, number: 1, status: "RASCUNHO", authorId: w.admin.id } });
      const l = await tx.mediaLink.create({ data: { clientId: w.clientA, versionId: v.id, label: "x", url: url(), host: "drive.google.com", kind: "IMAGEM", createdById: w.admin.id } });
      await tx.contentVersion.update({ where: { id: v.id }, data: { status: "ENVIADA", sentAt: new Date() } });
      return l.id;
    });
    const draftScript = await rawLink(w.clientA, { scriptId: a.scriptDraft });
    const sentScript = await rawLink(w.clientA, { scriptId: a.scriptSent });
    const seen = (await listMediaLinksFor(appDb, ownerA, {})).map((l) => l.id);
    expect(seen).not.toContain(hidden);
    expect(seen).not.toContain(draftScript.id);
    expect(seen).toContain(sentScript.id);
  });

  it("o filtro por destino (versao, roteiro, gravacao) respeita a mesma regra", async () => {
    const l = await rawLink(w.clientA, { recordingId: a.recording });
    expect((await listMediaLinksFor(appDb, ownerA, { recordingId: a.recording })).map((x) => x.id)).toContain(l.id);
    expect(await listMediaLinksFor(appDb, ownerA, { versionId: a.versionDraft })).toEqual([]);
  });
});

describe("isolamento entre clientes (A x B)", () => {
  it("o cliente A nao ve nem remove link de B; B nao ve os de A", async () => {
    const linkB = await rawLink(w.clientB, { scriptId: b.scriptSent });
    const linkA = await rawLink(w.clientA, { scriptId: a.scriptSent });
    expect((await listMediaLinksFor(appDb, ownerA, {})).map((x) => x.id)).not.toContain(linkB.id);
    expect((await listMediaLinksFor(appDb, adminA, {})).map((x) => x.id)).not.toContain(linkB.id);
    expect((await listMediaLinksFor(appDb, ownerB, {})).map((x) => x.id)).not.toContain(linkA.id);
    await expect(removeMediaLink(appDb, adminA, linkB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(removeMediaLink(appDb, ownerA, linkB.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await ownerDb.mediaLink.count({ where: { id: linkB.id } })).toBe(1);
  });

  it("SQL direto como cliente A: nao insere com client_id de B, nem em destino de B, nem le a tabela inteira de B", async () => {
    const u = url();
    await expect(
      sql(adminA, `INSERT INTO media_links (client_id, script_id, label, url, host, kind, created_by_id) VALUES ('${w.clientB}', '${b.scriptSent}', 'x', '${u}', 'drive.google.com', 'VIDEO', '${w.admin.id}')`),
    ).rejects.toThrow(/row-level security/i);
    // client_id de A com destino de B: a chave estrangeira COMPOSTA (client_id, id) recusa, ate pela conexao do dono
    await expect(
      sql(adminA, `INSERT INTO media_links (client_id, script_id, label, url, host, kind, created_by_id) VALUES ('${w.clientA}', '${b.scriptSent}', 'x', '${u}', 'drive.google.com', 'VIDEO', '${w.admin.id}')`),
    ).rejects.toThrow(/foreign key|chave estrangeira/i);
    await expect(rawLink(w.clientA, { scriptId: b.scriptSent })).rejects.toThrow(/foreign key|chave estrangeira/i);
    await expect(rawLink(w.clientA, { versionId: b.versionDraft })).rejects.toThrow(/foreign key|chave estrangeira/i);
    await expect(rawLink(w.clientA, { recordingId: b.recording })).rejects.toThrow(/foreign key|chave estrangeira/i);
    await withTenant(appDb, adminA, async ({ tx }) => {
      const rows = await tx.$queryRawUnsafe<{ client_id: string }[]>("SELECT client_id FROM media_links");
      expect(rows.every((r) => r.client_id === w.clientA)).toBe(true);
    });
  });

  it("sem contexto de cliente a tabela nao mostra nada (nega por padrao)", async () => {
    await rawLink(w.clientA, { scriptId: a.scriptSent });
    const rows = await appDb.$transaction(async (tx) => tx.$queryRawUnsafe<unknown[]>("SELECT 1 FROM media_links"));
    expect(rows).toEqual([]);
  });
});

describe("pessoa do cliente: so na gravacao dela", () => {
  it("o dono cadastra link na gravacao que ele enviou e remove o que cadastrou", async () => {
    const row = await createMediaLink(appDb, ownerA, input({ recordingId: a.recording }, { kind: "VIDEO", label: "Bastidores" }));
    expect(row.createdById).toBe(w.ownerA.id);
    expect((await listMediaLinksFor(appDb, ownerA, { recordingId: a.recording })).map((x) => x.id)).toContain(row.id);
    await removeMediaLink(appDb, ownerA, row.id);
    expect(await ownerDb.mediaLink.count({ where: { id: row.id } })).toBe(0);
    const audit = await ownerDb.auditLog.findFirstOrThrow({ where: { action: "media_link.removed", entityId: row.id } });
    expect(audit.diff).toEqual({ host: "drive.google.com", kind: "VIDEO" });
  });

  it("gravacao de OUTRA pessoa: a politica de insercao recusa (a agencia continua podendo)", async () => {
    const other = await sys((tx) => tx.recording.create({ data: { clientId: w.clientA, scriptId: a.scriptSent, kind: "LINK", externalUrl: "https://drive.google.com/file/d/outra", submittedById: w.admin.id } }));
    await expect(createMediaLink(appDb, ownerA, input({ recordingId: other.id }))).rejects.toThrow(/row-level security/i);
    await expect(createMediaLink(appDb, adminA, input({ recordingId: other.id }))).resolves.toBeTruthy();
  });

  it("o cliente nao remove o link que a agencia cadastrou (so o proprio), mas a agencia remove o do cliente", async () => {
    const byAgency = await rawLink(w.clientA, { recordingId: a.recording });
    await expect(removeMediaLink(appDb, ownerA, byAgency.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await ownerDb.mediaLink.count({ where: { id: byAgency.id } })).toBe(1);
    const byClient = await createMediaLink(appDb, ownerA, input({ recordingId: a.recording }));
    await removeMediaLink(appDb, adminA, byClient.id);
    expect(await ownerDb.mediaLink.count({ where: { id: byClient.id } })).toBe(0);
  });

  it("SQL direto como dono do cliente: nao grava em versao nem em roteiro e nao muda nenhuma coluna (sem UPDATE)", async () => {
    const u = url();
    await expect(
      sql(ownerA, `INSERT INTO media_links (client_id, version_id, label, url, host, kind, created_by_id) VALUES ('${w.clientA}', '${a.versionDraft}', 'x', '${u}', 'drive.google.com', 'VIDEO', '${w.ownerA.id}')`),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      sql(ownerA, `INSERT INTO media_links (client_id, script_id, label, url, host, kind, created_by_id) VALUES ('${w.clientA}', '${a.scriptSent}', 'x', '${u}', 'drive.google.com', 'VIDEO', '${w.ownerA.id}')`),
    ).rejects.toThrow(/row-level security/i);
    // autor forjado (outra pessoa como created_by)
    await expect(
      sql(ownerA, `INSERT INTO media_links (client_id, recording_id, label, url, host, kind, created_by_id) VALUES ('${w.clientA}', '${a.recording}', 'x', '${u}', 'drive.google.com', 'VIDEO', '${w.admin.id}')`),
    ).rejects.toThrow(/row-level security/i);
    const mine = await rawLink(w.clientA, { scriptId: a.scriptSent });
    await expect(sql(adminA, `UPDATE media_links SET url = 'https://drive.google.com/trocado' WHERE id = '${mine.id}'`)).rejects.toThrow(/permission denied|permiss/i);
  });
});

describe("regras do proprio banco sobre o texto (CHECK)", () => {
  const bad: [string, Record<string, unknown>][] = [
    ["http", { url: "http://drive.google.com/x" }],
    ["usuario@", { url: "https://user@drive.google.com/x" }],
    ["usuario@ antes de outro host", { url: "https://drive.google.com@evil.com/x" }],
    ["porta", { url: "https://drive.google.com:8443/x" }],
    ["host da coluna diferente da URL", { host: "youtube.com" }],
    ["host em maiusculas", { host: "Drive.Google.com", url: "https://Drive.Google.com/x" }],
    ["barra invertida", { url: "https://drive.google.com/a\\b" }],
    ["espaco", { url: "https://drive.google.com/a b" }],
    ["2049 caracteres", { url: `https://drive.google.com/${"a".repeat(2049 - 25)}` }],
    ["rotulo vazio", { label: "   " }],
    ["rotulo com controle", { label: "a\nb" }],
    ["rotulo com mais de 120", { label: "a".repeat(121) }],
  ];
  it.each(bad)("recusa: %s", async (_name, extra) => {
    await expect(rawLink(w.clientA, { scriptId: a.scriptSent }, extra)).rejects.toThrow(/check|constraint|violat/i);
  });

  it("exatamente um destino", async () => {
    await expect(sys((tx) => tx.mediaLink.create({ data: { clientId: w.clientA, label: "x", url: url(), host: "drive.google.com", kind: "VIDEO", createdById: w.admin.id } as never }))).rejects.toThrow(/check|constraint|violat/i);
    await expect(rawLink(w.clientA, { scriptId: a.scriptSent, recordingId: a.recording })).rejects.toThrow(/check|constraint|violat/i);
  });
});

describe("limite de 20 links por destino (gatilho)", () => {
  it("o 21o e recusado, em outro destino continua valendo, e remover libera vaga", async () => {
    const script = await sys((tx) => tx.script.create({ data: { clientId: w.clientA, title: "roteiro cheio", status: "RASCUNHO" } }));
    for (let i = 0; i < 20; i++) await rawLink(w.clientA, { scriptId: script.id });
    await expect(createMediaLink(appDb, adminA, input({ scriptId: script.id }))).rejects.toThrow(/maximo 20/i);
    await expect(createMediaLink(appDb, adminA, input({ scriptId: a.scriptDraft }))).resolves.toBeTruthy();
    const one = await ownerDb.mediaLink.findFirstOrThrow({ where: { scriptId: script.id } });
    await removeMediaLink(appDb, adminA, one.id);
    await expect(createMediaLink(appDb, adminA, input({ scriptId: script.id }))).resolves.toBeTruthy();
  });

  it("cadastros simultaneos no mesmo destino nao passam de 20 (trava no gatilho)", async () => {
    const script = await sys((tx) => tx.script.create({ data: { clientId: w.clientA, title: "roteiro concorrente", status: "RASCUNHO" } }));
    for (let i = 0; i < 15; i++) await rawLink(w.clientA, { scriptId: script.id });
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => createMediaLink(appDb, adminA, input({ scriptId: script.id }))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(await ownerDb.mediaLink.count({ where: { scriptId: script.id } })).toBe(20);
  });
});

describe("STAFF nao atribuida e usuario de outro cliente", () => {
  it("STAFF de outro cliente nao resolve contexto no cliente A (404/403 do acesso), e a atribuida de A nao toca B", async () => {
    const staffB = await makeStaffAssigned(w.clientB, "staff-b-links");
    const ctxB = await resolveTenantContext(appDb, { userId: staffB.id, activeClientId: w.clientB });
    await expect(createMediaLink(appDb, ctxB, input({ scriptId: a.scriptDraft }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveTenantContext(appDb, { userId: staffB.id, activeClientId: w.clientA })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
