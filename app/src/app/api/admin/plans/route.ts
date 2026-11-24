import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/planning";

export const GET = route<Record<string, never>>(async (req, { requestId }) => {
  return h.listPlansResponse(req, requestId);
});

export const POST = route<Record<string, never>>(async (req, { requestId }) => {
  return h.postPlan(req, requestId);
});
