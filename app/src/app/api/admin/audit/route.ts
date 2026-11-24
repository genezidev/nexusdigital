import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/http/actor";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { getAuditPageForAdmin } from "@/server/services/clients";
import { parsePageParams } from "@/lib/pagination";

// Auditoria entre clientes: so ADMIN. Nunca devolve o diff.
export const GET = route(async (req, { requestId }) => {
  const actor = await requireAdmin(req.headers);
  const { page, pageSize } = parsePageParams(new URL(req.url).searchParams, { pageSize: 25 });
  const result = await getAuditPageForAdmin(getDb(), actor, { page, pageSize });
  return json(
    {
      items: result.items.map((i) => ({
        id: i.id,
        action: i.action,
        entityType: i.entityType,
        createdAt: i.createdAt.toISOString(),
        actor: i.actor?.email ?? null,
        client: i.client ? { id: i.client.id, name: i.client.name } : null,
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    },
    200,
    requestId,
  );
});
