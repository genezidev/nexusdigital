import { z } from "zod";

// Cliente UNICO da API do navegador. Toda chamada passa por `call`, que:
// - so fala com a propria origem (credentials same-origin, sem token em localStorage: a sessao e cookie HttpOnly);
// - valida o formato da resposta com Zod (resposta fora do contrato vira erro, nunca dado "meio certo");
// - traduz erros para mensagens em pt-BR e expoe os erros por campo (422) para os formularios.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const errorEnvelope = z.object({
  error: z.object({ code: z.string(), message: z.string(), fields: z.record(z.string(), z.string()).optional() }),
});
// Formato do Better Auth: { code, message }.
const authError = z.object({ code: z.string().optional(), message: z.string().optional() });

const KNOWN: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  INVALID_PASSWORD: "A senha atual está incorreta.",
  BANNED_USER: "Esta conta está bloqueada. Fale com o administrador da agência.",
  INVALID_TOKEN: "Este link é inválido ou expirou. Peça um novo ao administrador.",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 12 caracteres.",
  PASSWORD_TOO_LONG: "A senha pode ter no máximo 128 caracteres.",
  INVALID_INVITATION: "Este convite é inválido ou expirou. Peça um novo ao administrador.",
  EMAIL_TAKEN: "Já existe uma conta com este e-mail.",
  INVITATION_PENDING: "Já existe um convite pendente para este e-mail.",
  EMAIL_UNAVAILABLE: "A recuperação de senha por e-mail não está disponível neste ambiente.",
  RATE_LIMITED: "Muitas tentativas. Aguarde um pouco e tente novamente.",
  FORBIDDEN: "Você não tem permissão para fazer isto.",
  UNAUTHORIZED: "Sua sessão expirou. Entre novamente.",
  NOT_FOUND: "Não encontramos o que você procura.",
  INTERNAL: "Algo deu errado do nosso lado. Tente novamente em instantes.",
};

const BY_STATUS: Record<number, string> = {
  400: "A solicitação não pôde ser entendida.",
  401: KNOWN.UNAUTHORIZED,
  403: KNOWN.FORBIDDEN,
  404: KNOWN.NOT_FOUND,
  409: "Esta ação conflita com o estado atual. Atualize a página e tente de novo.",
  410: KNOWN.INVALID_INVITATION,
  422: "Corrija os campos indicados.",
  429: KNOWN.RATE_LIMITED,
  503: "Este recurso está indisponível neste ambiente.",
};

function toApiError(status: number, payload: unknown): ApiError {
  const ours = errorEnvelope.safeParse(payload);
  if (ours.success) {
    const { code, message, fields } = ours.data.error;
    return new ApiError(status, code, KNOWN[code] ?? (status === 422 ? message : (BY_STATUS[status] ?? message)), fields);
  }
  const theirs = authError.safeParse(payload);
  const code = theirs.success && theirs.data.code ? theirs.data.code : "ERROR";
  const message = KNOWN[code] ?? BY_STATUS[status] ?? KNOWN.INTERNAL;
  return new ApiError(status, code, message);
}

async function call<S extends z.ZodType>(method: string, path: string, schema: S, body?: unknown): Promise<z.output<S>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Sem conexão com o servidor. Verifique sua internet e tente de novo.");
  }
  if (response.status === 204) return schema.parse(undefined);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  if (!response.ok) throw toApiError(response.status, payload);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiError(502, "BAD_RESPONSE", "O servidor respondeu em um formato inesperado. Tente novamente.");
  return parsed.data;
}

const nothing = z.undefined();
const okBody = z.object({ ok: z.literal(true) });
const user = z.object({ user: z.object({ id: z.string() }) });

export const api = {
  login: (input: { email: string; password: string }) => call("POST", "/api/auth/sign-in/email", user, input),
  logout: () => call("POST", "/api/auth/sign-out", z.object({ success: z.boolean() }), {}),
  requestPasswordReset: (input: { email: string }) =>
    call("POST", "/api/auth/request-password-reset", z.object({ status: z.boolean() }), { ...input, redirectTo: "/reset-password" }),
  resetPassword: (input: { token: string; newPassword: string }) =>
    call("POST", "/api/auth/reset-password", z.object({ status: z.boolean() }), input),
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    call("POST", "/api/auth/change-password", user, { ...input, revokeOtherSessions: true }),
  acceptInvitation: (input: { token: string; name: string; password: string }) =>
    call("POST", "/api/invitations/accept", okBody, input),

  createClient: (input: { name: string; contactName?: string; contactEmail?: string; timezone: string }) =>
    call("POST", "/api/admin/clients", z.object({ id: z.uuid(), name: z.string(), slug: z.string(), timezone: z.string() }), input),
  createInvitation: (clientId: string, input: { email: string; role: "CLIENT_OWNER" | "CLIENT_COLLABORATOR" }) =>
    call(
      "POST",
      `/api/admin/clients/${encodeURIComponent(clientId)}/invitations`,
      z.object({ invitationId: z.uuid(), link: z.url(), expiresAt: z.string(), emailSent: z.boolean() }),
      input,
    ),
  revokeInvitation: (clientId: string, invitationId: string) =>
    call("DELETE", `/api/admin/clients/${encodeURIComponent(clientId)}/invitations/${encodeURIComponent(invitationId)}`, nothing),
  setMemberBlocked: (clientId: string, memberId: string, blocked: boolean) =>
    call(
      "PUT",
      `/api/admin/clients/${encodeURIComponent(clientId)}/members/${encodeURIComponent(memberId)}/blocked`,
      z.object({ blocked: z.boolean(), sessionsRevoked: z.number() }),
      { blocked },
    ),
  revokeMemberSessions: (clientId: string, memberId: string) =>
    call(
      "DELETE",
      `/api/admin/clients/${encodeURIComponent(clientId)}/members/${encodeURIComponent(memberId)}/sessions`,
      z.object({ sessionsRevoked: z.number() }),
    ),

  switchClient: (clientId: string) => call("POST", "/api/portal/context", nothing, { clientId }),
  setTheme: (theme: "SYSTEM" | "LIGHT" | "DARK") => call("PUT", "/api/me/theme", z.object({ theme: z.enum(["SYSTEM", "LIGHT", "DARK"]) }), { theme }),
};
