-- Segunda camada de isolamento (D-0003/D-0004): papel do app sem BYPASSRLS, GRANTs minimos,
-- RLS forcado nas tabelas de cliente, restricoes extras e append-only da auditoria.
-- Reversao: prisma/rollback/20261124151100_rls_e_papeis.down.sql

-- 1) Papel usado pelo app em runtime. Sem senha aqui: a senha e definida fora do Git
--    (scripts/preparar-papel-app.mjs com APP_DB_PASSWORD). Sem senha, o papel nao conecta.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_app') THEN
    CREATE ROLE nexo_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;

-- 2) GRANT e RLS sao camadas diferentes: toda tabela nova precisa das duas.
GRANT USAGE ON SCHEMA public TO nexo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, accounts, verifications, client_members, invitations TO nexo_app;
GRANT SELECT, INSERT, UPDATE ON clients TO nexo_app;           -- cliente e arquivado, nunca apagado pelo app
GRANT SELECT, INSERT ON audit_logs TO nexo_app;                -- append-only: sem UPDATE nem DELETE

-- 3) Contexto do pedido, definido por transacao pelo codigo (src/server/db/scope.ts).
--    Sem contexto, nenhuma linha e visivel (nega por padrao).
CREATE FUNCTION app_client_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.client_id', true), '')::uuid $$;

CREATE FUNCTION app_is_system() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT COALESCE(current_setting('app.system', true), '') = 'on' $$;

-- 4) RLS forcado (vale ate para o dono da tabela; superusuarios continuam ignorando RLS).
ALTER TABLE clients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients        FORCE  ROW LEVEL SECURITY;
ALTER TABLE client_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_members FORCE  ROW LEVEL SECURITY;
ALTER TABLE invitations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations    FORCE  ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON clients
  FOR ALL TO nexo_app
  USING (id = app_client_id() OR app_is_system())
  WITH CHECK (id = app_client_id() OR app_is_system());

CREATE POLICY tenant_isolation ON client_members
  FOR ALL TO nexo_app
  USING (client_id = app_client_id() OR app_is_system())
  WITH CHECK (client_id = app_client_id() OR app_is_system());

CREATE POLICY tenant_isolation ON invitations
  FOR ALL TO nexo_app
  USING (client_id = app_client_id() OR app_is_system())
  WITH CHECK (client_id = app_client_id() OR app_is_system());

CREATE POLICY tenant_select ON audit_logs
  FOR SELECT TO nexo_app
  USING (client_id = app_client_id() OR app_is_system());

CREATE POLICY tenant_insert ON audit_logs
  FOR INSERT TO nexo_app
  WITH CHECK (client_id = app_client_id() OR app_is_system());

-- 5) Restricoes extras.
ALTER TABLE users       ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));
ALTER TABLE invitations ADD CONSTRAINT invitations_email_lowercase CHECK (email = lower(email));
ALTER TABLE invitations ADD CONSTRAINT invitations_expiry_after_creation CHECK (expires_at > created_at);
ALTER TABLE invitations ADD CONSTRAINT invitations_token_hash_hex CHECK (token_hash ~ '^[0-9a-f]{64}$');

-- Um convite pendente por e-mail e cliente.
CREATE UNIQUE INDEX invitations_pending_unique
  ON invitations (client_id, email)
  WHERE used_at IS NULL AND revoked_at IS NULL;

-- Papel na empresa precisa combinar com o papel global: STAFF so com users.role = STAFF,
-- papeis do cliente so com users.role = USER (ADMIN nao e membro de cliente).
CREATE FUNCTION client_members_check_role() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE global_role "GlobalRole";
BEGIN
  SELECT role INTO global_role FROM users WHERE id = NEW.user_id;
  IF NEW.role = 'STAFF' AND global_role IS DISTINCT FROM 'STAFF' THEN
    RAISE EXCEPTION 'membro STAFF exige usuario com papel global STAFF' USING ERRCODE = '23514';
  END IF;
  IF NEW.role <> 'STAFF' AND global_role IS DISTINCT FROM 'USER' THEN
    RAISE EXCEPTION 'membro de cliente exige usuario com papel global USER' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER client_members_role_check
  BEFORE INSERT OR UPDATE OF role, user_id ON client_members
  FOR EACH ROW EXECUTE FUNCTION client_members_check_role();
