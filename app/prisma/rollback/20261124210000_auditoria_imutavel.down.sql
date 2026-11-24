-- Desfaz 20261124210000_auditoria_imutavel. Rodar com o dono do banco, so em dev/teste.
-- Em producao, a volta e restaurar o backup tirado antes da migration (playbook/vps.md).
-- Apos rodar, apague a linha desta migration em _prisma_migrations para poder reaplicar.
DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;
DROP TRIGGER IF EXISTS audit_logs_no_change ON audit_logs;
DROP FUNCTION IF EXISTS audit_logs_immutable();
GRANT DELETE ON users TO nexo_app;
