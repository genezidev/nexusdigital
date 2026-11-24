import { getDb } from "@/server/db/client";
import { NotFoundError } from "@/server/errors";
import { requireAdmin } from "@/server/http/actor";
import { parseBody, route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { isUuid, resolveAdminClientContext } from "@/server/services/access";
import { setMemberAccountBlocked } from "@/server/services/members";
import { blockSchema } from "@/lib/schemas";

// Bloqueia ou desbloqueia a conta da pessoa (e derruba as sessoes ao bloquear). So ADMIN.
export const PUT = route<{ id: string; memberId: string }>(async (req, { params, requestId }) => {
  const actor = await requireAdmin(req.headers);
  const { blocked } = await parseBody(req, blockSchema);
  const db = getDb();
  const ctx = await resolveAdminClientContext(db, actor, params.id);
  if (!isUuid(params.memberId)) throw new NotFoundError();
  const result = await setMemberAccountBlocked(db, ctx, params.memberId, blocked);
  return json(result, 200, requestId);
});
