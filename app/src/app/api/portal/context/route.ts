import { switchActiveClient } from "@/server/authorization/context";
import { getDb } from "@/server/db/client";
import { requireClientUser } from "@/server/http/actor";
import { parseBody, route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { listMyClientsForActor } from "@/server/services/clients";
import { switchClientSchema } from "@/lib/schemas";

// Contexto de cliente da pessoa logada: quais clientes ela pode escolher e qual esta ativo.
export const GET = route(async (req, { requestId }) => {
  const actor = await requireClientUser(req.headers);
  const clients = await listMyClientsForActor(getDb(), actor.userId);
  return json({ activeClientId: actor.activeClientId, clients }, 200, requestId);
});

// Troca o cliente ativo. O id vindo do navegador e so um PEDIDO: switchActiveClient reconfere a participacao
// ativa no banco e so entao grava sessions.active_client_id. Cliente alheio ou inexistente = 403.
export const POST = route(async (req) => {
  const actor = await requireClientUser(req.headers);
  const { clientId } = await parseBody(req, switchClientSchema);
  await switchActiveClient(getDb(), { sessionToken: actor.sessionToken, userId: actor.userId, requestedClientId: clientId });
  return new Response(null, { status: 204 });
});
