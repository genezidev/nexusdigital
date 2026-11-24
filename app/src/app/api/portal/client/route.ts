import { resolveTenantContext } from "@/server/authorization/context";
import { getDb } from "@/server/db/client";
import { requireClientUser } from "@/server/http/actor";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { loadPortalHome } from "@/server/services/portal";

// Dados do cliente ATIVO da sessao. Nao existe parametro de cliente: qualquer ?clientId= da URL e ignorado,
// porque o cliente vem de resolveTenantContext(sessao), nunca do navegador.
export const GET = route(async (req, { requestId }) => {
  const actor = await requireClientUser(req.headers);
  const db = getDb();
  const ctx = await resolveTenantContext(db, { userId: actor.userId, activeClientId: actor.activeClientId });
  const home = await loadPortalHome(db, ctx);
  return json(home, 200, requestId);
});
