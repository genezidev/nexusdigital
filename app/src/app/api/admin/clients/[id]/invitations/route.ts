import { getServerEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/http/actor";
import { parseBody, route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { resolveAdminClientContext } from "@/server/services/access";
import { createInvitation } from "@/server/services/invitations";
import { inviteSchema } from "@/lib/schemas";

// Cria o convite e devolve o link UMA vez (o token em claro nao e gravado: so o hash).
// O envio por e-mail nao existe nesta fase, entao `emailSent` e sempre false: a interface manda o admin copiar o link (nunca sucesso falso).
export const POST = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireAdmin(req.headers);
  const input = await parseBody(req, inviteSchema);
  const db = getDb();
  const ctx = await resolveAdminClientContext(db, actor, params.id);
  const created = await createInvitation(db, ctx, input);
  const link = `${new URL(getServerEnv().APP_URL).origin}/invite/${created.token}`;
  return json(
    { invitationId: created.invitationId, link, expiresAt: created.expiresAt.toISOString(), emailSent: false },
    201,
    requestId,
  );
});
