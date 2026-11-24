import { getDb } from "@/server/db/client";
import { NotFoundError } from "@/server/errors";
import { requireAdmin } from "@/server/http/actor";
import { route } from "@/server/http/handler";
import { resolveAdminClientContext, isUuid } from "@/server/services/access";
import { revokePendingInvitation } from "@/server/services/members";

// Revoga um convite pendente do cliente alvo. Id de convite de OUTRO cliente nao casa com o filtro
// por cliente da sessao (revokeInvitation) e responde 404.
export const DELETE = route<{ id: string; invitationId: string }>(async (req, { params }) => {
  const actor = await requireAdmin(req.headers);
  const db = getDb();
  const ctx = await resolveAdminClientContext(db, actor, params.id);
  if (!isUuid(params.invitationId)) throw new NotFoundError();
  await revokePendingInvitation(db, ctx, params.invitationId);
  return new Response(null, { status: 204 });
});
