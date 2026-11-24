import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/planning";

export const POST = route<{ planId: string }>(async (req, { params, requestId }) => {
  return h.postPlanDeactivate(req, params.planId, requestId);
});
