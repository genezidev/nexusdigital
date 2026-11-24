import { portalCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/content";

export const POST = route<{ cid: string; vid: string }>(async (req, { params, requestId }) => {
  const a = await portalCtx(req);
  return h.postDecision(a, req, params.cid, params.vid, requestId);
});
