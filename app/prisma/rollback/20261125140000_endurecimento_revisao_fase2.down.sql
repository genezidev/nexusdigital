-- Desfaz 20261125140000_endurecimento_revisao_fase2. Rodar com o dono do banco, so em dev/teste.
-- Em producao, a volta e restaurar o backup tirado antes da migration (playbook/vps.md).
-- Atencao: apagar app_settings apaga o identificador da instalacao; a limpeza de arquivos deixa de ter a trava.
-- Apos rodar, apague a linha desta migration em _prisma_migrations para poder reaplicar.
DROP TRIGGER IF EXISTS invitations_admin_only ON invitations;
DROP TRIGGER IF EXISTS client_members_admin_only ON client_members;
DROP TRIGGER IF EXISTS approvals_client_permission_guard ON approvals;
DROP TRIGGER IF EXISTS contents_client_decision_guard ON contents;
DROP FUNCTION IF EXISTS invitations_admin_only();
DROP FUNCTION IF EXISTS client_members_admin_only();
DROP FUNCTION IF EXISTS approvals_client_permission_guard();
DROP FUNCTION IF EXISTS contents_client_decision_guard();
DROP FUNCTION IF EXISTS client_storage_bytes(uuid, timestamptz, uuid);
DROP FUNCTION IF EXISTS storage_bytes_total(timestamptz, uuid);
DROP TABLE IF EXISTS app_settings;
-- volta ao modo original (ENABLE ORIGIN) dos gatilhos que eram assim
ALTER TABLE contents ENABLE TRIGGER contents_guard;
ALTER TABLE contents ENABLE TRIGGER contents_invalidate_approvals;
ALTER TABLE assets ENABLE TRIGGER assets_guard;
ALTER TABLE asset_links ENABLE TRIGGER asset_links_guard;
ALTER TABLE recordings ENABLE TRIGGER recordings_guard;
ALTER TABLE subscriptions ENABLE TRIGGER subscriptions_guard;
ALTER TABLE editorial_cycles ENABLE TRIGGER editorial_cycles_guard;
ALTER TABLE service_plans ENABLE TRIGGER service_plans_guard;
ALTER TABLE client_members ENABLE TRIGGER client_members_role_check;
