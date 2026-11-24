import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/server/config/env";

export type Db = PrismaClient;

// Prisma 7 exige driver adapter. A conexao do app usa o papel nexo_app (sem BYPASSRLS):
// o banco aplica as politicas de linha mesmo se o codigo esquecer um filtro.
export function createDb(connectionString: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForDb = globalThis as unknown as { __nexoDb?: Db };

export function getDb(): Db {
  globalForDb.__nexoDb ??= createDb(getServerEnv().DATABASE_URL);
  return globalForDb.__nexoDb;
}
