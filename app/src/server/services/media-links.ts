import { Prisma } from "@/generated/prisma/client";
import type { MediaKind } from "@/generated/prisma/enums";
import type { TenantContext } from "@/server/authorization/context";
import { assertCan, isAgency } from "@/server/authorization/permissions";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/scope";
import { MEDIA_LINK_REJECTION_MESSAGE, validateMediaLink } from "@/server/domain/media-link";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { recordAudit } from "@/server/repositories/audit";
import { deleteMediaLink, getMediaLink, insertMediaLink, listMediaLinks, type MediaTarget } from "@/server/repositories/media-links";

// Links de midia externos (D-0025, R-23). O servidor so valida o TEXTO do endereco e o guarda normalizado: nunca
// abre, baixa, pre-visualiza nem segue redirecionamento. Quem decide se a pessoa ve o link e a RLS do destino.

const TARGET_NAME = { versionId: "version", scriptId: "script", recordingId: "recording" } as const;

function targetKind(target: MediaTarget): "version" | "script" | "recording" {
  return TARGET_NAME[Object.keys(target)[0] as keyof typeof TARGET_NAME];
}

export interface CreateMediaLinkInput {
  label: string;
  url: string;
  kind: MediaKind;
  target: MediaTarget;
}

export async function createMediaLink(db: Db, ctx: TenantContext, input: CreateMediaLinkInput, extraHosts: readonly string[] = []) {
  assertCan(ctx, "media_link:create");
  // A pessoa do cliente so cadastra link na gravacao DELA (o banco confere de novo: politica `media_links_insert`).
  if (!isAgency(ctx) && !("recordingId" in input.target)) throw new ForbiddenError();
  const checked = validateMediaLink(input.url, extraHosts);
  if (!checked.ok) throw new ValidationError({ url: MEDIA_LINK_REJECTION_MESSAGE[checked.reason] });
  try {
    return await withTenant(db, ctx, async (s) => {
      const target = input.target;
      const exists =
        "versionId" in target
          ? await s.tx.contentVersion.findFirst({ where: { id: target.versionId, clientId: ctx.clientId }, select: { id: true } })
          : "scriptId" in target
            ? await s.tx.script.findFirst({ where: { id: target.scriptId, clientId: ctx.clientId }, select: { id: true } })
            : await s.tx.recording.findFirst({ where: { id: target.recordingId, clientId: ctx.clientId }, select: { id: true } });
      if (!exists) throw new NotFoundError();
      const row = await insertMediaLink(s, { label: input.label, url: checked.href, host: checked.host, kind: input.kind, ...target });
      // Auditoria sem a URL inteira (pode carregar identificador do arquivo no servico): so o host, o tipo e o destino.
      await recordAudit(s, { action: "media_link.created", entityType: "media_link", entityId: row.id, diff: { host: checked.host, kind: input.kind, target: targetKind(target) } });
      return row;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("MEDIA_LINK_DUPLICATE", "Este link ja esta cadastrado neste item.");
    }
    throw error;
  }
}

export async function removeMediaLink(db: Db, ctx: TenantContext, id: string) {
  assertCan(ctx, "media_link:remove");
  return withTenant(db, ctx, async (s) => {
    const row = await getMediaLink(s, id);
    if (!row) throw new NotFoundError();
    // Agencia remove qualquer um do cliente; o cliente so o que ele mesmo cadastrou (RLS `media_links_delete`).
    if ((await deleteMediaLink(s, id)) !== 1) throw new NotFoundError();
    await recordAudit(s, { action: "media_link.removed", entityType: "media_link", entityId: id, diff: { host: row.host, kind: row.kind } });
  });
}

export async function listMediaLinksFor(db: Db, ctx: TenantContext, where: { versionId?: string; scriptId?: string; recordingId?: string }) {
  return withTenant(db, ctx, (s) => listMediaLinks(s, where));
}
