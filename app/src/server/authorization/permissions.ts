import type { TenantContext } from "@/server/authorization/context";
import { ForbiddenError } from "@/server/errors";

export type Action =
  | "client:read"
  | "client:update"
  | "member:read"
  | "member:manage"
  | "invitation:read"
  | "invitation:create"
  | "invitation:revoke"
  | "audit:read";

const BY_MEMBER_ROLE: Record<string, readonly Action[]> = {
  STAFF: ["client:read", "member:read", "invitation:read", "audit:read"],
  CLIENT_OWNER: ["client:read", "member:read"],
  CLIENT_COLLABORATOR: ["client:read"],
};

/** Deny-by-default. ADMIN pode tudo no cliente ativo; os demais, so o que a tabela lista. */
export function can(ctx: TenantContext, action: Action): boolean {
  if (ctx.globalRole === "ADMIN") return true;
  if (!ctx.memberRole) return false;
  return BY_MEMBER_ROLE[ctx.memberRole]?.includes(action) ?? false;
}

export function assertCan(ctx: TenantContext, action: Action): void {
  if (!can(ctx, action)) throw new ForbiddenError();
}
