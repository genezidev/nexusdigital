import { adminCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/content";

export const GET = route<{ id: string; cid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.listCommentsResponse(a, params.cid, requestId);
});

export const POST = route<{ id: string; cid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.postComment(a, req, params.cid, requestId);
});
