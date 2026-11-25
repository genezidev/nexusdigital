-- Revisao independente de seguranca da fase 2 (achados M-A, B-1, B-2 e extras). Esta migration NAO altera as
-- anteriores (checksums intactos): so acrescenta.
-- Reversao: prisma/rollback/20261125140000_endurecimento_revisao_fase2.down.sql
--
-- Nota sobre `current_user = 'nexo_app'` nos gatilhos B-1 e B-2: eles valem para o papel que o app usa em
-- producao (e que um SQL injetado alcancaria). O dono do banco (migrate, seed e fixtures de teste) nao e
-- restringido por eles: ele pode desligar qualquer gatilho de qualquer forma (limite aceito, como em R-10).

-- 1) Configuracao da instalacao (M-A). Guarda o identificador aleatorio desta instalacao; a limpeza de arquivos
--    so roda quando ele combina com o `.install-id` da pasta de armazenamento. O app so le e cria (GRANT sem
--    UPDATE nem DELETE) e so em escopo de sistema (RLS).
CREATE TABLE app_settings (
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT app_settings_pkey PRIMARY KEY (key),
  CONSTRAINT app_settings_values_check CHECK (key ~ '^[a-z][a-z0-9_]{0,63}$' AND char_length(value) BETWEEN 1 AND 200)
);
INSERT INTO app_settings (key, value) VALUES ('installation_id', gen_random_uuid()::text);

GRANT SELECT, INSERT ON app_settings TO nexo_app;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY app_settings_select ON app_settings FOR SELECT TO nexo_app USING (app_is_system());
CREATE POLICY app_settings_insert ON app_settings FOR INSERT TO nexo_app WITH CHECK (app_is_system());

-- 1b) Cota por cliente (M-B). A RLS de `assets` mostra ao cliente so o que ele mesmo enviou (e o que esta ligado a um
--     destino visivel): somar bytes pela sessao dele conta so a parte dele, e cada colaborador teria uma "cota"
--     propria, sem enxergar os arquivos INTERNOS da agencia. Este SECURITY DEFINER devolve so um NUMERO (bytes ocupados
--     pelo cliente da sessao), na mesma transacao da trava por cliente. Mesma dependencia de cycle_progress_counts: o
--     dono da funcao ignora RLS (superusuario ou BYPASSRLS, como exige docs/runbook-producao.md).
CREATE FUNCTION client_storage_bytes(p_client_id uuid, p_pending_since timestamptz, p_exclude_asset_id uuid DEFAULT NULL)
  RETURNS bigint
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  total bigint;
BEGIN
  IF NOT (p_client_id = app_client_id() OR app_is_system()) THEN
    RAISE EXCEPTION 'client_storage_bytes: so o cliente da sessao' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(SUM(a.bytes), 0)::bigint INTO total FROM assets a
   WHERE a.client_id = p_client_id
     AND (p_exclude_asset_id IS NULL OR a.id <> p_exclude_asset_id)
     AND (a.status = 'DISPONIVEL' OR (a.status = 'PENDENTE' AND a.created_at >= p_pending_since));
  RETURN total;
END
$$;
REVOKE ALL ON FUNCTION client_storage_bytes(uuid, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION client_storage_bytes(uuid, timestamptz, uuid) TO nexo_app;

-- 1c) Teto global: soma de TODOS os clientes, so um numero, so em escopo de sistema (`app.system = on`, que o app so liga
--     para a verificacao de capacidade). Antes a soma passava pela RLS linha a linha (cerca de 50 microssegundos por
--     linha: 180 ms com 3 400 arquivos, e cresce com a tabela, em CADA pedido e CADA envio); com a funcao e 1 ms.
CREATE FUNCTION storage_bytes_total(p_pending_since timestamptz, p_exclude_asset_id uuid DEFAULT NULL)
  RETURNS bigint
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  total bigint;
BEGIN
  IF NOT app_is_system() THEN
    RAISE EXCEPTION 'storage_bytes_total: so o escopo de sistema' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(SUM(a.bytes), 0)::bigint INTO total FROM assets a
   WHERE (p_exclude_asset_id IS NULL OR a.id <> p_exclude_asset_id)
     AND (a.status = 'DISPONIVEL' OR (a.status = 'PENDENTE' AND a.created_at >= p_pending_since));
  RETURN total;
END
$$;
REVOKE ALL ON FUNCTION storage_bytes_total(timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storage_bytes_total(timestamptz, uuid) TO nexo_app;

-- 2) B-1: o cliente so muda o status de um conteudo AGUARDANDO_APROVACAO para APROVADO ou EM_REVISAO se existir
--    uma decisao ATIVA da versao atual, feita por ELE (app.user_id), do tipo correspondente e registrada NESTA
--    MESMA transacao (created_at = now() arredondado a ms, que o gatilho approvals_guard grava com o horario do servidor).
CREATE FUNCTION contents_client_decision_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'nexo_app' OR app_is_agency() OR app_is_system() THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'AGUARDANDO_APROVACAO' AND NEW.status IN ('APROVADO', 'EM_REVISAO') AND EXISTS (
    SELECT 1 FROM approvals a
     WHERE a.client_id = NEW.client_id AND a.content_id = NEW.id AND a.version_id = NEW.current_version_id
       AND a.invalidated_at IS NULL AND a.author_id = app_user_id()
       AND a.decision = (CASE NEW.status WHEN 'APROVADO' THEN 'APROVADO' ELSE 'REVISAO_SOLICITADA' END)::"ApprovalDecision"
       AND a.created_at = now()::timestamptz(3)
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'contents: o cliente so muda o status com uma decisao ativa dele sobre a versao atual, registrada nesta mesma operacao' USING ERRCODE = '42501';
END
$$;
CREATE TRIGGER contents_client_decision_guard BEFORE UPDATE OF status ON contents
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION contents_client_decision_guard();

-- 2b) Complemento de B-1: o banco tambem conhece quem pode decidir (dono do cliente, ou colaborador com a
--     concessao `content:approve`, ambos com participacao ATIVA). Sem isso, um colaborador sem a concessao
--     gravaria a decisao por SQL, porque a matriz de permissoes so existia no codigo.
CREATE FUNCTION approvals_client_permission_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'nexo_app' OR app_is_agency() OR app_is_system() THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM client_members m
     WHERE m.client_id = NEW.client_id AND m.user_id = app_user_id() AND m.status = 'ACTIVE'
       AND (m.role = 'CLIENT_OWNER' OR (m.role = 'CLIENT_COLLABORATOR' AND 'content:approve' = ANY (m.permissions)))
  ) THEN
    RAISE EXCEPTION 'approvals: so quem tem a permissao content:approve registra a decisao' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER approvals_client_permission_guard BEFORE INSERT ON approvals
  FOR EACH ROW EXECUTE FUNCTION approvals_client_permission_guard();

-- 3) B-2: papel, permissoes, status e a propria existencia de um membro (e de um convite, que viraria um membro)
--    so mudam por ADMIN ou escopo de sistema. A politica tenant_isolation e FOR ALL e o GRANT e da tabela inteira;
--    por isso o gatilho. Nenhuma rota HTTP escreve essas colunas pela sessao do cliente.
CREATE FUNCTION client_members_admin_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'nexo_app' AND NOT (app_is_admin() OR app_is_system()) THEN
    RAISE EXCEPTION 'client_members: so o ADMIN ou o sistema criam, alteram ou removem membros' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER client_members_admin_only BEFORE INSERT OR UPDATE OR DELETE ON client_members
  FOR EACH ROW EXECUTE FUNCTION client_members_admin_only();

CREATE FUNCTION invitations_admin_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'nexo_app' AND NOT (app_is_admin() OR app_is_system()) THEN
    RAISE EXCEPTION 'invitations: so o ADMIN ou o sistema criam, alteram ou removem convite' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER invitations_admin_only BEFORE INSERT OR UPDATE OR DELETE ON invitations
  FOR EACH ROW EXECUTE FUNCTION invitations_admin_only();

-- 4) Gatilhos de regra ENABLE ALWAYS: valem tambem com session_replication_role = replica (que desliga os
--    gatilhos "ENABLE ORIGIN"), como ja era em audit_logs, approvals, comments e content_versions.
ALTER TABLE contents ENABLE ALWAYS TRIGGER contents_guard;
ALTER TABLE contents ENABLE ALWAYS TRIGGER contents_invalidate_approvals;
ALTER TABLE contents ENABLE ALWAYS TRIGGER contents_client_decision_guard;
ALTER TABLE assets ENABLE ALWAYS TRIGGER assets_guard;
ALTER TABLE asset_links ENABLE ALWAYS TRIGGER asset_links_guard;
ALTER TABLE recordings ENABLE ALWAYS TRIGGER recordings_guard;
ALTER TABLE subscriptions ENABLE ALWAYS TRIGGER subscriptions_guard;
ALTER TABLE editorial_cycles ENABLE ALWAYS TRIGGER editorial_cycles_guard;
ALTER TABLE service_plans ENABLE ALWAYS TRIGGER service_plans_guard;
ALTER TABLE client_members ENABLE ALWAYS TRIGGER client_members_role_check;
ALTER TABLE client_members ENABLE ALWAYS TRIGGER client_members_admin_only;
ALTER TABLE invitations ENABLE ALWAYS TRIGGER invitations_admin_only;
ALTER TABLE approvals ENABLE ALWAYS TRIGGER approvals_client_permission_guard;
