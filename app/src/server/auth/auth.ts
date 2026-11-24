import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { systemContextForSession } from "@/server/authorization/context";
import type { Db } from "@/server/db/client";
import { withSystem } from "@/server/db/scope";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/server/services/invitations";

export interface AuthOptions {
  secret: string;
  baseURL: string;
  /** Entrega do link de redefinicao. Sem SMTP configurado, deve falhar (nunca sucesso falso). */
  sendResetPassword?: (data: { email: string; url: string; token: string }) => Promise<void>;
  /** Ligue so atras de um proxy reverso que sobrescreve x-forwarded-for (senao o cabecalho e forjavel). */
  trustForwardedFor?: boolean;
  /** Janela e maximo de tentativas de login (padrao: 5 por 60 s por IP). */
  signInRateLimit?: { window: number; max: number };
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
  const signIn = options.signInRateLimit ?? { window: 60, max: 5 };
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
      ipAddress: { ipAddressHeaders: options.trustForwardedFor ? ["x-forwarded-for"] : [] },
    },
    // Limite de tentativas com armazenamento em banco (tabela rate_limits, migration 20261124200000).
    // Ligado em qualquer ambiente (o padrao do Better Auth so liga em producao).
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 10,
      max: 100,
      customRules: {
        "/sign-in/email": signIn,
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
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
