import { adminCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/scripts";

export const POST = route<{ id: string; recId: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.postRerecording(a, req, params.recId, requestId);
});
