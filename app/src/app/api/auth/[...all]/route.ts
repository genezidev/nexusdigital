import { getAuth } from "@/server/auth/instance";
import { isEmailDeliveryAvailable } from "@/server/config/email";
import { guardAuthRequest } from "@/server/http/auth-guard";
import { errorResponse, isNextControlFlow, json, newRequestId } from "@/server/http/respond";

// Porta de entrada do Better Auth. Lista de permissao: so as rotas que a interface usa chegam ao
// Better Auth; o resto (inclusive /admin/* do plugin, que pularia a auditoria do app) responde 404.
const ALLOWED = new Set(["/sign-in/email", "/sign-out", "/get-session", "/change-password", "/request-password-reset", "/reset-password"]);
const RESET_CALLBACK = /^\/reset-password\/[A-Za-z0-9_-]{10,200}$/;

function relativePath(req: Request): string {
  return new URL(req.url).pathname.replace(/^\/api\/auth/, "") || "/";
}

async function handle(req: Request): Promise<Response> {
  const path = relativePath(req);
  const requestId = newRequestId();
  if (!ALLOWED.has(path) && !RESET_CALLBACK.test(path)) {
    return json({ error: { code: "NOT_FOUND", message: "Nao encontrado.", requestId } }, 404, requestId);
  }
  // Sem SMTP, pedir link de redefinicao falharia so quando o e-mail existe e revelaria quais contas
  // existem. Resposta unica de indisponibilidade, igual para qualquer e-mail.
  if (path === "/request-password-reset" && !isEmailDeliveryAvailable()) {
    return json(
      { error: { code: "EMAIL_UNAVAILABLE", message: "A recuperacao de senha por e-mail nao esta disponivel neste ambiente.", requestId } },
      503,
      requestId,
    );
  }
  try {
    // Limite de tentativas (IP validado e e-mail) e saneamento do cabecalho de IP antes do Better Auth.
    const guarded = await guardAuthRequest(req, path);
    const response = await getAuth().handler(guarded.request);
    await guarded.finish(response.status);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return errorResponse(error, requestId);
  }
}

export const GET = handle;
export const POST = handle;
