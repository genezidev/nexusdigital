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
