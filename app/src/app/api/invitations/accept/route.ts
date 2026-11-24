import { getDb } from "@/server/db/client";
import { limitRequests, parseBody, route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { acceptInvitation } from "@/server/services/invitations";
import { acceptInvitationBody } from "@/lib/schemas";

// Rota publica (o token e a credencial). Limite por IP; convite invalido, usado, revogado ou expirado
// respondem todos 410 com a mesma mensagem (InvalidInvitationError).
export const POST = route(async (req, { requestId }) => {
  await limitRequests(req, "invitation-accept", { windowSeconds: 60, max: 10 });
  const body = await parseBody(req, acceptInvitationBody);
  await acceptInvitation(getDb(), body);
  return json({ ok: true }, 201, requestId);
});
