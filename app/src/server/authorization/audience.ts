import type { GlobalRole } from "@/generated/prisma/enums";

/** Quem esta do lado da agencia (ADMIN, STAFF) e quem esta do lado do cliente. Vai para app.audience (RLS). */
export type Audience = "admin" | "staff" | "client";

export function audienceOf(ctx: { readonly globalRole: GlobalRole }): Audience {
  if (ctx.globalRole === "ADMIN") return "admin";
  if (ctx.globalRole === "STAFF") return "staff";
  return "client";
}
