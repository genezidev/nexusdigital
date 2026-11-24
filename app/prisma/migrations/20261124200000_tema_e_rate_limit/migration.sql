-- Fase 1, telas: tema por usuario e limite de tentativas em banco (Better Auth rateLimit.storage = database).
-- Reversao: prisma/rollback/20261124200000_tema_e_rate_limit.down.sql

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "theme_preference" "ThemePreference" NOT NULL DEFAULT 'SYSTEM';

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- GRANT e RLS sao camadas diferentes (D-0004). A tabela nao guarda dado de cliente: so GRANT.
-- O papel do app precisa apagar linhas expiradas (limpeza feita pelo Better Auth).
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO nexo_app;
