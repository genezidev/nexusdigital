-- B-1 (revisao de seguranca da fase 1, D-0007): a auditoria nao pode ser reescrita nem por efeito colateral.
-- Antes: o app nao tinha UPDATE/DELETE em audit_logs, mas DELETE em users disparava a FK
-- audit_logs_actor_id_fkey ON DELETE SET NULL e apagava o autor (actor_id) das linhas de auditoria.
-- Reversao: prisma/rollback/20261124210000_auditoria_imutavel.down.sql

-- 1) O app nunca apaga usuario: pessoa sai por bloqueio (users.banned) e participacao revogada; a exclusao
--    por LGPD (fase 5) e anonimizacao (UPDATE), nao DELETE. Nenhum fluxo do codigo usa DELETE em users.
REVOKE DELETE ON users FROM nexo_app;

-- 2) Auditoria imutavel para QUALQUER papel (inclusive o dono do banco) e para acoes referenciais:
--    o SET NULL das FKs (actor_id, client_id) e executado como UPDATE e dispara este gatilho, que recusa.
--    Consequencia: apagar um usuario ou cliente que tenha linhas de auditoria falha, em vez de reescrever a trilha.
CREATE FUNCTION audit_logs_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs e append-only: % nao permitido', TG_OP USING ERRCODE = '42501';
END
$$;

CREATE TRIGGER audit_logs_no_change
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();

-- 3) ENABLE ALWAYS: o gatilho dispara tambem em sessoes com session_replication_role = replica (que desliga
--    gatilhos comuns, "ENABLE ORIGIN"). Limite aceito: superusuario ainda pode DISABLE/DROP TRIGGER ou usar
--    replicacao logica; isso e operacao de DDL fora do app.
ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER audit_logs_no_change;
ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER audit_logs_no_truncate;
