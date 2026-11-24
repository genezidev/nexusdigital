import { getDb } from "@/server/db/client";
import { requireActor } from "@/server/http/actor";
import { parseBody, route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { setThemePreference } from "@/server/services/preferences";
import { themeSchema } from "@/lib/schemas";

// Tema da PROPRIA pessoa (userId da sessao). Nao aceita id de usuario no corpo.
export const PUT = route(async (req, { requestId }) => {
  const actor = await requireActor(req.headers);
  const { theme } = await parseBody(req, themeSchema);
  await setThemePreference(getDb(), actor.userId, theme);
  return json({ theme }, 200, requestId);
});
