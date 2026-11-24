import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { INTERNAL_IP_HEADER } from "@/server/http/client-ip";
import { systemContextForSession } from "@/server/authorization/context";
import type { Db } from "@/server/db/client";
import { withSystem } from "@/server/db/scope";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/server/services/invitations";

export interface AuthOptions {
  secret: string;
  baseURL: string;
  /** Entrega do link de redefinicao. Sem SMTP configurado, deve falhar (nunca sucesso falso). */
  sendResetPassword?: (data: { email: string; url: string; token: string }) => Promise<void>;
}

// Better Auth 1.7: e-mail e senha, SEM cadastro publico (so convite), ids UUID, token de
// redefinicao guardado como hash e de uso unico, sessoes revogadas apos redefinir a senha.
// Papeis globais (ADMIN/STAFF/USER) pelo plugin admin; bloqueio de conta = users.banned.
//
// Origem confiavel e CSRF: o Better Auth confere o cabecalho Origin das requisicoes que mudam estado
// contra `trustedOrigins` (aqui, so a origem de APP_URL) e recusa as demais com 403.
// Cookies: HttpOnly e SameSite=Lax sempre; Secure (e prefixo __Secure-) quando APP_URL e https.
// Sessao no banco e sem cookie cache: sessao revogada ou conta bloqueada perde acesso na requisicao seguinte.
export function createAuth(db: Db, options: AuthOptions) {
  const origin = new URL(options.baseURL).origin;
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: [origin],
    database: prismaAdapter(db, { provider: "postgresql" }),
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: origin.startsWith("https://"),
      // Explicito: nenhuma variavel de ambiente (ex.: TEST) pode desligar a checagem de origem/CSRF.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      // O IP gravado na sessao vem so do cabecalho interno, que o app recalcula (http/auth-guard.ts e client-ip.ts)
      // a partir do cabecalho que o proxy define; o que o cliente mandar nesse nome e descartado.
      ipAddress: { ipAddressHeaders: [INTERNAL_IP_HEADER] },
    },
    // O limite de tentativas NAO e do Better Auth: o dele cai num balde unico "no-trusted-ip" quando nao acha o
    // IP (M-1). Quem limita e src/server/http/auth-guard.ts (IP validado, e-mail, sem balde global).
    rateLimit: { enabled: false },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async (data) => {
        if (!options.sendResetPassword) throw new Error("Envio de e-mail nao configurado.");
        await options.sendResetPassword({ email: data.user.email, url: data.url, token: data.token });
      },
    },
    verification: { storeIdentifier: "hashed" },
    session: { additionalFields: { activeClientId: { type: "string", required: false, input: false } } },
    user: {
      additionalFields: {
        lastLoginAt: { type: "date", required: false, input: false },
        themePreference: { type: "string", required: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // O cliente ativo e decidido AQUI, no servidor, a partir das participacoes ativas do usuario.
          // Com mais de um cliente fica vazio: o portal pede a escolha e o servidor confere.
          before: async (session) => {
            const memberships = await withSystem(db, systemContextForSession(session.userId), (tx) =>
              tx.clientMember.findMany({
                where: { userId: session.userId, status: "ACTIVE", client: { status: "ACTIVE" } },
                select: { clientId: true },
                take: 2,
              }),
            );
            return { data: { ...session, activeClientId: memberships.length === 1 ? memberships[0].clientId : null } };
          },
          after: async (session) => {
            await db.user.update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } });
          },
        },
      },
    },
    plugins: [admin({ defaultRole: "USER", adminRoles: ["ADMIN"] })],
  });
}

export type Auth = ReturnType<typeof createAuth>;
