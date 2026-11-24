import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/server/db/client";
import { audienceOf } from "@/server/authorization/audience";
import type { SystemContext, TenantContext } from "@/server/authorization/context";

export type Tx = Prisma.TransactionClient;

/** Transacao ja amarrada a um cliente: e o que os repositorios recebem. */
export interface Scoped {
  readonly tx: Tx;
  readonly ctx: TenantContext;
}

/** Transacao sem cliente especifico (so ADMIN ou fluxo publico por token). */
export interface SystemScoped {
  readonly tx: Tx;
  readonly sys: SystemContext;
}

const TX_OPTIONS = { maxWait: 5000, timeout: 15000 } as const;

/**
 * Abre uma transacao e grava o cliente nas variaveis locais da transacao (set_config com
 * is_local = true). As politicas RLS leem essas variaveis: fora daqui, nenhuma linha de cliente
 * e visivel para o papel nexo_app.
 */
export async function withTenant<T>(db: Db, ctx: TenantContext, fn: (scope: Scoped) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    // app.audience (admin | staff | client) e app.user_id alimentam as politicas RLS da fase 2:
    // o cliente so ve o que foi compartilhado e o autor de aprovacao e comentario e sempre quem esta na sessao.
    await tx.$executeRaw`SELECT set_config('app.client_id', ${ctx.clientId}, true), set_config('app.system', 'off', true), set_config('app.audience', ${audienceOf(ctx)}, true), set_config('app.user_id', ${ctx.userId}, true)`;
    return fn({ tx, ctx });
  }, TX_OPTIONS);
}

// O parametro sys e a "prova" de que quem chama passou por systemContextFor*; nao e lido aqui.
export async function withSystem<T>(db: Db, sys: SystemContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  void sys;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.client_id', '', true), set_config('app.system', 'on', true), set_config('app.audience', '', true), set_config('app.user_id', '', true)`;
    return fn(tx);
  }, TX_OPTIONS);
}

export async function withSystemScoped<T>(db: Db, sys: SystemContext, fn: (scope: SystemScoped) => Promise<T>): Promise<T> {
  return withSystem(db, sys, (tx) => fn({ tx, sys }));
}
