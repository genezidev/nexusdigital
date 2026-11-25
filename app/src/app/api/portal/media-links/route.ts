import { portalCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/media-links";

export const GET = route<Record<string, never>>(async (req, { requestId }) => {
  const a = await portalCtx(req);
  return h.listLinks(a, req, requestId);
});

export const POST = route<Record<string, never>>(async (req, { requestId }) => {
  const a = await portalCtx(req);
  return h.postLinkPortal(a, req, requestId);
});
