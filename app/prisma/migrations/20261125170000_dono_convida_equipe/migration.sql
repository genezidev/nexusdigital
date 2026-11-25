-- D-0026: o DONO do cliente (CLIENT_OWNER ativo) convida, ajusta permissoes e desativa COLABORADORES do PROPRIO cliente.
-- Antes (D-0022, migration 20261125140000) so ADMIN e sistema gravavam membros e convites. Agora os dois gatilhos abrem
-- exatamente um caso, e o banco continua recusando todo o resto, inclusive o dono de OUTRO cliente.
-- Reversao: prisma/rollback/20261125170000_dono_convida_equipe.down.sql

-- 1) O convite guarda as concessoes que o colaborador recebera ao aceitar (so "content:approve" existe).
ALTER TABLE "invitations" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE invitations ADD CONSTRAINT invitations_permissions_check CHECK (
  COALESCE(permissions, ARRAY[]::text[]) <@ ARRAY['content:approve']::text[]
  AND (role = 'CLIENT_COLLABORATOR' OR COALESCE(cardinality(permissions), 0) = 0));

-- 2) "Esta sessao e de um DONO ATIVO deste cliente": audiencia cliente, cliente da sessao = o da linha, e a pessoa da
--    sessao e CLIENT_OWNER com participacao ACTIVE nele. Todos os valores vem do banco (variaveis da transacao e a
--    tabela), nunca do que o navegador mandou. Roda como o chamador (RLS vale).
CREATE FUNCTION app_is_active_owner(cid uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
    SELECT app_audience() = 'client' AND cid IS NOT NULL AND cid = app_client_id() AND app_user_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM client_members m
       WHERE m.client_id = cid AND m.user_id = app_user_id() AND m.role = 'CLIENT_OWNER' AND m.status = 'ACTIVE')
  $$;

-- 3) Membros: ADMIN e sistema continuam podendo tudo. O dono ativo so ATUALIZA um COLABORADOR do proprio cliente que
--    nao seja ele mesmo, e so as colunas `permissions` e `status` (e updated_at): nao troca papel, pessoa, cliente nem
--    id. Concessao: so as que existem (content:approve), que o dono tem. Nao cria nem apaga membro por esta via
--    (o membro nasce quando o convite e aceito, em escopo de sistema).
CREATE OR REPLACE FUNCTION client_members_admin_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'nexo_app' OR app_is_admin() OR app_is_system() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND app_is_active_owner(OLD.client_id)
     AND OLD.role = 'CLIENT_COLLABORATOR' AND NEW.role = 'CLIENT_COLLABORATOR'
     AND OLD.id = NEW.id AND OLD.client_id = NEW.client_id AND OLD.user_id = NEW.user_id
     AND OLD.user_id <> app_user_id()
     AND COALESCE(NEW.permissions, ARRAY[]::text[]) <@ ARRAY['content:approve']::text[]
     AND (to_jsonb(NEW) - 'permissions' - 'status' - 'updated_at') = (to_jsonb(OLD) - 'permissions' - 'status' - 'updated_at')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'client_members: so o ADMIN ou o sistema criam, alteram ou removem membros; o dono do cliente so ajusta as permissoes e o acesso de colaboradores do proprio cliente' USING ERRCODE = '42501';
END
$$;

-- 4) Convites: o dono ativo CRIA convite de COLABORADOR para o proprio cliente (convidante = ele mesmo, pendente,
--    validade de ate 8 dias) e REVOGA convite pendente de colaborador (so `revoked_at` muda). Convite de OWNER, STAFF
--    ou de outro cliente, e qualquer apagamento, continuam so do ADMIN e do sistema.
CREATE OR REPLACE FUNCTION invitations_admin_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'nexo_app' OR app_is_admin() OR app_is_system() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND app_is_active_owner(NEW.client_id)
     AND NEW.role = 'CLIENT_COLLABORATOR' AND NEW.invited_by_id = app_user_id()
     AND NEW.used_at IS NULL AND NEW.used_by_user_id IS NULL AND NEW.revoked_at IS NULL
     AND NEW.expires_at <= now() + interval '8 days'
     AND COALESCE(NEW.permissions, ARRAY[]::text[]) <@ ARRAY['content:approve']::text[]
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND app_is_active_owner(OLD.client_id)
     AND OLD.role = 'CLIENT_COLLABORATOR' AND OLD.used_at IS NULL AND OLD.revoked_at IS NULL
     AND NEW.revoked_at IS NOT NULL
     AND (to_jsonb(NEW) - 'revoked_at') = (to_jsonb(OLD) - 'revoked_at')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invitations: so o ADMIN ou o sistema criam, alteram ou removem convite; o dono do cliente so convida e revoga convite de colaborador do proprio cliente' USING ERRCODE = '42501';
END
$$;

-- Os dois gatilhos ja existem (migration 20261125140000) e seguem ENABLE ALWAYS; CREATE OR REPLACE nao os desliga.
ALTER TABLE client_members ENABLE ALWAYS TRIGGER client_members_admin_only;
ALTER TABLE invitations ENABLE ALWAYS TRIGGER invitations_admin_only;
