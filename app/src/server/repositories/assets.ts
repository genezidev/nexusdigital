import type { Prisma } from "@/generated/prisma/client";
import type { AssetCategory, AssetLinkRole, AssetStatus, Visibility } from "@/generated/prisma/enums";
import { assertCan, isAgency } from "@/server/authorization/permissions";
import type { Scoped } from "@/server/db/scope";

// Arquivos privados. O cliente ve o que ele mesmo enviou e o que esta ligado a um destino que ele ve.
// storage_key nunca sai daqui para o cliente: o download passa por URL assinada gerada depois da autorizacao.

const assetClientSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  category: true,
  bytes: true,
  status: true,
  createdAt: true,
} as const;

const assetAgencySelect = {
  ...assetClientSelect,
  visibility: true,
  scanStatus: true,
  checksumSha256: true,
  uploadedById: true,
  finalizedAt: true,
} as const;

export async function getAsset(s: Scoped, id: string) {
  assertCan(s.ctx, "asset:read");
  const where = { id, clientId: s.ctx.clientId, status: { not: "EXCLUIDO" as const } };
  if (isAgency(s.ctx)) return s.tx.asset.findFirst({ where });
  return s.tx.asset.findFirst({
    where: { ...where, visibility: "COMPARTILHADO", OR: [{ uploadedById: s.ctx.userId }, { status: "DISPONIVEL", links: { some: {} } }] },
    select: assetClientSelect,
  });
}

/** Chave de armazenamento para emitir a URL assinada: so depois de getAsset (autorizacao + cliente) devolver o arquivo. */
export async function getStorageKeyForDownload(s: Scoped, id: string) {
  const asset = await getAsset(s, id);
  if (!asset || asset.status !== "DISPONIVEL") return null;
  const row = await s.tx.asset.findFirst({ where: { id, clientId: s.ctx.clientId }, select: { storageKey: true, mimeType: true, originalName: true } });
  return row;
}

export async function insertPendingAsset(
  s: Scoped,
  data: { storageKey: string; originalName: string; visibility: Visibility; declaredMimeType?: string; declaredBytes?: number },
) {
  assertCan(s.ctx, "asset:upload");
  const { declaredMimeType, declaredBytes, ...rest } = data;
  // Enquanto PENDENTE, mime_type e bytes guardam o que a pessoa DECLAROU; ao finalizar sao trocados pelo que o servidor mediu.
  return s.tx.asset.create({
    data: { ...rest, clientId: s.ctx.clientId, uploadedById: s.ctx.userId, mimeType: declaredMimeType, bytes: declaredBytes === undefined ? undefined : BigInt(declaredBytes) },
  });
}

/** Linha completa do envio da PROPRIA pessoa (qualquer estado): so quem criou o alvo de envio escreve nele. */
export async function getOwnUpload(s: Scoped, id: string) {
  assertCan(s.ctx, "asset:upload");
  return s.tx.asset.findFirst({ where: { id, clientId: s.ctx.clientId, uploadedById: s.ctx.userId } });
}

export async function countPendingUploads(s: Scoped, since: Date): Promise<number> {
  assertCan(s.ctx, "asset:upload");
  return s.tx.asset.count({ where: { clientId: s.ctx.clientId, uploadedById: s.ctx.userId, status: "PENDENTE", createdAt: { gte: since } } });
}

/** Bytes ocupados pelo cliente: arquivos DISPONIVEIS (medidos) mais pendentes recentes (declarados). */
export async function clientStorageBytes(s: Scoped, pendingSince: Date): Promise<bigint> {
  assertCan(s.ctx, "asset:upload");
  const agg = await s.tx.asset.aggregate({
    where: { clientId: s.ctx.clientId, OR: [{ status: "DISPONIVEL" }, { status: "PENDENTE", createdAt: { gte: pendingSince } }] },
    _sum: { bytes: true },
  });
  return agg._sum.bytes ?? BigInt(0);
}

export async function rejectPendingAsset(s: Scoped, id: string) {
  return markAssetRejected(s, id);
}

export interface AssetPageQuery {
  page: number;
  pageSize: number;
  status?: AssetStatus;
  category?: AssetCategory;
  q?: string;
  sort: "createdAt" | "originalName" | "bytes";
  dir: "asc" | "desc";
  targetVersionId?: string;
  targetScriptId?: string;
  targetRecordingId?: string;
}

/** Listagem paginada. Cliente: so o que ele ve (RLS e `getAsset` aplicam as mesmas regras); nunca storage_key. */
export async function pageAssets(s: Scoped, q: AssetPageQuery) {
  assertCan(s.ctx, "asset:read");
  const target = {
    ...(q.targetVersionId ? { versionId: q.targetVersionId } : {}),
    ...(q.targetScriptId ? { scriptId: q.targetScriptId } : {}),
    ...(q.targetRecordingId ? { recordingId: q.targetRecordingId } : {}),
  };
  const agency = isAgency(s.ctx);
  const where: Prisma.AssetWhereInput = {
    clientId: s.ctx.clientId,
    status: q.status ?? (agency ? { not: "EXCLUIDO" } : { in: ["PENDENTE", "DISPONIVEL"] }),
    ...(q.category ? { category: q.category } : {}),
    ...(q.q ? { originalName: { contains: q.q, mode: "insensitive" as const } } : {}),
    ...(Object.keys(target).length ? { links: { some: target } } : {}),
    ...(agency ? {} : { visibility: "COMPARTILHADO" as const, OR: [{ uploadedById: s.ctx.userId }, { status: "DISPONIVEL" as const, links: { some: {} } }] }),
  };
  const orderBy = [{ [q.sort]: q.dir } as Prisma.AssetOrderByWithRelationInput, { id: "asc" as const }];
  const [items, total] = await Promise.all([
    s.tx.asset.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: agency ? assetAgencySelect : assetClientSelect }),
    s.tx.asset.count({ where }),
  ]);
  return { items, total };
}

export async function markAssetAvailable(s: Scoped, id: string, data: { mimeType: string; category: AssetCategory; bytes: number; checksumSha256: string; finalizedAt: Date }) {
  assertCan(s.ctx, "asset:upload");
  const { count } = await s.tx.asset.updateMany({
    where: { id, clientId: s.ctx.clientId, status: "PENDENTE", ...(isAgency(s.ctx) ? {} : { uploadedById: s.ctx.userId }) },
    data: { ...data, bytes: BigInt(data.bytes), status: "DISPONIVEL" },
  });
  return count;
}

export async function markAssetRejected(s: Scoped, id: string) {
  assertCan(s.ctx, "asset:upload");
  const { count } = await s.tx.asset.updateMany({
    where: { id, clientId: s.ctx.clientId, status: "PENDENTE", ...(isAgency(s.ctx) ? {} : { uploadedById: s.ctx.userId }) },
    data: { status: "REJEITADO" },
  });
  return count;
}

/** Exclusao logica: so quem enviou ou ADMIN (asset:delete_any). O gatilho recusa arquivo ligado a versao enviada. */
export async function markAssetDeleted(s: Scoped, id: string, deletedAt: Date) {
  const own = await s.tx.asset.findFirst({ where: { id, clientId: s.ctx.clientId, uploadedById: s.ctx.userId }, select: { id: true } });
  if (!own) assertCan(s.ctx, "asset:delete_any");
  else assertCan(s.ctx, "asset:upload");
  const { count } = await s.tx.asset.updateMany({
    where: { id, clientId: s.ctx.clientId, status: { in: ["PENDENTE", "DISPONIVEL"] } },
    data: { status: "EXCLUIDO", deletedAt },
  });
  return count;
}

export type LinkTarget = { versionId: string } | { scriptId: string } | { recordingId: string } | { contentId: string };

export async function insertLink(s: Scoped, data: { assetId: string; role: AssetLinkRole; position?: number } & LinkTarget) {
  if (data.role === "GRAVACAO") assertCan(s.ctx, "recording:submit");
  else assertCan(s.ctx, "asset:attach");
  return s.tx.assetLink.create({ data: { ...data, clientId: s.ctx.clientId } });
}

export async function removeLink(s: Scoped, id: string) {
  assertCan(s.ctx, "asset:attach");
  const { count } = await s.tx.assetLink.deleteMany({ where: { id, clientId: s.ctx.clientId } });
  return count;
}

export async function reorderLink(s: Scoped, id: string, position: number) {
  assertCan(s.ctx, "asset:attach");
  const { count } = await s.tx.assetLink.updateMany({ where: { id, clientId: s.ctx.clientId }, data: { position } });
  return count;
}

/** Vinculo de arquivo a um destino visivel para quem pede (RLS filtra); devolve so ids e funcao. */
export async function findLink(s: Scoped, id: string) {
  assertCan(s.ctx, "asset:read");
  return s.tx.assetLink.findFirst({ where: { id, clientId: s.ctx.clientId }, select: { id: true, assetId: true, role: true, position: true, versionId: true, scriptId: true, recordingId: true, contentId: true } });
}

/**
 * Arquivos ligados a destinos (versoes, roteiro, gravacoes), so os DISPONIVEIS e visiveis para quem pede.
 * Cliente: so arquivo COMPARTILHADO (a RLS repete a regra). Nunca devolve storage_key.
 */
export async function listLinkedAssets(s: Scoped, where: Prisma.AssetLinkWhereInput) {
  assertCan(s.ctx, "asset:read");
  const agency = isAgency(s.ctx);
  const links = await s.tx.assetLink.findMany({
    where: { clientId: s.ctx.clientId, ...where },
    select: { id: true, assetId: true, role: true, position: true, versionId: true, scriptId: true, recordingId: true, contentId: true },
    orderBy: [{ role: "asc" }, { position: "asc" }, { id: "asc" }],
  });
  if (links.length === 0) return [];
  const assets = await s.tx.asset.findMany({
    where: { id: { in: [...new Set(links.map((l) => l.assetId))] }, clientId: s.ctx.clientId, status: "DISPONIVEL", ...(agency ? {} : { visibility: "COMPARTILHADO" as const }) },
    select: agency ? assetAgencySelect : assetClientSelect,
  });
  const byId = new Map(assets.map((a) => [a.id, a]));
  return links.flatMap((l) => {
    const asset = byId.get(l.assetId);
    return asset ? [{ link: l, asset }] : [];
  });
}

export async function setAssetVisibility(s: Scoped, id: string, visibility: Visibility) {
  assertCan(s.ctx, "asset:attach");
  const { count } = await s.tx.asset.updateMany({ where: { id, clientId: s.ctx.clientId, status: { in: ["PENDENTE", "DISPONIVEL"] } }, data: { visibility } });
  return count;
}

export async function listLinks(s: Scoped, target: LinkTarget) {
  assertCan(s.ctx, "asset:read");
  return s.tx.assetLink.findMany({
    where: { clientId: s.ctx.clientId, ...target },
    select: { id: true, assetId: true, role: true, position: true, versionId: true, scriptId: true, recordingId: true, contentId: true },
    orderBy: [{ role: "asc" }, { position: "asc" }],
  });
}

export async function countEvidence(s: Scoped, contentId: string): Promise<number> {
  assertCan(s.ctx, "content:read");
  return s.tx.assetLink.count({ where: { clientId: s.ctx.clientId, contentId, role: "EVIDENCIA" } });
}
