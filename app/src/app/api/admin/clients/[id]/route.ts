import { getDb } from "@/server/db/client";
import { requireStaffArea } from "@/server/http/actor";
import { toClientDetailDto } from "@/server/http/dto";
import { route } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { getClientDetail } from "@/server/services/clients";

// O id da URL e so o ALVO. Quem decide e getClientDetail -> resolveTenantContext (banco):
// inexistente, malformado e "nao atribuido ao STAFF" respondem o mesmo 404; usuario de cliente recebe 403.
export const GET = route<{ id: string }>(async (req, { params, requestId }) => {
  const actor = await requireStaffArea(req.headers);
  const detail = await getClientDetail(getDb(), actor, params.id);
  return json(toClientDetailDto(detail), 200, requestId);
});
