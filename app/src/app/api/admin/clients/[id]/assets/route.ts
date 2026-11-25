import { adminCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/files";

export const GET = route<{ id: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.listAssets(a, req, requestId);
});

export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  h.assertUploadsEnabled();
  const a = await adminCtx(req, params.id);
  return h.postAssetInit(a, req, requestId);
});
