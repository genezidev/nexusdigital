import { route } from "@/server/http/handler";
import * as h from "@/server/http/handlers/files";

export const GET = route<{ token: string }>(async (req, { params, requestId }) => {
  return h.getDownloadBytes(req, params.token, requestId);
});
