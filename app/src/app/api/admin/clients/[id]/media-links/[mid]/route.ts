import { adminCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/media-links";

export const DELETE = route<{ id: string; mid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.deleteLinkResponse(a, params.mid, requestId);
});
