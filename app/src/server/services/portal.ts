import type { TenantContext } from "@/server/authorization/context";
import { can } from "@/server/authorization/permissions";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/scope";
import { NotFoundError } from "@/server/errors";
import { getClientById } from "@/server/repositories/clients";
import { listMembers } from "@/server/repositories/members";

/**
 * Inicio do portal: dados do cliente ATIVO da sessao e, para quem pode ver (responsavel do cliente),
 * a equipe do cliente. So campos explicitos (sem notas internas, sem token, sem hash).
 */
export async function loadPortalHome(db: Db, ctx: TenantContext) {
  return withTenant(db, ctx, async (s) => {
    const client = await getClientById(s, ctx.clientId);
    if (!client) throw new NotFoundError();
    const members = can(ctx, "member:read") ? await listMembers(s) : [];
    return {
      client: {
        id: client.id,
        name: client.name,
        contactName: client.contactName,
        contactEmail: client.contactEmail,
        timezone: client.timezone,
      },
      myRole: ctx.memberRole,
      team: members
        .filter((m) => m.role !== "STAFF" && m.status === "ACTIVE")
        .map((m) => ({ id: m.id, name: m.user.name, email: m.user.email, role: m.role })),
    };
  });
}
