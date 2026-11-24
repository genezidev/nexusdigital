import { adminCtx } from "@/server/http/api";
import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/files";

export const POST = route<{ id: string; aid: string }>(async (req, { params, requestId }) => {
  const a = await adminCtx(req, params.id);
  return h.postAttach(a, req, params.aid, requestId);
});
