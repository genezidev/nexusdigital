-- Desfaz 20261125170000_dono_convida_equipe: volta os gatilhos de membros e convites ao texto da migration 20261125140000
-- (so ADMIN e sistema gravam) e remove a coluna invitations.permissions. Rodar com o dono do banco, so em dev/teste.
-- Em producao, a volta e restaurar o backup tirado antes da migration (playbook/vps.md).
-- Apos rodar, apague a linha desta migration em _prisma_migrations para poder reaplicar.
CREATE OR REPLACE FUNCTION client_members_admin_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'nexo_app' AND NOT (app_is_admin() OR app_is_system()) THEN
    RAISE EXCEPTION 'client_members: so o ADMIN ou o sistema criam, alteram ou removem membros' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION invitations_admin_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'nexo_app' AND NOT (app_is_admin() OR app_is_system()) THEN
    RAISE EXCEPTION 'invitations: so o ADMIN ou o sistema criam, alteram ou removem convite' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

DROP FUNCTION IF EXISTS app_is_active_owner(uuid);
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_permissions_check;
ALTER TABLE invitations DROP COLUMN IF EXISTS permissions;
