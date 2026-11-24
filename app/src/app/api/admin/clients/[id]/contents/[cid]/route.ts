import { adminCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/content";

export const GET = route<{ id: string; cid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.getContentDetailResponse(a, params.cid, requestId);
});

export const PATCH = route<{ id: string; cid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.patchPlanning(a, req, params.cid, requestId);
});
