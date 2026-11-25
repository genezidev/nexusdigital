import { z } from "zod";
import type { attachBody, contentBody, cycleBody, materialBody, planBody, planVersionBody, planningPatchBody, scriptBody, scriptPatchBody, subscriptionBody } from "@/lib/schemas-fase2";

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
  EMAIL_TAKEN: "Já existe uma conta com este e-mail. Se a pessoa trabalha em outra empresa, fale com a agência para liberar o acesso.",
  INVITATION_PENDING: "Já existe um convite pendente para este e-mail.",
  EMAIL_UNAVAILABLE: "A recuperação de senha por e-mail não está disponível neste ambiente.",
  RATE_LIMITED: "Muitas tentativas. Aguarde um pouco e tente novamente.",
  FORBIDDEN: "Você não tem permissão para fazer isto.",
  UNAUTHORIZED: "Sua sessão expirou. Entre novamente.",
  NOT_FOUND: "Não encontramos o que você procura.",
  INTERNAL: "Algo deu errado do nosso lado. Tente novamente em instantes.",
  // Fase 2: regras de negocio recusadas pelo servidor (a mensagem do servidor nao tem acentos; esta e a oficial).
  ALREADY_DECIDED: "Esta versão já foi decidida por outra pessoa. Atualize a página para ver o resultado.",
  STALE_VERSION: "Há uma versão mais recente deste conteúdo. Recarregue a página para ver a versão atual.",
  NOT_AWAITING: "Este conteúdo não está mais aguardando aprovação.",
  COMMENT_REQUIRED: "Pedir revisão exige um comentário explicando o que mudar.",
  INVALID_TRANSITION: "Esta mudança de status não é permitida a partir do status atual.",
  TERMINAL: "Este conteúdo está cancelado e não muda mais.",
  CANCEL_REASON_REQUIRED: "Cancelar exige uma justificativa de pelo menos 10 caracteres.",
  REASON_REQUIRED: "Informe uma justificativa de pelo menos 10 caracteres.",
  PUBLICATION_DATA_REQUIRED: "Publicar exige a data de publicação e a URL HTTPS (ou um arquivo de evidência).",
  PUBLICATION_URL_INVALID: "A URL de publicação precisa ser um link HTTPS válido (no Instagram, de instagram.com).",
  MATERIAL_LOCKED: "Conteúdo publicado não tem o material editado. Registre a correção como comentário.",
  NO_DRAFT: "Não há rascunho para enviar. Salve o material antes.",
  NOT_MATERIAL: "Nada de material para salvar.",
  OUTSIDE_CYCLE_MONTH: "A data precisa ficar dentro do mês do ciclo.",
  PUBLISHED_IN_PAST: "Peça já publicada não é reagendada para o passado.",
  CYCLE_CLOSED: "Este ciclo está encerrado e não aceita a alteração.",
  CYCLE_EXISTS: "Já existe um ciclo para esta assinatura neste mês.",
  CYCLE_NOT_CLOSED: "Só ciclo encerrado pode ser reaberto.",
  CYCLE_OUTSIDE_SUBSCRIPTION: "O mês do ciclo está fora da vigência da assinatura.",
  SUBSCRIPTION_ACTIVE_EXISTS: "Este cliente já tem uma assinatura ativa. Encerre ou pause a atual antes.",
  SUBSCRIPTION_NOT_ACTIVE: "Só uma assinatura ativa pode abrir ciclo.",
  PLAN_EXISTS: "Já existe um plano com este código.",
  PLAN_VERSION_CONFLICT: "Outra versão do plano foi criada ao mesmo tempo. Atualize a página.",
  INVALID_ASSIGNEE: "O responsável precisa ser alguém da equipe atribuída a este cliente.",
  INVALID_LINK: "Link recusado: use um endereço https:// de um serviço autorizado, sem usuário, senha nem porta.",
  SCRIPT_LOCKED: "O roteiro só pode ser editado enquanto é rascunho.",
  RECORDING_SOURCE: "Informe um arquivo OU um link, não os dois.",
  NOT_AWAITING_RECORDING: "Este roteiro não está aguardando gravação.",
  RECORDING_NOT_PENDING: "Esta gravação não está aguardando conferência.",
  RECORDING_NOT_REVIEWABLE: "Esta gravação não pode receber este pedido.",
  RECORDING_NOT_RECEIVED: "Confirme o recebimento de uma gravação antes.",
  LINKED_CONTENT_STATE: "O conteúdo ligado a este roteiro ainda não está no status necessário.",
  ASSET_NOT_PENDING: "Este envio já foi encerrado. Escolha o arquivo e envie de novo.",
  INCOMPLETE_UPLOAD: "O envio terminou antes de o arquivo chegar inteiro. Envie de novo.",
  UPLOAD_IN_PROGRESS: "Este arquivo já está sendo enviado.",
  PAYLOAD_TOO_LARGE: "O arquivo é maior que o limite permitido para este tipo.",
  UNSUPPORTED_MEDIA_TYPE: "Tipo de arquivo não permitido. Use imagem JPEG, PNG ou WebP, PDF ou vídeo MP4, MOV ou WebM.",
  TYPE_NOT_ALLOWED: "Tipo de arquivo não permitido. Use imagem JPEG, PNG ou WebP, PDF ou vídeo MP4, MOV ou WebM.",
  BLOCKED_EXTENSION: "Este tipo de arquivo não é permitido por segurança.",
  STORAGE_UNAVAILABLE: "O armazenamento está indisponível no momento. Nada foi salvo; tente novamente em instantes.",
  STORAGE_QUOTA_EXCEEDED: "A cota de armazenamento deste cliente acabou. Fale com a agência.",
  LINK_EXPIRED: "O link venceu. Peça um novo.",
  // D-0025 e D-0026
  MEDIA_LINK_DUPLICATE: "Este link já está cadastrado neste item.",
  SELF_MANAGE: "Você não pode alterar o próprio acesso.",
};

const BY_STATUS: Record<number, string> = {
  400: "A solicitação não pôde ser entendida.",
  401: KNOWN.UNAUTHORIZED,
  403: KNOWN.FORBIDDEN,
  404: KNOWN.NOT_FOUND,
  409: "Esta ação conflita com o estado atual. Atualize a página e tente de novo.",
  410: KNOWN.INVALID_INVITATION,
  422: "Corrija os campos indicados.",
  413: KNOWN.PAYLOAD_TOO_LARGE,
  415: KNOWN.UNSUPPORTED_MEDIA_TYPE,
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

// ---------- Fase 2 ----------
// Mesmo molde: so a propria origem, resposta validada com Zod, erro traduzido. O cliente (clientId) das rotas
// /api/admin/clients/[id] e apenas o ALVO da acao: o servidor reconfere a permissao em cada chamada.
export type Scope = { kind: "admin"; clientId: string } | { kind: "portal" };
const base = (scope: Scope) => (scope.kind === "admin" ? `/api/admin/clients/${encodeURIComponent(scope.clientId)}` : "/api/portal");
const enc = encodeURIComponent;
const idBody = z.object({ id: z.string() });
const statusBody = z.object({ ok: z.literal(true), status: z.string().optional() });
const uploadTarget = z.object({
  assetId: z.string(),
  path: z.string().startsWith("/api/files/upload/"),
  method: z.literal("PUT"),
  expiresAt: z.string(),
  maxBytes: z.number(),
});
const downloadLink = z.object({ path: z.string().startsWith("/api/files/download/"), expiresAt: z.string() });
const versionResult = z.object({ versionId: z.string() });

export type PlanInput = z.input<typeof planBody>;
export type PlanVersionInput = z.input<typeof planVersionBody>;
export type SubscriptionInput = z.input<typeof subscriptionBody>;
export type CycleInput = z.input<typeof cycleBody>;
export type ContentInput = z.input<typeof contentBody>;
export type PlanningPatch = z.input<typeof planningPatchBody>;
export type MaterialInput = z.input<typeof materialBody>;
export type ScriptInput = z.input<typeof scriptBody>;
export type ScriptPatch = z.input<typeof scriptPatchBody>;
export type AttachInput = z.input<typeof attachBody>;

const apiFase2 = {
  // plano (catalogo da agencia)
  createPlan: (input: PlanInput) => call("POST", "/api/admin/plans", idBody, input),
  createPlanVersion: (planId: string, input: PlanVersionInput) => call("POST", `/api/admin/plans/${enc(planId)}/versions`, idBody, input),
  deactivatePlan: (planId: string) => call("POST", `/api/admin/plans/${enc(planId)}/deactivate`, okBody, {}),
  // assinatura e ciclo
  createSubscription: (clientId: string, input: SubscriptionInput) => call("POST", `/api/admin/clients/${enc(clientId)}/subscriptions`, idBody, input),
  patchSubscription: (clientId: string, id: string, input: { status?: "ATIVA" | "PAUSADA" | "ENCERRADA"; endsOn?: string | null; billingDay?: number }) =>
    call("PATCH", `/api/admin/clients/${enc(clientId)}/subscriptions/${enc(id)}`, okBody, input),
  openCycle: (clientId: string, input: CycleInput) => call("POST", `/api/admin/clients/${enc(clientId)}/cycles`, idBody, input),
  setCycleQuota: (clientId: string, cycleId: string, input: { quota: number; reason: string }) =>
    call("PUT", `/api/admin/clients/${enc(clientId)}/cycles/${enc(cycleId)}/quota`, okBody, input),
  closeCycle: (clientId: string, cycleId: string) => call("POST", `/api/admin/clients/${enc(clientId)}/cycles/${enc(cycleId)}/close`, okBody, {}),
  reopenCycle: (clientId: string, cycleId: string, reason: string) =>
    call("POST", `/api/admin/clients/${enc(clientId)}/cycles/${enc(cycleId)}/reopen`, okBody, { reason }),
  // conteudo
  createContent: (clientId: string, input: ContentInput) => call("POST", `/api/admin/clients/${enc(clientId)}/contents`, idBody, input),
  patchPlanning: (clientId: string, contentId: string, input: PlanningPatch) =>
    call("PATCH", `/api/admin/clients/${enc(clientId)}/contents/${enc(contentId)}`, okBody, input),
  saveMaterial: (clientId: string, contentId: string, input: MaterialInput) =>
    call("PUT", `/api/admin/clients/${enc(clientId)}/contents/${enc(contentId)}/material`, versionResult, input),
  sendVersion: (clientId: string, contentId: string, expectedVersionId?: string) =>
    call("POST", `/api/admin/clients/${enc(clientId)}/contents/${enc(contentId)}/send`, versionResult, expectedVersionId ? { expectedVersionId } : {}),
  setContentStatus: (clientId: string, contentId: string, input: { to: string; cancelReason?: string; publishedAt?: string; publicationUrl?: string }) =>
    call("POST", `/api/admin/clients/${enc(clientId)}/contents/${enc(contentId)}/status`, statusBody, input),
  reschedule: (clientId: string, contentId: string, plannedOn: string) =>
    call("PUT", `/api/admin/clients/${enc(clientId)}/contents/${enc(contentId)}/schedule`, okBody, { plannedOn }),
  setClassification: (clientId: string, contentId: string, input: { countsTowardQuota?: boolean; isBonus?: boolean }) =>
    call("PUT", `/api/admin/clients/${enc(clientId)}/contents/${enc(contentId)}/classification`, okBody, input),
  setVisibility: (clientId: string, contentId: string, visibility: "INTERNO" | "COMPARTILHADO") =>
    call("PUT", `/api/admin/clients/${enc(clientId)}/contents/${enc(contentId)}/visibility`, okBody, { visibility }),
  moveToCycle: (clientId: string, contentId: string, input: { cycleId: string; reason: string }) =>
    call("PUT", `/api/admin/clients/${enc(clientId)}/contents/${enc(contentId)}/cycle`, okBody, input),
  addContentComment: (scope: Scope, contentId: string, input: { body: string; visibility?: "INTERNO" | "COMPARTILHADO"; versionId?: string }) =>
    call("POST", `${base(scope)}/contents/${enc(contentId)}/comments`, idBody, input),
  decide: (contentId: string, versionId: string, input: { decision: "APROVADO" | "REVISAO_SOLICITADA"; comment?: string }) =>
    call(
      "POST",
      `/api/portal/contents/${enc(contentId)}/versions/${enc(versionId)}/decision`,
      z.object({ approvalId: z.string(), replayed: z.boolean(), decision: z.string() }),
      input,
    ),
  // roteiro e gravacao
  createScript: (clientId: string, input: ScriptInput) => call("POST", `/api/admin/clients/${enc(clientId)}/scripts`, idBody, input),
  patchScript: (clientId: string, scriptId: string, input: ScriptPatch) =>
    call("PATCH", `/api/admin/clients/${enc(clientId)}/scripts/${enc(scriptId)}`, okBody, input),
  setScriptStatus: (clientId: string, scriptId: string, input: { to: string; rerecording?: boolean; justification?: string }) =>
    call("POST", `/api/admin/clients/${enc(clientId)}/scripts/${enc(scriptId)}/status`, statusBody, input),
  addScriptComment: (scope: Scope, scriptId: string, input: { body: string; visibility?: "INTERNO" | "COMPARTILHADO" }) =>
    call("POST", `${base(scope)}/scripts/${enc(scriptId)}/comments`, idBody, input),
  submitRecording: (scope: Scope, scriptId: string, input: { assetId?: string; url?: string; imageRightsConfirmed?: boolean }) =>
    call("POST", `${base(scope)}/scripts/${enc(scriptId)}/recordings`, z.object({ id: z.string(), replayed: z.boolean() }), input),
  confirmRecording: (clientId: string, recordingId: string) =>
    call("POST", `/api/admin/clients/${enc(clientId)}/recordings/${enc(recordingId)}/confirm`, okBody, {}),
  requestRerecording: (clientId: string, recordingId: string, justification: string) =>
    call("POST", `/api/admin/clients/${enc(clientId)}/recordings/${enc(recordingId)}/rerecording`, okBody, { justification }),
  // arquivos: pedido de alvo, vinculo, download e exclusao (os bytes vao por `uploadFile`, em upload.ts)
  initUpload: (scope: Scope, input: { originalName: string; mimeType: string; bytes: number; visibility?: "INTERNO" | "COMPARTILHADO" }) =>
    call("POST", `${base(scope)}/assets`, uploadTarget, input),
  attachAsset: (clientId: string, assetId: string, input: AttachInput) =>
    call("POST", `/api/admin/clients/${enc(clientId)}/assets/${enc(assetId)}/links`, z.object({ id: z.string() }), input),
  detachLink: (clientId: string, linkId: string) => call("DELETE", `/api/admin/clients/${enc(clientId)}/asset-links/${enc(linkId)}`, okBody),
  setAssetVisibility: (clientId: string, assetId: string, visibility: "INTERNO" | "COMPARTILHADO") =>
    call("PATCH", `/api/admin/clients/${enc(clientId)}/assets/${enc(assetId)}`, okBody, { visibility }),
  // D-0025: links de midia externos (so o texto do endereco; o servidor nunca o abre)
  createMediaLink: (scope: Scope, input: { label: string; url: string; kind: string; versionId?: string; scriptId?: string; recordingId?: string }) =>
    call("POST", `${base(scope)}/media-links`, idBody.extend({ host: z.string() }), input),
  deleteMediaLink: (scope: Scope, id: string) => call("DELETE", `${base(scope)}/media-links/${enc(id)}`, okBody),
  // D-0026: o dono do cliente gerencia a propria equipe (cliente vem da sessao)
  inviteTeamMember: (input: { email: string; approve: boolean }) =>
    call("POST", "/api/portal/team/invitations", z.object({ invitationId: z.uuid(), link: z.url(), expiresAt: z.string(), emailSent: z.boolean() }), input),
  revokeTeamInvitation: (invitationId: string) => call("DELETE", `/api/portal/team/invitations/${enc(invitationId)}`, okBody),
  setTeamMemberApproval: (memberId: string, approve: boolean) => call("PATCH", `/api/portal/team/members/${enc(memberId)}`, okBody.extend({ canApprove: z.boolean() }), { approve }),
  setTeamMemberActive: (memberId: string, active: boolean) => call("PATCH", `/api/portal/team/members/${enc(memberId)}`, okBody.extend({ active: z.boolean() }), { active }),
  deleteAsset: (scope: Scope, assetId: string) => call("DELETE", `${base(scope)}/assets/${enc(assetId)}`, okBody),
  downloadLink: (scope: Scope, assetId: string) => call("POST", `${base(scope)}/assets/${enc(assetId)}/download`, downloadLink, {}),
};

export const api = {
  ...apiFase2,
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
