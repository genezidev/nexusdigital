-- Desfaz 20261125160000_links_de_midia. Rodar com o dono do banco, so em dev/teste.
-- Em producao, a volta e restaurar o backup tirado antes da migration (playbook/vps.md). Apaga TODOS os links de midia.
-- Apos rodar, apague a linha desta migration em _prisma_migrations para poder reaplicar.
DROP TRIGGER IF EXISTS media_links_guard ON media_links;
DROP FUNCTION IF EXISTS media_links_guard();
DROP TABLE IF EXISTS media_links;
DROP TYPE IF EXISTS "MediaKind";
