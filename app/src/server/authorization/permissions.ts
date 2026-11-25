import type { TenantContext } from "@/server/authorization/context";
import { ForbiddenError } from "@/server/errors";

export type Action =
  // Fase 1
  | "client:read"
  | "client:update"
  | "member:read"
  | "member:manage"
  | "invitation:read"
  | "invitation:create"
  | "invitation:revoke"
  | "audit:read"
  // Fase 2: plano, assinatura e ciclo (so ADMIN escreve; STAFF le; o cliente le o proprio retrato)
  | "plan:read"
  | "plan:manage"
  | "subscription:read"
  | "subscription:manage"
  | "cycle:read"
  | "cycle:manage"
  // Fase 2: conteudos, versoes, aprovacao e comentarios
  | "content:read"
  | "content:write"
  | "content:classify"
  | "content:approve"
  | "comment:read"
  | "comment:create"
  | "comment:create_internal"
  // Fase 2: roteiros, gravacoes e arquivos
  | "script:read"
  | "script:write"
  | "recording:submit"
  | "recording:review"
  | "asset:read"
  | "asset:upload"
  | "asset:attach"
  | "asset:delete_any"
  // D-0025: links de midia externos (mesmas pessoas que anexam arquivo; o cliente so em gravacao dele, o banco confere)
  | "media_link:read"
  | "media_link:create"
  | "media_link:remove"
  // D-0026: o dono do cliente gerencia a equipe (colaboradores) do proprio cliente
  | "team:manage";

const CLIENT_SIDE_COMMON: readonly Action[] = [
  "client:read",
  "subscription:read",
  "cycle:read",
  "content:read",
  "comment:read",
  "comment:create",
  "script:read",
  "recording:submit",
  "asset:read",
  "asset:upload",
  "media_link:read",
  "media_link:create",
  "media_link:remove",
];

const BY_MEMBER_ROLE: Record<string, readonly Action[]> = {
  // STAFF atribuido: opera conteudos, roteiros e arquivos; NAO mexe em plano, assinatura, ciclo nem
  // classificacao de cota, e NAO aprova em nome do cliente. content:write e script:write sao padrao
  // e podem ser revogados por entrada "-content:write" em client_members.permissions.
  STAFF: [
    "client:read",
    "member:read",
    "invitation:read",
    "audit:read",
    "plan:read",
    "subscription:read",
    "cycle:read",
    "content:read",
    "content:write",
    "comment:read",
    "comment:create",
    "comment:create_internal",
    "script:read",
    "script:write",
    "recording:submit",
    "recording:review",
    "asset:read",
    "asset:upload",
    "asset:attach",
    "media_link:read",
    "media_link:create",
    "media_link:remove",
  ],
  CLIENT_OWNER: [...CLIENT_SIDE_COMMON, "member:read", "content:approve", "team:manage"],
  // So aprova com a concessao explicita "content:approve" em client_members.permissions.
  CLIENT_COLLABORATOR: [...CLIENT_SIDE_COMMON],
};

/** Concessoes que o ADMIN pode dar a um CLIENT_COLLABORATOR (nenhuma outra e aceita). */
const GRANTABLE_TO_COLLABORATOR: readonly Action[] = ["content:approve"];

/** Acoes que NINGUEM da agencia executa: a decisao do cliente nunca e tomada em nome dele. */
const NEVER_BY_AGENCY: readonly Action[] = ["content:approve"];

/** Deny-by-default. ADMIN pode tudo no cliente ativo (menos o que e so do cliente); os demais, so o que a tabela lista. */
export function can(ctx: TenantContext, action: Action): boolean {
  if (ctx.globalRole === "ADMIN") return !NEVER_BY_AGENCY.includes(action);
  if (!ctx.memberRole) return false;
  if (ctx.memberRole === "STAFF" && ctx.permissions.includes(`-${action}`)) return false;
  if (BY_MEMBER_ROLE[ctx.memberRole]?.includes(action)) return true;
  if (ctx.memberRole === "CLIENT_COLLABORATOR" && GRANTABLE_TO_COLLABORATOR.includes(action)) {
    return ctx.permissions.includes(action);
  }
  return false;
}

export function assertCan(ctx: TenantContext, action: Action): void {
  if (!can(ctx, action)) throw new ForbiddenError();
}

/** Lado da agencia (ADMIN ou STAFF atribuido). O cliente nunca e "agencia", qualquer que seja o papel. */
export function isAgency(ctx: Pick<TenantContext, "globalRole">): boolean {
  return ctx.globalRole === "ADMIN" || ctx.globalRole === "STAFF";
}
