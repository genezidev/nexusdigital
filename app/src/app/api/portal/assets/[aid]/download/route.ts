import { portalCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/files";

export const POST = route<{ aid: string }>(async (req, { params, requestId }) => {
  const a = await portalCtx(req);
  return h.postDownloadLink(a, params.aid, requestId);
});
