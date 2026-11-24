import "server-only";
import { getServerEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { createAuth, type Auth } from "@/server/auth/auth";

const globalForAuth = globalThis as unknown as { __nexoAuth?: Auth };

/** Instancia unica do Better Auth (criada sob demanda: o build nao precisa de segredo nem de banco). */
export function getAuth(): Auth {
  if (!globalForAuth.__nexoAuth) {
    const env = getServerEnv();
    globalForAuth.__nexoAuth = createAuth(getDb(), {
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.APP_URL,
      trustForwardedFor: env.TRUST_PROXY === "true",
      signInRateLimit: { window: 60, max: env.AUTH_SIGNIN_RATE_MAX },
    });
  }
  return globalForAuth.__nexoAuth;
}
