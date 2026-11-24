import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/files";

export const PUT = route<{ token: string }>(async (req, { params, requestId }) => {
  return h.putUploadBytes(req, params.token, requestId);
});
