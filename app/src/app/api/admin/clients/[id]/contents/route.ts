import { adminCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/content";

export const GET = route<{ id: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.listContents(a, req, requestId);
});

export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.createContentResponse(a, req, requestId);
});
