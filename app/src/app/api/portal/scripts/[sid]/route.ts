import { portalCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/scripts";

export const GET = route<{ sid: string }>(async (req, { params, requestId }) => {
  const a = await portalCtx(req);
  return h.getScriptResponse(a, params.sid, requestId);
});
