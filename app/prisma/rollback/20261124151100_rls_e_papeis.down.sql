-- Desfaz 20261124151100_rls_e_papeis. Rodar com o dono do banco, so em dev/teste.
-- Em producao, a volta e restaurar o backup tirado antes da migration (playbook/vps.md).
DROP TRIGGER IF EXISTS client_members_role_check ON client_members;
DROP FUNCTION IF EXISTS client_members_check_role();
DROP INDEX IF EXISTS invitations_pending_unique;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_token_hash_hex;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_expiry_after_creation;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_email_lowercase;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_lowercase;
DROP POLICY IF EXISTS tenant_insert ON audit_logs;
DROP POLICY IF EXISTS tenant_select ON audit_logs;
DROP POLICY IF EXISTS tenant_isolation ON invitations;
DROP POLICY IF EXISTS tenant_isolation ON client_members;
DROP POLICY IF EXISTS tenant_isolation ON clients;
ALTER TABLE audit_logs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE invitations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_members NO FORCE ROW LEVEL SECURITY;
ALTER TABLE client_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients NO FORCE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
DROP FUNCTION IF EXISTS app_is_system();
DROP FUNCTION IF EXISTS app_client_id();
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM nexo_app;
REVOKE USAGE ON SCHEMA public FROM nexo_app;
-- O papel nexo_app e do cluster e pode servir a outros bancos: nao e removido aqui.
