import { adminCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/planning";

export const GET = route<{ id: string; cyc: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.getCycleResponse(a, params.cyc, requestId);
});
