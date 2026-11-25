import { portalCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/files";

export const GET = route<Record<string, never>>(async (req, { requestId }) => {
  const a = await portalCtx(req);
  return h.listAssets(a, req, requestId);
});

export const POST = route<Record<string, never>>(async (req, { requestId }) => {
  h.assertUploadsEnabled();
  const a = await portalCtx(req);
  return h.postAssetInit(a, req, requestId);
});
