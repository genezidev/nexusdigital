// Seed de DEMONSTRACAO, idempotente, com dados ficticios. Nunca usar em producao.
// Roda com o dono do banco (DATABASE_MIGRATE_URL), pois cria usuarios fora de uma sessao.
// A senha de DEV vem de SEED_PASSWORD (app/.env), nunca do codigo.
// Uso: node scripts/db-seed.mjs dev|test
import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { createDb } from "../src/server/db/client";
import type { GlobalRole, MemberRole } from "../src/generated/prisma/enums";
import { seedPhase2 } from "./seed-fase2";

const url = process.env.SEED_TARGET_URL ?? process.env.DATABASE_MIGRATE_URL;
const password = process.env.SEED_PASSWORD;

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

if (process.env.NODE_ENV === "production") fail("Seed de demonstracao recusado em producao.");
if (!url) fail("Defina DATABASE_MIGRATE_URL em app/.env.");
if (!password || password.length < 12) fail("Defina SEED_PASSWORD (12+ caracteres) em app/.env.");
const parsed = new URL(url);
if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || !["/nexo_dev", "/nexo_test"].includes(parsed.pathname)) {
  fail("Seed recusado: o destino precisa ser nexo_dev ou nexo_test em 127.0.0.1/localhost.");
}

const db = createDb(url);

const CLIENTS = [
  { slug: "cliente-a", name: "Cliente A", contactName: "Contato A (ficticio)", contactEmail: "contato@cliente-a.test" },
  { slug: "cliente-b", name: "Cliente B", contactName: "Contato B (ficticio)", contactEmail: "contato@cliente-b.test" },
] as const;

const USERS: { email: string; name: string; role: GlobalRole; membership?: { client: string; role: MemberRole } }[] = [
  { email: "admin@nexo-demo.test", name: "Admin Demo", role: "ADMIN" },
  { email: "staff@nexo-demo.test", name: "Equipe Demo", role: "STAFF", membership: { client: "cliente-a", role: "STAFF" } },
  { email: "dono@cliente-a.test", name: "Dono do Cliente A", role: "USER", membership: { client: "cliente-a", role: "CLIENT_OWNER" } },
  { email: "dono@cliente-b.test", name: "Dono do Cliente B", role: "USER", membership: { client: "cliente-b", role: "CLIENT_OWNER" } },
];

async function main() {
  const clientIds = new Map<string, string>();
  for (const c of CLIENTS) {
    const row = await db.client.upsert({ where: { slug: c.slug }, update: { name: c.name }, create: c });
    clientIds.set(c.slug, row.id);
  }
  const passwordHash = await hashPassword(password!);
  for (const u of USERS) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { email: u.email, name: u.name, role: u.role, emailVerified: true },
    });
    await db.account.upsert({
      where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
      update: { password: passwordHash },
      create: { userId: user.id, providerId: "credential", accountId: user.id, password: passwordHash },
    });
    if (u.membership) {
      const clientId = clientIds.get(u.membership.client)!;
      await db.clientMember.upsert({
        where: { clientId_userId: { clientId, userId: user.id } },
        update: { role: u.membership.role, status: "ACTIVE" },
        create: { clientId, userId: user.id, role: u.membership.role },
      });
    }
  }
  await seedPhase2(db);
  console.log(`Seed de demonstracao aplicado: ${CLIENTS.length} clientes, ${USERS.length} usuarios, plano, assinaturas, ciclo e conteudos ficticios da fase 2.`);
}

main()
  .catch((error) => {
    console.error("Seed falhou:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
