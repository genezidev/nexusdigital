import { getDb } from "@/server/db/client";
import { requireAdmin, requireStaffArea } from "@/server/http/actor";
import { parseBody, route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { createClientAsAdmin, listClientsForActor } from "@/server/services/clients";
import { createClientSchema } from "@/lib/schemas";
import { parsePageParams } from "@/lib/pagination";

// Lista (ADMIN: todos; STAFF: so os atribuidos). Quem e de cliente recebe 403.
export const GET = route(async (req, { requestId }) => {
  const actor = await requireStaffArea(req.headers);
  const url = new URL(req.url);
  const { page, pageSize, q } = parsePageParams(url.searchParams);
  const result = await listClientsForActor(getDb(), actor, { page, pageSize, q });
  return json(
    {
      items: result.items.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        contactName: c.contactName,
        contactEmail: c.contactEmail,
        timezone: c.timezone,
        status: c.status,
        memberCount: c._count.members,
        createdAt: c.createdAt.toISOString(),
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    },
    200,
    requestId,
  );
});

export const POST = route(async (req, { requestId }) => {
  const actor = await requireAdmin(req.headers);
  const input = await parseBody(req, createClientSchema);
  const client = await createClientAsAdmin(getDb(), actor, input);
  return json(client, 201, requestId);
});
