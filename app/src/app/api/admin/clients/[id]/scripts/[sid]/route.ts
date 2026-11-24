import { adminCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/scripts";

export const GET = route<{ id: string; sid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.getScriptResponse(a, params.sid, requestId);
});

export const PATCH = route<{ id: string; sid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.patchScript(a, req, params.sid, requestId);
});
