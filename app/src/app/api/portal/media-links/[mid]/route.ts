import { portalCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/media-links";

export const DELETE = route<{ mid: string }>(async (req, { params, requestId }) => {
  const a = await portalCtx(req);
  return h.deleteLinkResponse(a, params.mid, requestId);
});
