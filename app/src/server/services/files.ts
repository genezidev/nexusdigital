import { randomUUID } from "node:crypto";
import { resolveTenantContext, systemContextForMaintenance, systemContextForStorageCapacity, type TenantContext } from "@/server/authorization/context";
import { assertCan, isAgency } from "@/server/authorization/permissions";
import { getServerEnv } from "@/server/config/env";
import type { Db } from "@/server/db/client";
import { withSystemScoped, withTenant } from "@/server/db/scope";
import { checkAssetDeclaration, maxBytesFor, type AssetLimits } from "@/server/domain/asset-policy";
import { assessOrphans, CleanupAbortedError, decideInstallBinding, resolveCleanupLimits, type CleanupLimits } from "@/server/domain/cleanup-policy";
import { verifyUploadedType } from "@/server/domain/file-type";
import { ConflictError, DomainRuleError, ForbiddenError, GoneError, InsufficientStorageError, NotFoundError, PayloadTooLargeError, TooManyRequestsError } from "@/server/errors";
import { clientStorageBytes, countPendingUploads, getOwnUpload, globalStorageBytes, insertPendingAsset, lockClientUploads, markAssetAvailable, markAssetDeleted, markAssetRejected } from "@/server/repositories/assets";
import { recordAudit, recordSystemAudit } from "@/server/repositories/audit";
import { authorizeDownload } from "@/server/services/assets";
import { getStorage } from "@/server/storage";
import { newStorageKey } from "@/server/storage/keys";
import { isExpired, signingSecret, signToken, verifyToken } from "@/server/storage/signed-token";
import type { ObjectStorage } from "@/server/storage/types";

// Servico de arquivos (R-5, D-0015 e D-0016): alvo de envio assinado, recebimento em streaming com conferencia do
// tipo REAL, link de download assinado de curta duracao e entrega com reautorizacao. Nenhuma funcao aqui devolve
// caminho, chave de armazenamento ou URL permanente.

const MB = 1024 * 1024;

export interface FileDeps {
  storage: ObjectStorage;
  secret: Buffer;
  limits: AssetLimits;
  uploadTtlSeconds: number;
  downloadTtlSeconds: number;
  maxPendingPerUser: number;
  /** 0 = sem conferencia de cota. */
  clientQuotaBytes: number;
  /** Teto da soma de TODOS os clientes (B-1 de M-B). 0 = sem teto. */
  globalQuotaBytes: number;
  /** Espaco livre que o volume precisa manter depois de aceitar o arquivo. 0 = sem conferencia. */
  minFreeBytes: number;
  now: () => Date;
}

export function fileDepsFromEnv(): FileDeps {
  const env = getServerEnv();
  return {
    storage: getStorage(),
    secret: signingSecret(env),
    limits: { IMAGEM: Math.floor(env.MAX_IMAGE_MB * MB), DOCUMENTO: Math.floor(env.MAX_PDF_MB * MB), VIDEO: Math.floor(env.MAX_VIDEO_MB * MB) },
    uploadTtlSeconds: env.UPLOAD_URL_TTL_SECONDS,
    downloadTtlSeconds: env.DOWNLOAD_URL_TTL_SECONDS,
    maxPendingPerUser: env.MAX_PENDING_UPLOADS_PER_USER,
    clientQuotaBytes: Math.floor(env.STORAGE_CLIENT_QUOTA_MB * MB),
    globalQuotaBytes: Math.floor(env.STORAGE_GLOBAL_QUOTA_MB * MB),
    minFreeBytes: Math.floor(env.STORAGE_MIN_FREE_MB * MB),
    now: () => new Date(),
  };
}

export const PENDING_MAX_AGE_HOURS = 24;
const HOUR = 3600_000;
const pendingSince = (now: Date) => new Date(now.getTime() - PENDING_MAX_AGE_HOURS * HOUR);

/**
 * Capacidade do SERVIDOR (507): teto global (soma de todos os clientes) e espaco livre minimo no volume. Nao e trava
 * consultiva: entre dois pedidos paralelos de clientes diferentes pode passar um pouco do teto global (limite
 * documentado em docs/armazenamento.md); o espaco livre e medido de verdade a cada envio.
 */
async function assertServerCapacity(db: Db, deps: FileDeps, incomingBytes: number, now: Date, excludeAssetId?: string): Promise<void> {
  if (deps.globalQuotaBytes > 0) {
    const used = await withSystemScoped(db, systemContextForStorageCapacity(), (s) => globalStorageBytes(s, pendingSince(now), excludeAssetId));
    if (used + BigInt(incomingBytes) > BigInt(deps.globalQuotaBytes)) throw new InsufficientStorageError();
  }
  if (deps.minFreeBytes > 0) {
    const free = await deps.storage.freeBytes();
    if (free - incomingBytes < deps.minFreeBytes) throw new InsufficientStorageError();
  }
}

// ---------- nome original: so exibicao; sem controle nem inversao de texto, ate 255 ----------

const BAD_NAME = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/u;

export function validateOriginalName(name: string): void {
  if (name.length < 1 || name.length > 255 || BAD_NAME.test(name) || name.trim().length === 0) {
    throw new DomainRuleError("INVALID_NAME", "O nome do arquivo precisa ter de 1 a 255 caracteres, sem caracteres de controle.");
  }
}

function refusalToError(code: string): never {
  if (code === "TOO_LARGE") throw new PayloadTooLargeError();
  const messages: Record<string, string> = {
    BLOCKED_EXTENSION: "Tipo de arquivo nao permitido.",
    TYPE_NOT_ALLOWED: "Tipo de arquivo nao permitido. Envie JPEG, PNG, WebP, PDF, MP4, MOV ou WebM.",
    EMPTY: "O arquivo esta vazio.",
    TYPE_UNRECOGNIZED: "O conteudo do arquivo nao e de um tipo permitido.",
    TYPE_MISMATCH: "O conteudo do arquivo nao corresponde ao tipo informado.",
    EXTENSION_MISMATCH: "A extensao do arquivo nao corresponde ao conteudo.",
    SIZE_MISMATCH: "O tamanho recebido nao confere com o informado.",
    STORAGE_QUOTA_EXCEEDED: "A cota de armazenamento deste cliente acabou.",
  };
  throw new DomainRuleError(code, messages[code] ?? "Arquivo recusado.");
}

// ---------- 1) pedido de alvo de envio ----------

export interface UploadRequest {
  originalName: string;
  mimeType: string;
  bytes: number;
  visibility?: "INTERNO" | "COMPARTILHADO";
}

export interface UploadTarget {
  assetId: string;
  /** Caminho relativo na propria origem; o corpo do PUT sao os bytes do arquivo. */
  path: string;
  method: "PUT";
  expiresAt: string;
  maxBytes: number;
}

/** Cria o registro PENDENTE (chave aleatoria) e emite o alvo assinado, vinculado a este arquivo, cliente e pessoa. */
export async function requestUpload(db: Db, ctx: TenantContext, deps: FileDeps, input: UploadRequest): Promise<UploadTarget> {
  assertCan(ctx, "asset:upload");
  validateOriginalName(input.originalName);
  const declared = { originalName: input.originalName, mimeType: input.mimeType.trim().toLowerCase(), bytes: input.bytes };
  const check = checkAssetDeclaration(declared, deps.limits);
  if (!check.ok) refusalToError(check.code);
  const now = deps.now();
  const maxBytes = maxBytesFor(declared.mimeType, deps.limits)!;
  await assertServerCapacity(db, deps, declared.bytes, now);
  const asset = await withTenant(db, ctx, async (s) => {
    // Trava por cliente: sem ela, N pedidos paralelos leem o mesmo "ainda cabe" e todos passam do limite e da cota.
    await lockClientUploads(s);
    const since = pendingSince(now);
    if ((await countPendingUploads(s, since)) >= deps.maxPendingPerUser) throw new TooManyRequestsError(60);
    if (deps.clientQuotaBytes > 0 && (await clientStorageBytes(s, since)) + BigInt(declared.bytes) > BigInt(deps.clientQuotaBytes)) {
      throw new DomainRuleError("STORAGE_QUOTA_EXCEEDED", "A cota de armazenamento deste cliente acabou.");
    }
    const row = await insertPendingAsset(s, {
      storageKey: newStorageKey(ctx.clientId),
      originalName: declared.originalName,
      // Cliente so cria arquivo compartilhado; a agencia escolhe (padrao interno).
      visibility: isAgency(ctx) ? (input.visibility ?? "INTERNO") : "COMPARTILHADO",
      declaredMimeType: declared.mimeType,
      declaredBytes: declared.bytes,
    });
    return row;
  });
  const expiresAt = Math.floor(now.getTime() / 1000) + deps.uploadTtlSeconds;
  const token = signToken(deps.secret, { purpose: "upload", assetId: asset.id, clientId: ctx.clientId, userId: ctx.userId, expiresAt });
  return { assetId: asset.id, path: `/api/files/upload/${token}`, method: "PUT", expiresAt: new Date(expiresAt * 1000).toISOString(), maxBytes: Math.min(maxBytes, declared.bytes) };
}

// ---------- 2) recebimento dos bytes ----------

export interface UploadResult {
  id: string;
  status: "DISPONIVEL";
  bytes: number;
  mimeType: string;
  checksumSha256: string;
  replayed: boolean;
}

/** Token + sessao + reautorizacao: devolve o contexto do cliente do token, ou 404 (mesmo para qualquer falha de vinculo). */
async function authorizeToken(db: Db, deps: FileDeps, purpose: "upload" | "download", token: string, sessionUserId: string) {
  const checked = verifyToken(deps.secret, token, purpose);
  if (!checked.ok) throw new NotFoundError();
  const { claims } = checked;
  // Outra pessoa logada com o link na mao: nada a revelar.
  if (claims.userId !== sessionUserId) throw new NotFoundError();
  let ctx: TenantContext;
  try {
    ctx = await resolveTenantContext(db, { userId: sessionUserId, activeClientId: claims.clientId });
  } catch (error) {
    if (error instanceof ForbiddenError) throw new NotFoundError(); // perdeu o acesso: link antigo morre
    throw error;
  }
  // So agora, para a pessoa certa com acesso valido, o vencimento aparece como 410.
  if (isExpired(claims, deps.now())) throw new GoneError();
  return { ctx, claims };
}

export async function receiveUpload(
  db: Db,
  deps: FileDeps,
  input: { token: string; sessionUserId: string; body: ReadableStream<Uint8Array> | null; contentLength: number | null },
): Promise<UploadResult> {
  const { ctx, claims } = await authorizeToken(db, deps, "upload", input.token, input.sessionUserId);
  assertCan(ctx, "asset:upload");
  const asset = await withTenant(db, ctx, (s) => getOwnUpload(s, claims.assetId));
  if (!asset) throw new NotFoundError();
  const replay = (a: { id: string; mimeType: string | null; bytes: bigint | null; checksumSha256: string | null }): UploadResult => ({
    id: a.id,
    status: "DISPONIVEL",
    bytes: Number(a.bytes ?? 0),
    mimeType: a.mimeType ?? "",
    checksumSha256: a.checksumSha256 ?? "",
    replayed: true,
  });
  // Idempotente: repetir o envio de um arquivo ja finalizado devolve o mesmo resultado, sem gravar de novo.
  if (asset.status === "DISPONIVEL") {
    await input.body?.cancel().catch(() => undefined);
    return replay(asset);
  }
  if (asset.status !== "PENDENTE") {
    await input.body?.cancel().catch(() => undefined);
    throw new ConflictError("ASSET_NOT_PENDING", "Este envio ja foi encerrado. Peca um novo alvo de envio.");
  }
  const declaredMime = asset.mimeType ?? "";
  const declaredBytes = Number(asset.bytes ?? 0);
  const typeMax = maxBytesFor(declaredMime, deps.limits);
  if (!typeMax || declaredBytes <= 0) throw new DomainRuleError("TYPE_NOT_ALLOWED", "Tipo de arquivo nao permitido.");
  const maxBytes = Math.min(typeMax, declaredBytes);

  const reject = async (code: string): Promise<never> => {
    await deps.storage.delete(asset.storageKey).catch(() => undefined);
    await withTenant(db, ctx, async (s) => {
      if ((await markAssetRejected(s, asset.id)) === 1) {
        await recordAudit(s, { action: "asset.rejected", entityType: "asset", entityId: asset.id, diff: { reason: code } });
      }
    });
    return refusalToError(code);
  };

  // Recusa antecipada pelo Content-Length (sem ler um byte). Sem o cabecalho, o limite vale durante a gravacao.
  if (input.contentLength !== null && (input.contentLength <= 0 || input.contentLength > maxBytes)) {
    await input.body?.cancel().catch(() => undefined);
    return reject(input.contentLength <= 0 ? "EMPTY" : "TOO_LARGE");
  }
  if (!input.body) return reject("EMPTY");
  // Capacidade medida de novo AGORA (o pedido pode ter sido ha minutos): sem espaco, o alvo continua valendo para tentar depois.
  try {
    await assertServerCapacity(db, deps, maxBytes, deps.now(), asset.id);
  } catch (error) {
    await input.body.cancel().catch(() => undefined);
    throw error;
  }

  let stored;
  try {
    stored = await deps.storage.put(asset.storageKey, input.body, { maxBytes });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return reject("TOO_LARGE");
    if (error instanceof ConflictError) {
      // Outro envio do mesmo alvo ganhou a corrida: se ja finalizou, repete o resultado; senao, esta em andamento.
      const again = await withTenant(db, ctx, (s) => getOwnUpload(s, claims.assetId));
      if (again?.status === "DISPONIVEL") return replay(again);
      throw new ConflictError("UPLOAD_IN_PROGRESS", "Este arquivo ja esta sendo enviado.");
    }
    throw error; // interrompido (cliente caiu) ou armazenamento indisponivel: o temporario ja foi apagado, o registro segue PENDENTE
  }
  if (stored.bytes === 0) return reject("EMPTY");
  if (stored.bytes < declaredBytes) {
    // Envio incompleto: nada fica DISPONIVEL; o objeto sai e o alvo ainda vale para tentar de novo.
    await deps.storage.delete(asset.storageKey).catch(() => undefined);
    throw new DomainRuleError("INCOMPLETE_UPLOAD", "O envio terminou antes de o arquivo chegar inteiro. Envie de novo.");
  }
  const verdict = verifyUploadedType({ head: stored.head, declaredMime, originalName: asset.originalName });
  if (!verdict.ok) return reject(verdict.code);
  const check = checkAssetDeclaration({ originalName: asset.originalName, mimeType: verdict.mime, bytes: stored.bytes }, deps.limits);
  if (!check.ok) return reject(check.code);

  let overQuota = false;
  try {
    await withTenant(db, ctx, async (s) => {
      // Rechecagem da cota na FINALIZACAO, sob a mesma trava do pedido: a cota pode ter diminuido, ou o cliente pode ter
      // enchido o espaco por outro caminho, entre o pedido e o fim do envio.
      await lockClientUploads(s);
      if (deps.clientQuotaBytes > 0) {
        const others = await clientStorageBytes(s, pendingSince(deps.now()), asset.id);
        if (others + BigInt(stored.bytes) > BigInt(deps.clientQuotaBytes)) {
          overQuota = true;
          return;
        }
      }
      const count = await markAssetAvailable(s, asset.id, {
        mimeType: verdict.mime,
        category: check.category,
        bytes: stored.bytes,
        checksumSha256: stored.checksumSha256,
        finalizedAt: deps.now(),
      });
      if (count !== 1) throw new ConflictError("ASSET_NOT_PENDING", "Este envio ja foi encerrado.");
      await recordAudit(s, { action: "asset.finalized", entityType: "asset", entityId: asset.id, diff: { category: check.category, bytes: stored.bytes, mimeType: verdict.mime } });
    });
  } catch (error) {
    // Nunca fica DISPONIVEL sem objeto, nem objeto solto sem registro valido.
    await deps.storage.delete(asset.storageKey).catch(() => undefined);
    throw error;
  }
  if (overQuota) return reject("STORAGE_QUOTA_EXCEEDED");
  return { id: asset.id, status: "DISPONIVEL", bytes: stored.bytes, mimeType: verdict.mime, checksumSha256: stored.checksumSha256, replayed: false };
}

// ---------- 3) link de download ----------

export interface DownloadLink {
  path: string;
  expiresAt: string;
}

/** Emite o link so depois de assertCan e de conferir que o arquivo e DISPONIVEL e visivel para esta pessoa neste cliente. */
export async function requestDownload(db: Db, ctx: TenantContext, deps: FileDeps, assetId: string): Promise<DownloadLink> {
  assertCan(ctx, "asset:read");
  await authorizeDownload(db, ctx, assetId, { audit: true }); // 404 se nao existe/nao e do cliente/nao DISPONIVEL/nao visivel; 423 em quarentena; grava `asset.download_link_issued`
  const expiresAt = Math.floor(deps.now().getTime() / 1000) + deps.downloadTtlSeconds;
  const token = signToken(deps.secret, { purpose: "download", assetId, clientId: ctx.clientId, userId: ctx.userId, expiresAt });
  return { path: `/api/files/download/${token}`, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export interface DeliveredFile {
  stream: ReadableStream<Uint8Array>;
  bytes: number;
  mimeType: string;
  originalName: string;
}

/** Entrega: reconfere assinatura, pessoa, participacao ativa e visibilidade a CADA requisicao. */
export async function deliverDownload(db: Db, deps: FileDeps, input: { token: string; sessionUserId: string }): Promise<DeliveredFile> {
  const { ctx, claims } = await authorizeToken(db, deps, "download", input.token, input.sessionUserId);
  assertCan(ctx, "asset:read");
  const row = await authorizeDownload(db, ctx, claims.assetId);
  const opened = await deps.storage.open(row.storageKey);
  if (!opened) {
    // Objeto sumiu: 404 honesto e registro no log (sem chave nem caminho).
    console.error(`[nexo] arquivo ausente no armazenamento asset=${claims.assetId}`);
    throw new NotFoundError();
  }
  return { stream: opened.stream, bytes: opened.bytes, mimeType: row.mimeType ?? "application/octet-stream", originalName: row.originalName };
}

// ---------- 4) exclusao e limpeza ----------

/** Exclusao logica (so quem enviou ou ADMIN; nunca arquivo de versao enviada: gatilho) e remocao do objeto em seguida. */
export async function removeAsset(db: Db, ctx: TenantContext, deps: FileDeps, assetId: string) {
  const key = await withTenant(db, ctx, async (s) => {
    const row = await s.tx.asset.findFirst({ where: { id: assetId, clientId: ctx.clientId, status: { in: ["PENDENTE", "DISPONIVEL"] } }, select: { storageKey: true } });
    if (!row) throw new NotFoundError();
    if ((await markAssetDeleted(s, assetId, deps.now())) !== 1) throw new NotFoundError();
    await recordAudit(s, { action: "asset.deleted", entityType: "asset", entityId: assetId });
    return row.storageKey;
  });
  // Falha ao apagar o objeto fica no log e a limpeza periodica refaz (idempotente).
  await deps.storage.delete(key).catch(() => console.error(`[nexo] falha ao remover objeto de arquivo excluido asset=${assetId}`));
}

export interface CleanupReport {
  pendingExpired: number;
  deletedObjectsRemoved: number;
  /** Objetos sem registro movidos para a lixeira (`.trash/`), de onde podem ser restaurados. */
  orphanObjectsTrashed: number;
  /** Objetos que ja estavam na lixeira ha mais que a retencao e foram apagados de verdade. */
  trashPurged: number;
  tempRemoved: number;
}

export interface CleanupOptions extends Partial<CleanupLimits> {
  now?: Date;
  batch?: number;
}

// ---------- instalacao: banco e pasta precisam ser do MESMO sistema antes de qualquer limpeza (M-A) ----------

const INSTALL_KEY = "installation_id";

async function readDbInstallId(db: Db): Promise<string | null> {
  const row = await withSystemScoped(db, systemContextForMaintenance(), (s) => s.tx.appSetting.findUnique({ where: { key: INSTALL_KEY }, select: { value: true } }));
  return row?.value ?? null;
}

/** Confere o identificador do banco com o `.install-id` da pasta. Falta ou divergencia: CleanupAbortedError, nada e tocado. */
export async function assertInstallationMatches(db: Db, storage: ObjectStorage): Promise<void> {
  const decision = decideInstallBinding(await readDbInstallId(db), await storage.readInstallId(), false);
  if (decision.action === "abort") throw new CleanupAbortedError(decision.code, decision.message);
}

/**
 * Vinculo EXPLICITO (so por pedido de quem opera, flag `--vincular-instalacao`): grava o identificador que falta,
 * do lado que falta. Se os dois existem e diferem, recusa SEMPRE (sao instalacoes diferentes). Nunca e chamado
 * por `cleanupFiles`: limpeza nunca cria identificador sozinha.
 */
export async function bindInstallation(db: Db, storage: ObjectStorage): Promise<"ok" | "file-created" | "database-created" | "both-created"> {
  const decision = decideInstallBinding(await readDbInstallId(db), await storage.readInstallId(), true);
  const addToDb = (id: string) => withSystemScoped(db, systemContextForMaintenance(), (s) => s.tx.appSetting.create({ data: { key: INSTALL_KEY, value: id } }));
  switch (decision.action) {
    case "ok":
      return "ok";
    case "abort":
      throw new CleanupAbortedError(decision.code, decision.message);
    case "write-file":
      await storage.writeInstallId(decision.id);
      return "file-created";
    case "write-db":
      await addToDb(decision.id);
      return "database-created";
    case "create-both": {
      const id = randomUUID();
      await addToDb(id);
      await storage.writeInstallId(id);
      return "both-created";
    }
  }
}

/** Devolve da lixeira para o lugar de origem (restauravel ate a retencao acabar). false se nao esta la. */
export async function restoreTrashedObject(storage: ObjectStorage, key: string): Promise<boolean> {
  return storage.restoreFromTrash(key);
}

/**
 * Limpeza idempotente (comando `scripts/limpar-arquivos.ts`, ver docs/armazenamento.md). ANTES de qualquer coisa:
 * opcoes validas (minimo 1 hora) e identificador da instalacao igual no banco e na pasta. Depois:
 * 1) PENDENTE com mais de N h vira EXCLUIDO (abandonado) e seu objeto sai;
 * 2) EXCLUIDO ou REJEITADO recentes: garante que o objeto nao existe mais;
 * 3) temporario de envio com mais de N h sai; objeto de arquivo ja EXCLUIDO/REJEITADO sai;
 *    objeto SEM REGISTRO ("orfao") vai para a LIXEIRA (nao e apagado), e so se o numero de orfaos for plausivel:
 *    acima do teto, da proporcao, ou com o banco sem nenhum arquivo DISPONIVEL, a limpeza aborta sem mover nada;
 * 4) o que esta na lixeira ha mais que a retencao (padrao 30 dias) e apagado de verdade.
 * Nunca toca objeto de arquivo DISPONIVEL. Rodar duas vezes seguidas nao muda nada na segunda.
 */
export async function cleanupFiles(db: Db, storage: ObjectStorage, opts: CleanupOptions = {}): Promise<CleanupReport> {
  const limits = resolveCleanupLimits(opts, PENDING_MAX_AGE_HOURS);
  await assertInstallationMatches(db, storage);
  const now = opts.now ?? new Date();
  const olderThanMs = limits.maxAgeHours * HOUR;
  const batch = Math.min(Math.max(opts.batch ?? 500, 1), 5000);
  const cutoff = new Date(now.getTime() - olderThanMs);
  const sys = systemContextForMaintenance();
  const report: CleanupReport = { pendingExpired: 0, deletedObjectsRemoved: 0, orphanObjectsTrashed: 0, trashPurged: 0, tempRemoved: 0 };

  // 1) pendentes abandonados
  const stale = await withSystemScoped(db, sys, (s) =>
    s.tx.asset.findMany({ where: { status: "PENDENTE", createdAt: { lt: cutoff } }, select: { id: true, clientId: true, storageKey: true }, take: batch, orderBy: { createdAt: "asc" } }),
  );
  for (const a of stale) {
    await storage.delete(a.storageKey);
    await withSystemScoped(db, sys, async (s) => {
      const { count } = await s.tx.asset.updateMany({ where: { id: a.id, status: "PENDENTE" }, data: { status: "EXCLUIDO", deletedAt: now } });
      if (count === 1) await recordSystemAudit(s, { action: "asset.pending_purged", entityType: "asset", entityId: a.id, clientId: a.clientId });
    });
    report.pendingExpired += 1;
  }

  // 2) arquivos encerrados: o objeto precisa ter sumido (so conta como removido o que existia)
  const closed = await withSystemScoped(db, sys, (s) =>
    s.tx.asset.findMany({
      where: { status: { in: ["EXCLUIDO", "REJEITADO"] }, createdAt: { gte: new Date(now.getTime() - 30 * 24 * HOUR) } },
      select: { storageKey: true },
      take: batch,
      orderBy: { createdAt: "desc" },
    }),
  );
  for (const a of closed) {
    if (await storage.open(a.storageKey).then(async (o) => { await o?.stream.cancel(); return o !== null; })) {
      await storage.delete(a.storageKey);
      report.deletedObjectsRemoved += 1;
    }
  }

  // 3) temporarios velhos, objetos de arquivo encerrado e orfaos (sem registro). Orfao so e MOVIDO depois de a conta fechar.
  const orphans: string[] = [];
  let totalObjects = 0;
  for await (const obj of storage.list({ olderThanMs: 0, now })) {
    if (obj.key.startsWith(".tmp/")) {
      if (obj.modifiedAt.getTime() < cutoff.getTime()) {
        await storage.delete(obj.key);
        report.tempRemoved += 1;
      }
      continue;
    }
    totalObjects += 1;
    if (obj.modifiedAt.getTime() >= cutoff.getTime()) continue; // recente: pode ser envio em andamento
    const row = await withSystemScoped(db, sys, (s) => s.tx.asset.findFirst({ where: { storageKey: obj.key }, select: { status: true } }));
    if (!row) {
      orphans.push(obj.key);
      // Teto absoluto estourado: nao ha por que continuar listando; nada foi movido ate aqui.
      if (orphans.length > limits.maxOrphans) break;
    } else if (row.status === "EXCLUIDO" || row.status === "REJEITADO") {
      await storage.delete(obj.key);
      report.deletedObjectsRemoved += 1;
    }
  }
  if (orphans.length > 0) {
    const availableInDb = await withSystemScoped(db, sys, (s) => s.tx.asset.count({ where: { status: "DISPONIVEL" } }));
    const abort = assessOrphans({ totalObjects, orphans: orphans.length, availableInDb }, limits);
    if (abort) throw abort;
    for (const key of orphans) {
      if (await storage.moveToTrash(key, now)) report.orphanObjectsTrashed += 1;
    }
  }

  // 4) lixeira: so depois da retencao o objeto e apagado de verdade
  const trashCutoff = now.getTime() - limits.trashRetentionDays * 24 * HOUR;
  for await (const t of storage.listTrash()) {
    if (t.trashedAt.getTime() < trashCutoff) {
      await storage.deleteFromTrash(t.key);
      report.trashPurged += 1;
    }
  }
  return report;
}
