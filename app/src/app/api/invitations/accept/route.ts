import { getDb } from "@/server/db/client";
import { limitRequests, parseBody, route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { acceptInvitation } from "@/server/services/invitations";
import { acceptInvitationBody } from "@/lib/schemas";

// Rota publica (o token e a credencial). Limite por IP (ou pelo token, sem IP confiavel); convite invalido, usado, revogado ou expirado
// respondem todos 410 com a mesma mensagem (InvalidInvitationError).
export const POST = route(async (req, { requestId }) => {
  const body = await parseBody(req, acceptInvitationBody);
  // Por IP confiavel; sem IP, pelo proprio token (nunca um balde global compartilhado).
  await limitRequests(req, "invitation-accept", { windowSeconds: 60, max: 10 }, body.token);
  await acceptInvitation(getDb(), body);
  return json({ ok: true }, 201, requestId);
});
