import { adminCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/files";

export const DELETE = route<{ id: string; lid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.deleteLink(a, params.lid, requestId);
});

export const PUT = route<{ id: string; lid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.putLinkPosition(a, req, params.lid, requestId);
});
