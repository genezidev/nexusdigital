-- Desfaz 20261125100000_planos_conteudos_aprovacao_arquivos. Rodar com o dono do banco, so em dev/teste.
-- Em producao, a volta e restaurar o backup tirado antes da migration (playbook/vps.md).
-- Apaga TODAS as linhas das tabelas da fase 2 (e as de audit_logs continuam, pois a auditoria e imutavel).
-- Apos rodar, apague a linha desta migration em _prisma_migrations para poder reaplicar.
DROP FUNCTION IF EXISTS cycle_progress_counts(uuid);
DROP TABLE IF EXISTS asset_links, assets, recordings, script_scenes, comments, approvals, scripts,
  content_versions, contents, editorial_cycles, subscriptions, service_plans CASCADE;
DROP FUNCTION IF EXISTS asset_links_guard();
DROP FUNCTION IF EXISTS assets_guard();
DROP FUNCTION IF EXISTS recordings_guard();
DROP FUNCTION IF EXISTS comments_guard();
DROP FUNCTION IF EXISTS approvals_guard();
DROP FUNCTION IF EXISTS contents_invalidate_approvals();
DROP FUNCTION IF EXISTS contents_guard();
DROP FUNCTION IF EXISTS content_versions_guard();
DROP FUNCTION IF EXISTS editorial_cycles_guard();
DROP FUNCTION IF EXISTS subscriptions_guard();
DROP FUNCTION IF EXISTS service_plans_guard();
DROP FUNCTION IF EXISTS app_in_scope(uuid);
DROP FUNCTION IF EXISTS app_is_admin();
DROP FUNCTION IF EXISTS app_is_agency();
DROP FUNCTION IF EXISTS app_user_id();
DROP FUNCTION IF EXISTS app_audience();
DROP TYPE IF EXISTS "AssetLinkRole", "AssetCategory", "ScanStatus", "AssetStatus", "RecordingStatus", "RecordingKind",
  "ScriptStatus", "ApprovalDecision", "VersionStatus", "ContentStatus", "Channel", "ContentFormat", "CycleStatus",
  "SubscriptionStatus", "Visibility";
