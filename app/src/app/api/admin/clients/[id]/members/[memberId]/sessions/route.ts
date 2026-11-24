import { getDb } from "@/server/db/client";
import { NotFoundError } from "@/server/errors";
import { requireAdmin } from "@/server/http/actor";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { isUuid, resolveAdminClientContext } from "@/server/services/access";
import { revokeMemberSessions } from "@/server/services/members";

// Encerra todas as sessoes da pessoa. So ADMIN.
export const DELETE = route<{ id: string; memberId: string }>(async (req, { params, requestId }) => {
  const actor = await requireAdmin(req.headers);
  const db = getDb();
  const ctx = await resolveAdminClientContext(db, actor, params.id);
  if (!isUuid(params.memberId)) throw new NotFoundError();
  const result = await revokeMemberSessions(db, ctx, params.memberId);
  return json(result, 200, requestId);
});
