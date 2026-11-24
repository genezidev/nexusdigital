-- A-4: a poda dos baldes de tentativas (src/server/http/rate-limit.ts, pruneRateLimits) filtra por last_request.
-- Sem indice ela varreria a tabela inteira, que cresce quando nao ha IP confiavel.
-- Reversao: prisma/rollback/20261124220000_rate_limits_indice.down.sql
CREATE INDEX "rate_limits_last_request_idx" ON "rate_limits"("last_request");
