import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { consumeRateLimit, isKnownGood, markKnownGood, pruneRateLimits, refundRateLimit } from "@/server/http/rate-limit";
import { appDb, ownerDb } from "./helpers/world";

// A-4: a tabela rate_limits nao cresce sem teto. A poda remove baldes vencidos (1 h) em lote, preserva os
// recentes e as marcas de "ja entrou deste IP" (30 dias), e tem indice em last_request.

const tag = () => randomUUID().slice(0, 8);
const old = (seconds: number) => BigInt(Date.now() - seconds * 1000);

async function seed(key: string, ageSeconds: number) {
  await ownerDb.$executeRaw`INSERT INTO rate_limits (key, count, last_request) VALUES (${key}, 1, ${old(ageSeconds)}::bigint)`;
}
const exists = async (key: string) => (await ownerDb.rateLimit.findUnique({ where: { key } })) !== null;

describe("poda de rate_limits", () => {
  it("apaga baldes proprios com mais de 1 h, mantem os recentes, as marcas de 30 dias e chaves que nao sao do app", async () => {
    const t = tag();
    const velhos = [`app:auth-ip:/x:${t}-1`, `app:auth-fail:${t}:a`, `app:auth-failall:${t}`];
    const recentes = [`app:auth-ip:/x:${t}-2`, `app:auth-fail:${t}:b`];
    const marcaRecente = `app:auth-ok:${t}:10.0.0.1`;
    const marcaVelha = `app:auth-ok:${t}:10.0.0.2`;
    const alheia = `better-auth:${t}`;
    for (const k of velhos) await seed(k, 2 * 3600);
    for (const k of recentes) await seed(k, 600);
    await seed(marcaRecente, 5 * 24 * 3600); // mais velha que 1 h, mas dentro dos 30 dias
    await seed(marcaVelha, 40 * 24 * 3600);
    await seed(alheia, 10 * 24 * 3600);

    await pruneRateLimits(appDb, { batch: 10_000 });

    for (const k of velhos) expect(await exists(k), k).toBe(false);
    for (const k of recentes) expect(await exists(k), k).toBe(true);
    expect(await exists(marcaRecente)).toBe(true);
    expect(await exists(marcaVelha)).toBe(false);
    expect(await exists(alheia)).toBe(true);
    await ownerDb.rateLimit.delete({ where: { key: alheia } });
    for (const k of [...recentes, marcaRecente]) await ownerDb.rateLimit.delete({ where: { key: k } });
  });

  it("poda em lotes: cada chamada apaga no maximo o tamanho do lote", async () => {
    const t = tag();
    const keys = Array.from({ length: 7 }, (_, i) => `app:auth-ip:/lote:${t}-${i}`);
    for (const k of keys) await seed(k, 3 * 3600);
    const apagadas = await pruneRateLimits(appDb, { batch: 3 });
    expect(apagadas).toBeLessThanOrEqual(3);
    expect(apagadas).toBeGreaterThan(0);
    // esvazia o resto
    for (let i = 0; i < 100 && (await pruneRateLimits(appDb, { batch: 1000 })) > 0; i++);
    for (const k of keys) expect(await exists(k)).toBe(false);
  });

  it("existe indice em last_request (a poda nao varre a tabela inteira)", async () => {
    const rows = await ownerDb.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE tablename = 'rate_limits' AND indexdef LIKE '%(last_request)%'`;
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("reserva e devolucao de vagas (login so conta falhas)", () => {
  it("refund devolve uma vaga sem passar de zero, e a marca de IP conhecido respeita a idade", async () => {
    const key = `app:auth-fail:${tag()}:ip`;
    await consumeRateLimit(appDb, key, 900, 3);
    await consumeRateLimit(appDb, key, 900, 3);
    await refundRateLimit(appDb, key);
    expect((await ownerDb.rateLimit.findUniqueOrThrow({ where: { key } })).count).toBe(1);
    await refundRateLimit(appDb, key);
    await refundRateLimit(appDb, key);
    expect((await ownerDb.rateLimit.findUniqueOrThrow({ where: { key } })).count).toBe(0);
    await ownerDb.rateLimit.delete({ where: { key } });

    const ok = `app:auth-ok:${tag()}:10.1.1.1`;
    expect(await isKnownGood(appDb, ok, 3600)).toBe(false);
    await markKnownGood(appDb, ok);
    expect(await isKnownGood(appDb, ok, 3600)).toBe(true);
    await ownerDb.$executeRaw`UPDATE rate_limits SET last_request = ${old(2 * 3600)}::bigint WHERE key = ${ok}`;
    expect(await isKnownGood(appDb, ok, 3600)).toBe(false);
    await ownerDb.rateLimit.delete({ where: { key: ok } });
  });
});
