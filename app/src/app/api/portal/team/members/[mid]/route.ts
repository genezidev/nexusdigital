import { portalCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/team";

export const PATCH = route<{ mid: string }>(async (req, { params, requestId }) => {
  const a = await portalCtx(req);
  return h.patchMember(a, req, params.mid, requestId);
});
