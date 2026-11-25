import { portalCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/team";

export const GET = route<Record<string, never>>(async (req, { requestId }) => {
  const a = await portalCtx(req);
  return h.getTeam(a, requestId);
});
