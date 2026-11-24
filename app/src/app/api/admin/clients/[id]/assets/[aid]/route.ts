import { adminCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/files";

export const GET = route<{ id: string; aid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.getAssetResponse(a, params.aid, requestId);
});

export const PATCH = route<{ id: string; aid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.patchAssetResponse(a, req, params.aid, requestId);
});

export const DELETE = route<{ id: string; aid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.deleteAssetResponse(a, params.aid, requestId);
});
