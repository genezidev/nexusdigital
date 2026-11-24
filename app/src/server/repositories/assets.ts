import type { AssetCategory, AssetLinkRole, Visibility } from "@/generated/prisma/enums";
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

export async function insertPendingAsset(s: Scoped, data: { storageKey: string; originalName: string; visibility: Visibility }) {
  assertCan(s.ctx, "asset:upload");
  return s.tx.asset.create({ data: { ...data, clientId: s.ctx.clientId, uploadedById: s.ctx.userId } });
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
