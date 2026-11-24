import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations rodam com o dono do banco (DATABASE_MIGRATE_URL); o app em runtime usa
// DATABASE_URL, um papel sem BYPASSRLS (ver contexto/DECISOES.md D-0004).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.DATABASE_MIGRATE_URL ?? "" },
});
