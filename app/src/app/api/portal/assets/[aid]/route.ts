import { portalCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/files";

export const GET = route<{ aid: string }>(async (req, { params, requestId }) => {
  const a = await portalCtx(req);
  return h.getAssetResponse(a, params.aid, requestId);
});

export const DELETE = route<{ aid: string }>(async (req, { params, requestId }) => {
  const a = await portalCtx(req);
  return h.deleteAssetResponse(a, params.aid, requestId);
});
