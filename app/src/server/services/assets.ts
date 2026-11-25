import type { AssetLinkRole, Visibility } from "@/generated/prisma/enums";
import type { TenantContext } from "@/server/authorization/context";
import { assertCan, isAgency } from "@/server/authorization/permissions";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/scope";
import { checkAssetDeclaration, hasBlockedExtension } from "@/server/domain/asset-policy";
import { AssetQuarantinedError, DomainRuleError, NotFoundError } from "@/server/errors";
import {
  getAsset,
  getStorageKeyForDownload,
  insertLink,
  insertPendingAsset,
  markAssetAvailable,
  markAssetDeleted,
  markAssetRejected,
  removeLink,
  reorderLink,
  setAssetVisibility,
  type LinkTarget,
} from "@/server/repositories/assets";
import { recordAudit } from "@/server/repositories/audit";
import { newStorageKey } from "@/server/storage/keys";

// Registro dos arquivos. O trafego de bytes e a conferencia do tipo real (assinatura do arquivo) pertencem ao
// backend de arquivos (R-5, proximo item): aqui ficam o registro, o estado, a politica de tipo/tamanho e os vinculos.

/** Cria o registro PENDENTE com chave aleatoria; PENDENTE nunca aparece nem baixa para o cliente. */
export async function createPendingAsset(db: Db, ctx: TenantContext, input: { originalName: string }) {
  assertCan(ctx, "asset:upload");
  if (hasBlockedExtension(input.originalName)) throw new DomainRuleError("BLOCKED_EXTENSION", "Tipo de arquivo nao permitido.");
  return withTenant(db, ctx, async (s) => {
    const row = await insertPendingAsset(s, {
      storageKey: newStorageKey(ctx.clientId),
      originalName: input.originalName,
      visibility: isAgency(ctx) ? "INTERNO" : "COMPARTILHADO",
    });
    return { id: row.id, storageKey: row.storageKey };
  });
}

/** Finaliza: so com tipo e tamanho dentro da politica e checksum conferido pelo servidor; senao REJEITADO. */
export async function finalizeAsset(db: Db, ctx: TenantContext, assetId: string, measured: { mimeType: string; bytes: number; checksumSha256: string }, now: Date = new Date()) {
  assertCan(ctx, "asset:upload");
  const outcome = await withTenant(db, ctx, async (s) => {
    const asset = await getAsset(s, assetId);
    if (!asset) throw new NotFoundError();
    const check = checkAssetDeclaration({ originalName: asset.originalName, ...measured });
    if (!check.ok) {
      // A recusa PRECISA ser gravada (estado REJEITADO e auditoria): por isso o erro sai depois do commit.
      await markAssetRejected(s, assetId);
      await recordAudit(s, { action: "asset.rejected", entityType: "asset", entityId: assetId, diff: { reason: check.code } });
      return { ok: false as const, code: check.code };
    }
    if ((await markAssetAvailable(s, assetId, { ...measured, category: check.category, finalizedAt: now })) !== 1) {
      throw new DomainRuleError("ASSET_NOT_PENDING", "O arquivo nao esta pendente.");
    }
    await recordAudit(s, { action: "asset.finalized", entityType: "asset", entityId: assetId, diff: { category: check.category, bytes: measured.bytes } });
    return { ok: true as const, id: assetId, category: check.category };
  });
  if (!outcome.ok) throw new DomainRuleError(outcome.code, "Arquivo recusado.");
  return { id: outcome.id, category: outcome.category };
}

export async function deleteAsset(db: Db, ctx: TenantContext, assetId: string, now: Date = new Date()) {
  return withTenant(db, ctx, async (s) => {
    if ((await markAssetDeleted(s, assetId, now)) !== 1) throw new NotFoundError();
    await recordAudit(s, { action: "asset.deleted", entityType: "asset", entityId: assetId });
  });
}

export async function attachAsset(db: Db, ctx: TenantContext, input: { assetId: string; role: AssetLinkRole; position?: number } & LinkTarget) {
  return withTenant(db, ctx, async (s) => {
    if (!(await getAsset(s, input.assetId))) throw new NotFoundError();
    const link = await insertLink(s, input);
    await recordAudit(s, { action: "asset.attached", entityType: "asset", entityId: input.assetId, diff: { role: input.role, linkId: link.id } });
    return { id: link.id };
  });
}

export async function detachAsset(db: Db, ctx: TenantContext, linkId: string) {
  return withTenant(db, ctx, async (s) => {
    if ((await removeLink(s, linkId)) !== 1) throw new NotFoundError();
    await recordAudit(s, { action: "asset.detached", entityType: "asset_link", entityId: linkId });
  });
}

export async function changeAssetVisibility(db: Db, ctx: TenantContext, assetId: string, visibility: Visibility) {
  return withTenant(db, ctx, async (s) => {
    if ((await setAssetVisibility(s, assetId, visibility)) !== 1) throw new NotFoundError();
    await recordAudit(s, { action: "asset.visibility_changed", entityType: "asset", entityId: assetId, diff: { visibility } });
  });
}

export async function reorderAsset(db: Db, ctx: TenantContext, linkId: string, position: number) {
  return withTenant(db, ctx, async (s) => {
    if ((await reorderLink(s, linkId, position)) !== 1) throw new NotFoundError();
  });
}

/**
 * Autoriza o download: devolve a chave SO se o arquivo e DISPONIVEL e visivel para esta pessoa neste cliente, e
 * recusa (423) arquivo em QUARENTENA. Com `audit`, grava na MESMA transacao que o link foi emitido (sem token, sem chave).
 */
export async function authorizeDownload(db: Db, ctx: TenantContext, assetId: string, opts: { audit?: boolean } = {}) {
  assertCan(ctx, "asset:read");
  return withTenant(db, ctx, async (s) => {
    const row = await getStorageKeyForDownload(s, assetId);
    if (!row) throw new NotFoundError();
    if (row.scanStatus === "QUARENTENA") throw new AssetQuarantinedError();
    if (opts.audit) await recordAudit(s, { action: "asset.download_link_issued", entityType: "asset", entityId: assetId });
    return row;
  });
}
