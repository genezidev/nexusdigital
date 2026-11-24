-- Desfaz 20261124220000_rate_limits_indice. Rodar com o dono do banco, so em dev/teste.
-- Em producao, a volta e restaurar o backup tirado antes da migration (playbook/vps.md).
-- Apos rodar, apague a linha desta migration em _prisma_migrations para poder reaplicar.
DROP INDEX IF EXISTS "rate_limits_last_request_idx";
