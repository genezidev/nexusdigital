import { portalCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/content";

export const GET = route<{ cid: string }>(async (req, { params, requestId }) => {
  const a = await portalCtx(req);
  return h.getContentDetailResponse(a, params.cid, requestId);
});
