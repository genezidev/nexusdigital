import type { Prisma } from "@/generated/prisma/client";
import type { MediaKind } from "@/generated/prisma/enums";
import { assertCan } from "@/server/authorization/permissions";
import type { Scoped } from "@/server/db/scope";

// Links de midia externos (D-0025). Toda consulta leva client_id = cliente da sessao; a RLS repete a visibilidade
// (o cliente so ve link de destino que ele ve). `created_by_id` nunca e devolvido ao portal.

const select = {
  id: true,
  versionId: true,
  scriptId: true,
  recordingId: true,
  label: true,
  url: true,
  host: true,
  kind: true,
  createdById: true,
  createdAt: true,
} as const;

export type MediaTarget = { versionId: string } | { scriptId: string } | { recordingId: string };

export async function listMediaLinks(s: Scoped, where: Prisma.MediaLinkWhereInput) {
  assertCan(s.ctx, "media_link:read");
  return s.tx.mediaLink.findMany({ where: { ...where, clientId: s.ctx.clientId }, select, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 500 });
}

export async function getMediaLink(s: Scoped, id: string) {
  assertCan(s.ctx, "media_link:read");
  return s.tx.mediaLink.findFirst({ where: { id, clientId: s.ctx.clientId }, select });
}

export async function insertMediaLink(s: Scoped, data: { label: string; url: string; host: string; kind: MediaKind } & MediaTarget) {
  assertCan(s.ctx, "media_link:create");
  // clientId e autor vem SEMPRE do contexto da sessao.
  return s.tx.mediaLink.create({ data: { ...data, clientId: s.ctx.clientId, createdById: s.ctx.userId }, select });
}

export async function deleteMediaLink(s: Scoped, id: string): Promise<number> {
  assertCan(s.ctx, "media_link:remove");
  return (await s.tx.mediaLink.deleteMany({ where: { id, clientId: s.ctx.clientId } })).count;
}
