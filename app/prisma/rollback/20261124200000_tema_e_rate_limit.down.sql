-- Desfaz 20261124200000_tema_e_rate_limit. Rodar com o dono do banco, so em dev/teste.
-- Em producao, a volta e restaurar o backup tirado antes da migration (playbook/vps.md).
-- Apos rodar, apague a linha desta migration em _prisma_migrations para poder reaplicar.
DROP TABLE IF EXISTS rate_limits;
ALTER TABLE users DROP COLUMN IF EXISTS theme_preference;
DROP TYPE IF EXISTS "ThemePreference";
