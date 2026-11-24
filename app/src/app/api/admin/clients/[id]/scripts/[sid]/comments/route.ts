import { adminCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/scripts";

export const POST = route<{ id: string; sid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.postScriptComment(a, req, params.sid, requestId);
});
