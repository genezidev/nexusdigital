import type { Db } from "@/server/db/client";

/**
 * Janela fixa por chave, atomica no banco (INSERT ... ON CONFLICT), na mesma tabela rate_limits que o
 * Better Auth usa. Chaves daqui comecam com "app:" e nao colidem com as do Better Auth ("ip|rota").
 * `last_request` guarda o INICIO da janela. A linha e reescrita quando a janela vence.
 */
export async function consumeRateLimit(
  db: Db,
  key: string,
  windowSeconds: number,
  max: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = BigInt(Date.now());
  const windowMs = BigInt(windowSeconds * 1000);
  const rows = await db.$queryRaw<{ count: number; last_request: bigint }[]>`
    INSERT INTO rate_limits (key, count, last_request)
    VALUES (${key}, 1, ${now}::bigint)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.last_request <= ${now}::bigint - ${windowMs}::bigint THEN 1 ELSE rate_limits.count + 1 END,
      last_request = CASE WHEN rate_limits.last_request <= ${now}::bigint - ${windowMs}::bigint THEN ${now}::bigint ELSE rate_limits.last_request END
    RETURNING count, last_request`;
  const row = rows[0];
  const allowed = row.count <= max;
  const retryMs = Number(row.last_request) + windowSeconds * 1000 - Number(now);
  return { allowed, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
}

/** Zera um balde (ex.: falhas de login por e-mail, quando o login da certo). */
export async function resetRateLimit(db: Db, key: string): Promise<void> {
  await db.$executeRaw`DELETE FROM rate_limits WHERE key = ${key}`;
}

/** Devolve uma reserva: usada quando a tentativa nao foi falha (login certo) ou nao chegou a ser julgada. */
export async function refundRateLimit(db: Db, key: string): Promise<void> {
  await db.$executeRaw`UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = ${key}`;
}

/** Marca "esta conta ja entrou com sucesso a partir deste IP" (linha com last_request = agora). */
export async function markKnownGood(db: Db, key: string): Promise<void> {
  const now = BigInt(Date.now());
  await db.$executeRaw`
    INSERT INTO rate_limits (key, count, last_request) VALUES (${key}, 1, ${now}::bigint)
    ON CONFLICT (key) DO UPDATE SET last_request = ${now}::bigint`;
}

export async function isKnownGood(db: Db, key: string, maxAgeSeconds: number): Promise<boolean> {
  const cutoff = BigInt(Date.now() - maxAgeSeconds * 1000);
  const rows = await db.$queryRaw<{ one: number }[]>`SELECT 1 AS one FROM rate_limits WHERE key = ${key} AND last_request > ${cutoff}::bigint LIMIT 1`;
  return rows.length > 0;
}

export const KNOWN_GOOD_PREFIX = "app:auth-ok:";
export const RATE_LIMIT_RETENTION_SECONDS = 3600; // maior janela (15 min) + folga
export const KNOWN_GOOD_RETENTION_SECONDS = 30 * 24 * 3600;

/**
 * Poda baldes proprios do app ("app:") vencidos, em lotes (sem tabela inteira de uma vez). Baldes comuns:
 * parados ha mais de ~1 h (a maior janela e 15 min). Marcas de "ja entrou deste IP": 30 dias.
 * Devolve quantas linhas apagou. Usa o indice em last_request.
 */
export async function pruneRateLimits(
  db: Db,
  options: { retentionSeconds?: number; knownGoodSeconds?: number; batch?: number } = {},
): Promise<number> {
  const now = Date.now();
  const cutoff = BigInt(now - (options.retentionSeconds ?? RATE_LIMIT_RETENTION_SECONDS) * 1000);
  const goodCutoff = BigInt(now - (options.knownGoodSeconds ?? KNOWN_GOOD_RETENTION_SECONDS) * 1000);
  const batch = Math.min(Math.max(Math.trunc(options.batch ?? 1000), 1), 10_000);
  const prefix = `${KNOWN_GOOD_PREFIX}%`;
  return db.$executeRaw`
    DELETE FROM rate_limits WHERE id IN (
      SELECT id FROM rate_limits
      WHERE key LIKE 'app:%'
        AND ((key NOT LIKE ${prefix} AND last_request < ${cutoff}::bigint) OR (key LIKE ${prefix} AND last_request < ${goodCutoff}::bigint))
      LIMIT ${batch})`;
}
