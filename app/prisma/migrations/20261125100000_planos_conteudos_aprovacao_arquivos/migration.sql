-- Fase 2 (spec 0002), parte 1: tabelas, enums, indices e chaves estrangeiras COMPOSTAS (client_id, id).
-- Gerado por 'prisma migrate diff' a partir do schema da fase 1; a parte 2 (regras, GRANT e RLS) segue no mesmo arquivo.

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('INTERNO', 'COMPARTILHADO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ATIVA', 'PAUSADA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('ABERTO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('ARTE', 'CARROSSEL', 'REEL_ANIMADO', 'REEL_HUMANIZADO', 'STORY', 'OUTRO');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'OUTRO');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('PLANEJADO', 'EM_PRODUCAO', 'AGUARDANDO_APROVACAO', 'EM_REVISAO', 'APROVADO', 'AGENDADO', 'PUBLICADO', 'ANALISADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('RASCUNHO', 'ENVIADA');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APROVADO', 'REVISAO_SOLICITADA');

-- CreateEnum
CREATE TYPE "ScriptStatus" AS ENUM ('RASCUNHO', 'ENVIADO', 'AGUARDANDO_GRAVACAO', 'GRAVACAO_RECEBIDA', 'EM_EDICAO', 'AGUARDANDO_APROVACAO', 'FINALIZADO', 'PUBLICADO');

-- CreateEnum
CREATE TYPE "RecordingKind" AS ENUM ('ARQUIVO', 'LINK');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('ENVIADA', 'RECEBIDA', 'REGRAVACAO_SOLICITADA');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDENTE', 'DISPONIVEL', 'REJEITADO', 'EXCLUIDO');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('NAO_VERIFICADO', 'LIMPO', 'QUARENTENA');

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('IMAGEM', 'VIDEO', 'DOCUMENTO');

-- CreateEnum
CREATE TYPE "AssetLinkRole" AS ENUM ('PREVIA', 'FINAL', 'REFERENCIA', 'PDF_ROTEIRO', 'GRAVACAO', 'EVIDENCIA');

-- CreateTable
CREATE TABLE "service_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_amount_cents" INTEGER NOT NULL,
    "monthly_quota" INTEGER NOT NULL,
    "revisions_per_piece" INTEGER NOT NULL,
    "approval_deadline_business_days" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "exclusions" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_code" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "plan_version" INTEGER NOT NULL,
    "scope_snapshot" TEXT NOT NULL,
    "exclusions_snapshot" TEXT NOT NULL DEFAULT '',
    "amount_cents" INTEGER NOT NULL,
    "quota" INTEGER NOT NULL,
    "revisions_per_piece" INTEGER NOT NULL,
    "approval_deadline_business_days" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "billing_day" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ATIVA',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_cycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "quota" INTEGER NOT NULL,
    "previous_quota" INTEGER,
    "quota_change_reason" TEXT,
    "status" "CycleStatus" NOT NULL DEFAULT 'ABERTO',
    "closed_at" TIMESTAMPTZ(3),
    "close_snapshot" JSONB,
    "reopened_at" TIMESTAMPTZ(3),
    "reopen_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "editorial_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "format" "ContentFormat" NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'INSTAGRAM',
    "objective" TEXT,
    "pillar" TEXT,
    "planned_on" DATE NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "publication_url" TEXT,
    "assignee_id" UUID,
    "assignee_visible_to_client" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContentStatus" NOT NULL DEFAULT 'PLANEJADO',
    "visibility" "Visibility" NOT NULL DEFAULT 'INTERNO',
    "counts_toward_quota" BOOLEAN NOT NULL DEFAULT true,
    "is_bonus" BOOLEAN NOT NULL DEFAULT false,
    "current_version_id" UUID,
    "internal_notes" TEXT,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'RASCUNHO',
    "caption" TEXT,
    "cta" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "briefing" TEXT,
    "author_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidated_at" TIMESTAMPTZ(3),
    "invalidation_reason" TEXT,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "content_id" UUID,
    "script_id" UUID,
    "version_id" UUID,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'INTERNO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scripts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "content_id" UUID,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "planned_duration_seconds" INTEGER,
    "assignee_id" UUID,
    "deadline_on" DATE,
    "location" TEXT,
    "equipment" TEXT,
    "vertical_9_16" BOOLEAN NOT NULL DEFAULT true,
    "audio_notes" TEXT,
    "light_notes" TEXT,
    "framing_notes" TEXT,
    "reference_links" JSONB NOT NULL DEFAULT '[]',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "status" "ScriptStatus" NOT NULL DEFAULT 'RASCUNHO',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "script_scenes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "script_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "dialogue" TEXT,
    "action" TEXT,
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "script_scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "script_id" UUID NOT NULL,
    "kind" "RecordingKind" NOT NULL,
    "external_url" TEXT,
    "status" "RecordingStatus" NOT NULL DEFAULT 'ENVIADA',
    "submitted_by_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "image_rights_confirmed_at" TIMESTAMPTZ(3),
    "feedback" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT,
    "category" "AssetCategory",
    "bytes" BIGINT,
    "checksum_sha256" TEXT,
    "original_name" TEXT NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDENTE',
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'NAO_VERIFICADO',
    "visibility" "Visibility" NOT NULL DEFAULT 'INTERNO',
    "finalized_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "version_id" UUID,
    "script_id" UUID,
    "recording_id" UUID,
    "content_id" UUID,
    "role" "AssetLinkRole" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_plans_code_version_key" ON "service_plans"("code", "version");

-- CreateIndex
CREATE INDEX "subscriptions_client_id_status_idx" ON "subscriptions"("client_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_client_id_id_key" ON "subscriptions"("client_id", "id");

-- CreateIndex
CREATE INDEX "editorial_cycles_client_id_year_month_idx" ON "editorial_cycles"("client_id", "year", "month");

-- CreateIndex
CREATE INDEX "editorial_cycles_client_id_status_idx" ON "editorial_cycles"("client_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_cycles_subscription_id_year_month_key" ON "editorial_cycles"("subscription_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "editorial_cycles_client_id_id_key" ON "editorial_cycles"("client_id", "id");

-- CreateIndex
CREATE INDEX "contents_client_id_status_idx" ON "contents"("client_id", "status");

-- CreateIndex
CREATE INDEX "contents_client_id_planned_on_idx" ON "contents"("client_id", "planned_on");

-- CreateIndex
CREATE INDEX "contents_client_id_cycle_id_idx" ON "contents"("client_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "contents_client_id_id_key" ON "contents"("client_id", "id");

-- CreateIndex
CREATE INDEX "content_versions_client_id_content_id_idx" ON "content_versions"("client_id", "content_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_versions_content_id_number_key" ON "content_versions"("content_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "content_versions_client_id_id_key" ON "content_versions"("client_id", "id");

-- CreateIndex
CREATE INDEX "approvals_client_id_content_id_created_at_idx" ON "approvals"("client_id", "content_id", "created_at");

-- CreateIndex
CREATE INDEX "approvals_version_id_idx" ON "approvals"("version_id");

-- CreateIndex
CREATE INDEX "comments_client_id_content_id_created_at_idx" ON "comments"("client_id", "content_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_client_id_script_id_created_at_idx" ON "comments"("client_id", "script_id", "created_at");

-- CreateIndex
CREATE INDEX "scripts_client_id_status_idx" ON "scripts"("client_id", "status");

-- CreateIndex
CREATE INDEX "scripts_client_id_content_id_idx" ON "scripts"("client_id", "content_id");

-- CreateIndex
CREATE UNIQUE INDEX "scripts_client_id_id_key" ON "scripts"("client_id", "id");

-- CreateIndex
CREATE INDEX "script_scenes_client_id_script_id_idx" ON "script_scenes"("client_id", "script_id");

-- CreateIndex
CREATE UNIQUE INDEX "script_scenes_script_id_position_key" ON "script_scenes"("script_id", "position");

-- CreateIndex
CREATE INDEX "recordings_client_id_script_id_submitted_at_idx" ON "recordings"("client_id", "script_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_client_id_id_key" ON "recordings"("client_id", "id");

-- CreateIndex
CREATE INDEX "assets_client_id_status_created_at_idx" ON "assets"("client_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "assets_storage_key_key" ON "assets"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "assets_client_id_id_key" ON "assets"("client_id", "id");

-- CreateIndex
CREATE INDEX "asset_links_client_id_asset_id_idx" ON "asset_links"("client_id", "asset_id");

-- CreateIndex
CREATE INDEX "asset_links_client_id_version_id_idx" ON "asset_links"("client_id", "version_id");

-- CreateIndex
CREATE INDEX "asset_links_client_id_script_id_idx" ON "asset_links"("client_id", "script_id");

-- CreateIndex
CREATE INDEX "asset_links_client_id_recording_id_idx" ON "asset_links"("client_id", "recording_id");

-- CreateIndex
CREATE INDEX "asset_links_client_id_content_id_idx" ON "asset_links"("client_id", "content_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_links_asset_id_version_id_key" ON "asset_links"("asset_id", "version_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_links_asset_id_script_id_key" ON "asset_links"("asset_id", "script_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_links_asset_id_recording_id_key" ON "asset_links"("asset_id", "recording_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_links_asset_id_content_id_key" ON "asset_links"("asset_id", "content_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_links_version_id_role_position_key" ON "asset_links"("version_id", "role", "position");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "service_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_cycles" ADD CONSTRAINT "editorial_cycles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_cycles" ADD CONSTRAINT "editorial_cycles_client_id_subscription_id_fkey" FOREIGN KEY ("client_id", "subscription_id") REFERENCES "subscriptions"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_client_id_cycle_id_fkey" FOREIGN KEY ("client_id", "cycle_id") REFERENCES "editorial_cycles"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_client_id_current_version_id_fkey" FOREIGN KEY ("client_id", "current_version_id") REFERENCES "content_versions"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_client_id_content_id_fkey" FOREIGN KEY ("client_id", "content_id") REFERENCES "contents"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_client_id_content_id_fkey" FOREIGN KEY ("client_id", "content_id") REFERENCES "contents"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_client_id_version_id_fkey" FOREIGN KEY ("client_id", "version_id") REFERENCES "content_versions"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_client_id_content_id_fkey" FOREIGN KEY ("client_id", "content_id") REFERENCES "contents"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_client_id_script_id_fkey" FOREIGN KEY ("client_id", "script_id") REFERENCES "scripts"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_client_id_version_id_fkey" FOREIGN KEY ("client_id", "version_id") REFERENCES "content_versions"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_client_id_content_id_fkey" FOREIGN KEY ("client_id", "content_id") REFERENCES "contents"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "script_scenes" ADD CONSTRAINT "script_scenes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "script_scenes" ADD CONSTRAINT "script_scenes_client_id_script_id_fkey" FOREIGN KEY ("client_id", "script_id") REFERENCES "scripts"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_client_id_script_id_fkey" FOREIGN KEY ("client_id", "script_id") REFERENCES "scripts"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_client_id_asset_id_fkey" FOREIGN KEY ("client_id", "asset_id") REFERENCES "assets"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_client_id_version_id_fkey" FOREIGN KEY ("client_id", "version_id") REFERENCES "content_versions"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_client_id_script_id_fkey" FOREIGN KEY ("client_id", "script_id") REFERENCES "scripts"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_client_id_recording_id_fkey" FOREIGN KEY ("client_id", "recording_id") REFERENCES "recordings"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_client_id_content_id_fkey" FOREIGN KEY ("client_id", "content_id") REFERENCES "contents"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- =====================================================================================
-- Fase 2, parte 2: contexto de pedido, CHECKs, indices parciais, gatilhos, GRANT e RLS.
-- GRANT e RLS sao camadas diferentes (playbook/licoes-de-producao.md): as duas estao neste arquivo.
-- Reversao: prisma/rollback/20261125100000_planos_conteudos_aprovacao_arquivos.down.sql
-- =====================================================================================

-- 1) Contexto do pedido. `app.audience` (admin | staff | client) e `app.user_id` sao gravados por
--    transacao em src/server/db/scope.ts. Sem contexto, o valor padrao e `client` (o menos privilegiado).
CREATE FUNCTION app_audience() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT COALESCE(NULLIF(current_setting('app.audience', true), ''), 'client') $$;

CREATE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION app_is_agency() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT app_audience() IN ('admin', 'staff') $$;

CREATE FUNCTION app_is_admin() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT app_audience() = 'admin' $$;

CREATE FUNCTION app_in_scope(cid uuid) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT cid = app_client_id() OR app_is_system() $$;

-- 2) CHECKs (regras que o banco recusa mesmo se o codigo errar).
ALTER TABLE service_plans ADD CONSTRAINT service_plans_values_check CHECK (
  version >= 1 AND monthly_amount_cents >= 0 AND monthly_quota >= 0 AND revisions_per_piece >= 0
  AND approval_deadline_business_days >= 0 AND code ~ '^[a-z0-9][a-z0-9-]{1,63}$' AND char_length(name) BETWEEN 1 AND 120);

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_values_check CHECK (
  amount_cents >= 0 AND quota >= 0 AND revisions_per_piece >= 0 AND approval_deadline_business_days >= 0
  AND billing_day BETWEEN 1 AND 28 AND (ends_on IS NULL OR ends_on >= starts_on));

ALTER TABLE editorial_cycles ADD CONSTRAINT editorial_cycles_values_check CHECK (
  month BETWEEN 1 AND 12 AND year BETWEEN 2020 AND 2100 AND quota >= 0
  AND (previous_quota IS NULL OR (quota_change_reason IS NOT NULL AND char_length(btrim(quota_change_reason)) >= 10))
  AND (status = 'ABERTO' OR (closed_at IS NOT NULL AND close_snapshot IS NOT NULL))
  AND (reopened_at IS NULL OR (reopen_reason IS NOT NULL AND char_length(btrim(reopen_reason)) >= 10)));

ALTER TABLE contents ADD CONSTRAINT contents_values_check CHECK (
  char_length(btrim(title)) BETWEEN 1 AND 200
  AND (status <> 'CANCELADO' OR (cancel_reason IS NOT NULL AND char_length(btrim(cancel_reason)) >= 10 AND cancelled_at IS NOT NULL))
  AND (status NOT IN ('PUBLICADO', 'ANALISADO') OR published_at IS NOT NULL)
  AND (publication_url IS NULL OR (publication_url ~ '^https://[^[:space:][:cntrl:]]+$' AND char_length(publication_url) <= 2048)));

ALTER TABLE content_versions ADD CONSTRAINT content_versions_values_check CHECK (
  number >= 1 AND (status = 'RASCUNHO' OR sent_at IS NOT NULL));

ALTER TABLE approvals ADD CONSTRAINT approvals_values_check CHECK (
  (comment IS NULL OR char_length(comment) <= 2000)
  AND (decision <> 'REVISAO_SOLICITADA' OR (comment IS NOT NULL AND char_length(btrim(comment)) >= 1))
  AND ((invalidated_at IS NULL) = (invalidation_reason IS NULL)));

ALTER TABLE comments ADD CONSTRAINT comments_values_check CHECK (
  ((content_id IS NOT NULL)::int + (script_id IS NOT NULL)::int = 1)
  AND char_length(btrim(body)) BETWEEN 1 AND 2000
  AND (version_id IS NULL OR content_id IS NOT NULL));

ALTER TABLE scripts ADD CONSTRAINT scripts_values_check CHECK (
  char_length(btrim(title)) BETWEEN 1 AND 200 AND (planned_duration_seconds IS NULL OR planned_duration_seconds >= 0)
  AND jsonb_typeof(reference_links) = 'array' AND jsonb_typeof(checklist) = 'array');

ALTER TABLE script_scenes ADD CONSTRAINT script_scenes_values_check CHECK (
  "position" >= 0 AND (duration_seconds IS NULL OR duration_seconds >= 0));

ALTER TABLE recordings ADD CONSTRAINT recordings_values_check CHECK (
  ((kind = 'LINK') = (external_url IS NOT NULL))
  AND (external_url IS NULL OR (external_url ~ '^https://[^[:space:][:cntrl:]]+$' AND char_length(external_url) <= 2048))
  AND (status <> 'REGRAVACAO_SOLICITADA' OR (feedback IS NOT NULL AND char_length(btrim(feedback)) >= 10))
  AND ((reviewed_by_id IS NULL) = (reviewed_at IS NULL)));

ALTER TABLE assets ADD CONSTRAINT assets_values_check CHECK (
  storage_key ~ ('^clients/' || client_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  AND char_length(original_name) BETWEEN 1 AND 255
  AND original_name !~ '[[:cntrl:]]' AND original_name !~ E'[\\u202A-\\u202E\\u2066-\\u2069]'
  AND (bytes IS NULL OR bytes > 0)
  AND (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$')
  AND (mime_type IS NULL OR mime_type ~ '^[a-z]+/[a-z0-9.+-]+$')
  AND (status <> 'DISPONIVEL' OR (mime_type IS NOT NULL AND category IS NOT NULL AND bytes IS NOT NULL AND checksum_sha256 IS NOT NULL AND finalized_at IS NOT NULL))
  AND (status <> 'EXCLUIDO' OR deleted_at IS NOT NULL));

ALTER TABLE asset_links ADD CONSTRAINT asset_links_values_check CHECK (
  ((version_id IS NOT NULL)::int + (script_id IS NOT NULL)::int + (recording_id IS NOT NULL)::int + (content_id IS NOT NULL)::int = 1)
  AND "position" >= 0
  AND ((role IN ('PREVIA', 'FINAL') AND version_id IS NOT NULL)
    OR (role = 'REFERENCIA' AND (version_id IS NOT NULL OR script_id IS NOT NULL))
    OR (role = 'PDF_ROTEIRO' AND script_id IS NOT NULL)
    OR (role = 'GRAVACAO' AND recording_id IS NOT NULL)
    OR (role = 'EVIDENCIA' AND content_id IS NOT NULL)));

-- 3) Indices parciais (Prisma nao os expressa; o `migrate diff` continua sem diferenca).
-- No maximo UMA assinatura ATIVA por cliente.
CREATE UNIQUE INDEX subscriptions_one_active_per_client ON subscriptions (client_id) WHERE status = 'ATIVA';
-- No maximo UMA decisao ativa por versao: a primeira vence, a segunda falha (23505). Invalidar libera o indice.
CREATE UNIQUE INDEX approvals_one_active_decision_per_version ON approvals (version_id) WHERE invalidated_at IS NULL;
-- No maximo UM rascunho por conteudo.
CREATE UNIQUE INDEX content_versions_one_draft_per_content ON content_versions (content_id) WHERE status = 'RASCUNHO';

-- 4) Gatilhos.

-- Plano publicado nao e editado (so `active`) nem apagado: mudanca = nova versao.
CREATE FUNCTION service_plans_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'service_plans: plano publicado nao e apagado' USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(NEW) - 'active') IS DISTINCT FROM (to_jsonb(OLD) - 'active') THEN
    RAISE EXCEPTION 'service_plans: plano publicado nao e editado; crie uma nova versao' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER service_plans_guard BEFORE UPDATE OR DELETE ON service_plans
  FOR EACH ROW EXECUTE FUNCTION service_plans_guard();

-- Assinatura: o retrato do plano e congelado; so estado, fim e dia de cobranca mudam.
CREATE FUNCTION subscriptions_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'status' - 'ends_on' - 'billing_day' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'ends_on' - 'billing_day' - 'updated_at') THEN
    RAISE EXCEPTION 'subscriptions: o retrato do plano e congelado; renove criando nova assinatura' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER subscriptions_guard BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION subscriptions_guard();

-- Ciclo: ano, mes e assinatura nao mudam; ciclo ENCERRADO nao muda (so reabre, com justificativa).
CREATE FUNCTION editorial_cycles_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.client_id <> OLD.client_id OR NEW.subscription_id <> OLD.subscription_id OR NEW.year <> OLD.year OR NEW.month <> OLD.month THEN
    RAISE EXCEPTION 'editorial_cycles: competencia e assinatura nao mudam' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'ENCERRADO' THEN
    IF NEW.status = 'ABERTO' THEN
      IF NEW.reopened_at IS NULL OR NEW.reopen_reason IS NULL OR char_length(btrim(NEW.reopen_reason)) < 10 THEN
        RAISE EXCEPTION 'editorial_cycles: reabrir exige justificativa' USING ERRCODE = '23514';
      END IF;
    ELSIF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
      RAISE EXCEPTION 'editorial_cycles: ciclo encerrado nao muda' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER editorial_cycles_guard BEFORE UPDATE ON editorial_cycles
  FOR EACH ROW EXECUTE FUNCTION editorial_cycles_guard();

-- Versao: numero sequencial por conteudo; ENVIADA e imutavel; historico nunca e apagado.
CREATE FUNCTION content_versions_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE next_number int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(MAX(number), 0) + 1 INTO next_number FROM content_versions WHERE content_id = NEW.content_id;
    IF NEW.number <> next_number THEN
      RAISE EXCEPTION 'content_versions: numero deve ser sequencial (esperado %)', next_number USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'content_versions: o historico de versoes nao e apagado' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'ENVIADA' THEN
    RAISE EXCEPTION 'content_versions: versao ENVIADA e imutavel' USING ERRCODE = '42501';
  END IF;
  IF NEW.client_id <> OLD.client_id OR NEW.content_id <> OLD.content_id OR NEW.number <> OLD.number OR NEW.author_id <> OLD.author_id THEN
    RAISE EXCEPTION 'content_versions: conteudo, numero e autor nao mudam' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER content_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON content_versions
  FOR EACH ROW EXECUTE FUNCTION content_versions_guard();
ALTER TABLE content_versions ENABLE ALWAYS TRIGGER content_versions_guard;

-- Conteudo: ciclo aberto para entrar; CANCELADO terminal; a versao atual so avanca para uma versao
-- ENVIADA do proprio conteudo; so ADMIN muda a classificacao de cota; o cliente so decide o status.
CREATE FUNCTION contents_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  cycle_status "CycleStatus";
  new_version record;
  old_number int;
  stripped contents;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO cycle_status FROM editorial_cycles WHERE id = NEW.cycle_id AND client_id = NEW.client_id;
    IF cycle_status IS DISTINCT FROM 'ABERTO' THEN
      RAISE EXCEPTION 'contents: ciclo encerrado nao recebe conteudo novo' USING ERRCODE = '23514';
    END IF;
    IF NEW.current_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'contents: a versao atual so existe depois da primeira versao enviada' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'contents: CANCELADO e terminal' USING ERRCODE = '42501';
  END IF;
  IF NEW.client_id <> OLD.client_id THEN
    RAISE EXCEPTION 'contents: o cliente nao muda' USING ERRCODE = '42501';
  END IF;

  IF NOT (app_is_agency() OR app_is_system()) THEN
    stripped := NEW;
    stripped.status := OLD.status;
    stripped.updated_at := OLD.updated_at;
    IF stripped IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'contents: o cliente so decide o status do conteudo' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF (NEW.counts_toward_quota IS DISTINCT FROM OLD.counts_toward_quota OR NEW.is_bonus IS DISTINCT FROM OLD.is_bonus)
     AND NOT (app_is_admin() OR app_is_system()) THEN
    RAISE EXCEPTION 'contents: so o ADMIN muda a classificacao de cota' USING ERRCODE = '42501';
  END IF;

  IF NEW.cycle_id IS DISTINCT FROM OLD.cycle_id THEN
    IF NOT (app_is_admin() OR app_is_system()) THEN
      RAISE EXCEPTION 'contents: so o ADMIN muda o conteudo de ciclo' USING ERRCODE = '42501';
    END IF;
    SELECT status INTO cycle_status FROM editorial_cycles WHERE id = NEW.cycle_id AND client_id = NEW.client_id;
    IF cycle_status IS DISTINCT FROM 'ABERTO' THEN
      RAISE EXCEPTION 'contents: o ciclo de destino precisa estar aberto' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
    IF NEW.current_version_id IS NULL THEN
      RAISE EXCEPTION 'contents: a versao atual nao volta a ficar vazia' USING ERRCODE = '23514';
    END IF;
    SELECT v.status, v.number, v.content_id INTO new_version
      FROM content_versions v WHERE v.id = NEW.current_version_id AND v.client_id = NEW.client_id;
    IF NOT FOUND OR new_version.content_id <> NEW.id OR new_version.status <> 'ENVIADA' THEN
      RAISE EXCEPTION 'contents: a versao atual precisa ser uma versao ENVIADA do proprio conteudo' USING ERRCODE = '23514';
    END IF;
    IF OLD.current_version_id IS NOT NULL THEN
      SELECT number INTO old_number FROM content_versions WHERE id = OLD.current_version_id AND client_id = NEW.client_id;
      IF new_version.number <= old_number THEN
        RAISE EXCEPTION 'contents: a versao atual so avanca' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER contents_guard BEFORE INSERT OR UPDATE ON contents
  FOR EACH ROW EXECUTE FUNCTION contents_guard();

-- Nova versao atual invalida, no proprio banco, as decisoes ativas da versao anterior (historico mantido).
CREATE FUNCTION contents_invalidate_approvals() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  UPDATE approvals
     SET invalidated_at = now(), invalidation_reason = 'NOVA_VERSAO'
   WHERE client_id = NEW.client_id AND version_id = OLD.current_version_id AND invalidated_at IS NULL;
  RETURN NULL;
END
$$;
CREATE TRIGGER contents_invalidate_approvals AFTER UPDATE ON contents
  FOR EACH ROW WHEN (OLD.current_version_id IS NOT NULL AND OLD.current_version_id IS DISTINCT FROM NEW.current_version_id)
  EXECUTE FUNCTION contents_invalidate_approvals();

-- Aprovacao: so da versao ATUAL, ENVIADA, de conteudo AGUARDANDO_APROVACAO; horario do servidor;
-- nunca atualizada (exceto invalidar), nunca apagada.
CREATE FUNCTION approvals_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  c record;
  v record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.invalidated_at := NULL;
    NEW.invalidation_reason := NULL;
    SELECT status, current_version_id INTO c FROM contents WHERE id = NEW.content_id AND client_id = NEW.client_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'approvals: conteudo nao encontrado' USING ERRCODE = '23503';
    END IF;
    SELECT status, content_id INTO v FROM content_versions WHERE id = NEW.version_id AND client_id = NEW.client_id;
    IF NOT FOUND OR v.content_id <> NEW.content_id OR v.status <> 'ENVIADA' THEN
      RAISE EXCEPTION 'approvals: a decisao precisa apontar para uma versao ENVIADA do conteudo' USING ERRCODE = '23514';
    END IF;
    IF c.current_version_id IS DISTINCT FROM NEW.version_id THEN
      RAISE EXCEPTION 'approvals: so a versao atual pode ser decidida (versao desatualizada)' USING ERRCODE = '23514';
    END IF;
    IF c.status <> 'AGUARDANDO_APROVACAO' THEN
      RAISE EXCEPTION 'approvals: o conteudo nao esta aguardando aprovacao' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.invalidated_at IS NOT NULL OR NEW.invalidated_at IS NULL OR NEW.invalidation_reason IS NULL
       OR (to_jsonb(NEW) - 'invalidated_at' - 'invalidation_reason') IS DISTINCT FROM (to_jsonb(OLD) - 'invalidated_at' - 'invalidation_reason') THEN
      RAISE EXCEPTION 'approvals e imutavel: so a invalidacao (uma vez) e permitida' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'approvals e imutavel: % nao permitido', TG_OP USING ERRCODE = '42501';
END
$$;
CREATE TRIGGER approvals_guard BEFORE INSERT OR UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION approvals_guard();
CREATE TRIGGER approvals_no_truncate BEFORE TRUNCATE ON approvals
  FOR EACH STATEMENT EXECUTE FUNCTION approvals_guard();
ALTER TABLE approvals ENABLE ALWAYS TRIGGER approvals_guard;
ALTER TABLE approvals ENABLE ALWAYS TRIGGER approvals_no_truncate;

-- Comentario: imutavel; a versao citada precisa ser do proprio conteudo.
CREATE FUNCTION comments_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE v_content uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.version_id IS NOT NULL THEN
      SELECT content_id INTO v_content FROM content_versions WHERE id = NEW.version_id AND client_id = NEW.client_id;
      IF v_content IS DISTINCT FROM NEW.content_id THEN
        RAISE EXCEPTION 'comments: a versao citada nao e do conteudo' USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'comments e imutavel: % nao permitido', TG_OP USING ERRCODE = '42501';
END
$$;
CREATE TRIGGER comments_guard BEFORE INSERT OR UPDATE OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION comments_guard();
CREATE TRIGGER comments_no_truncate BEFORE TRUNCATE ON comments
  FOR EACH STATEMENT EXECUTE FUNCTION comments_guard();
ALTER TABLE comments ENABLE ALWAYS TRIGGER comments_guard;
ALTER TABLE comments ENABLE ALWAYS TRIGGER comments_no_truncate;

-- Gravacao: so a revisao muda (estado, justificativa, quem e quando); estados so avancam.
CREATE FUNCTION recordings_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.submitted_at := now();
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'feedback' - 'reviewed_by_id' - 'reviewed_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'feedback' - 'reviewed_by_id' - 'reviewed_at') THEN
    RAISE EXCEPTION 'recordings: so a revisao da gravacao muda' USING ERRCODE = '42501';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'ENVIADA' AND NEW.status IN ('RECEBIDA', 'REGRAVACAO_SOLICITADA'))
    OR (OLD.status = 'RECEBIDA' AND NEW.status = 'REGRAVACAO_SOLICITADA')) THEN
    RAISE EXCEPTION 'recordings: transicao % -> % nao permitida', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER recordings_guard BEFORE INSERT OR UPDATE ON recordings
  FOR EACH ROW EXECUTE FUNCTION recordings_guard();

-- Arquivo: chave, dono e nome nao mudam; DISPONIVEL nao volta atras nem troca de conteudo; REJEITADO e
-- EXCLUIDO sao terminais; nao exclui arquivo ligado a versao ENVIADA; so a agencia muda scan_status.
CREATE FUNCTION assets_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.client_id <> OLD.client_id OR NEW.storage_key <> OLD.storage_key OR NEW.uploaded_by_id <> OLD.uploaded_by_id
     OR NEW.original_name <> OLD.original_name OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'assets: cliente, chave, autor e nome nao mudam' USING ERRCODE = '42501';
  END IF;
  IF OLD.status IN ('REJEITADO', 'EXCLUIDO') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'assets: % e terminal', OLD.status USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'DISPONIVEL' AND NEW.status = 'PENDENTE' THEN
    RAISE EXCEPTION 'assets: DISPONIVEL nao volta a PENDENTE' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'DISPONIVEL' AND (NEW.bytes IS DISTINCT FROM OLD.bytes OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256
      OR NEW.mime_type IS DISTINCT FROM OLD.mime_type OR NEW.category IS DISTINCT FROM OLD.category) THEN
    RAISE EXCEPTION 'assets: o conteudo validado de um arquivo DISPONIVEL nao muda' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'EXCLUIDO' AND OLD.status <> 'EXCLUIDO' AND EXISTS (
       SELECT 1 FROM asset_links l JOIN content_versions v ON v.id = l.version_id AND v.client_id = l.client_id
        WHERE l.asset_id = OLD.id AND l.client_id = OLD.client_id AND v.status = 'ENVIADA') THEN
    RAISE EXCEPTION 'assets: arquivo ligado a versao enviada nao e excluido' USING ERRCODE = '42501';
  END IF;
  IF NEW.scan_status IS DISTINCT FROM OLD.scan_status AND NOT (app_is_agency() OR app_is_system()) THEN
    RAISE EXCEPTION 'assets: so a agencia muda o scan_status' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER assets_guard BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION assets_guard();

-- Vinculo: so de arquivo DISPONIVEL; versao ENVIADA nao troca nem perde vinculo (nova versao e a saida);
-- em rascunho so a ordem (position) muda.
CREATE FUNCTION asset_links_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  asset_status "AssetStatus";
  version_status "VersionStatus";
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO asset_status FROM assets WHERE id = NEW.asset_id AND client_id = NEW.client_id;
    IF asset_status IS DISTINCT FROM 'DISPONIVEL' THEN
      RAISE EXCEPTION 'asset_links: so arquivo DISPONIVEL pode ser vinculado' USING ERRCODE = '23514';
    END IF;
    IF NEW.version_id IS NOT NULL THEN
      SELECT status INTO version_status FROM content_versions WHERE id = NEW.version_id AND client_id = NEW.client_id;
      IF version_status = 'ENVIADA' THEN
        RAISE EXCEPTION 'asset_links: versao ENVIADA nao aceita vinculo novo; crie uma nova versao' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.version_id IS NOT NULL THEN
    SELECT status INTO version_status FROM content_versions WHERE id = OLD.version_id AND client_id = OLD.client_id;
    IF version_status = 'ENVIADA' THEN
      RAISE EXCEPTION 'asset_links: vinculo de versao ENVIADA nao troca nem sai; crie uma nova versao' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'position') IS DISTINCT FROM (to_jsonb(OLD) - 'position') THEN
      RAISE EXCEPTION 'asset_links: so a ordem (position) muda' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END
$$;
CREATE TRIGGER asset_links_guard BEFORE INSERT OR UPDATE OR DELETE ON asset_links
  FOR EACH ROW EXECUTE FUNCTION asset_links_guard();

-- 5) Contadores do ciclo para o progresso. SECURITY DEFINER de proposito: o portal precisa dos NUMEROS de
--    todo o ciclo (inclusive pecas ainda internas), nunca dos titulos. O proprio corpo trava no cliente da
--    sessao (app.client_id) e devolve so contagens. Exige dono com BYPASSRLS/superusuario (como o provisionamento).
CREATE FUNCTION cycle_progress_counts(p_cycle_id uuid)
  RETURNS TABLE (status "ContentStatus", counts_toward_quota boolean, is_bonus boolean, total bigint)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT c.status, c.counts_toward_quota, c.is_bonus, count(*)
      FROM contents c
     WHERE c.cycle_id = p_cycle_id AND (c.client_id = app_client_id() OR app_is_system())
     GROUP BY c.status, c.counts_toward_quota, c.is_bonus
  $$;
REVOKE ALL ON FUNCTION cycle_progress_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cycle_progress_counts(uuid) TO nexo_app;

-- 6) GRANT minimo (sem DELETE onde o historico precisa ser preservado).
GRANT SELECT, INSERT ON service_plans TO nexo_app;
GRANT UPDATE (active) ON service_plans TO nexo_app;
GRANT SELECT, INSERT, UPDATE ON subscriptions, editorial_cycles, contents, content_versions, scripts, recordings, assets TO nexo_app;
GRANT SELECT, INSERT ON approvals, comments TO nexo_app;
GRANT UPDATE (invalidated_at, invalidation_reason) ON approvals TO nexo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON script_scenes TO nexo_app;
GRANT SELECT, INSERT, DELETE ON asset_links TO nexo_app;
GRANT UPDATE ("position") ON asset_links TO nexo_app;

-- 7) RLS forcada e politicas.
ALTER TABLE service_plans   ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_plans   FORCE  ROW LEVEL SECURITY;
ALTER TABLE subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions   FORCE  ROW LEVEL SECURITY;
ALTER TABLE editorial_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_cycles FORCE  ROW LEVEL SECURITY;
ALTER TABLE contents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contents        FORCE  ROW LEVEL SECURITY;
ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_versions FORCE  ROW LEVEL SECURITY;
ALTER TABLE approvals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals       FORCE  ROW LEVEL SECURITY;
ALTER TABLE comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments        FORCE  ROW LEVEL SECURITY;
ALTER TABLE scripts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts         FORCE  ROW LEVEL SECURITY;
ALTER TABLE script_scenes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_scenes   FORCE  ROW LEVEL SECURITY;
ALTER TABLE recordings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings      FORCE  ROW LEVEL SECURITY;
ALTER TABLE assets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets          FORCE  ROW LEVEL SECURITY;
ALTER TABLE asset_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_links     FORCE  ROW LEVEL SECURITY;

-- Catalogo da agencia (sem client_id): leitura so da agencia, escrita so do ADMIN; o portal nunca le.
CREATE POLICY plans_select ON service_plans FOR SELECT TO nexo_app
  USING (app_is_agency() OR app_is_system());
CREATE POLICY plans_insert ON service_plans FOR INSERT TO nexo_app
  WITH CHECK (app_is_admin() OR app_is_system());
CREATE POLICY plans_update ON service_plans FOR UPDATE TO nexo_app
  USING (app_is_admin() OR app_is_system()) WITH CHECK (app_is_admin() OR app_is_system());

-- Assinatura e ciclo: o cliente le o proprio retrato; so ADMIN escreve.
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT TO nexo_app USING (app_in_scope(client_id));
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT TO nexo_app
  WITH CHECK (app_in_scope(client_id) AND (app_is_admin() OR app_is_system()));
CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_admin() OR app_is_system()))
  WITH CHECK (app_in_scope(client_id) AND (app_is_admin() OR app_is_system()));

CREATE POLICY cycles_select ON editorial_cycles FOR SELECT TO nexo_app USING (app_in_scope(client_id));
CREATE POLICY cycles_insert ON editorial_cycles FOR INSERT TO nexo_app
  WITH CHECK (app_in_scope(client_id) AND (app_is_admin() OR app_is_system()));
CREATE POLICY cycles_update ON editorial_cycles FOR UPDATE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_admin() OR app_is_system()))
  WITH CHECK (app_in_scope(client_id) AND (app_is_admin() OR app_is_system()));

-- Conteudo: o cliente so enxerga o COMPARTILHADO; so a agencia escreve; o cliente so decide o status
-- (APROVADO ou EM_REVISAO) de um conteudo compartilhado que aguarda aprovacao.
CREATE POLICY contents_select ON contents FOR SELECT TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR visibility = 'COMPARTILHADO'));
CREATE POLICY contents_insert ON contents FOR INSERT TO nexo_app
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));
CREATE POLICY contents_update_agency ON contents FOR UPDATE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()))
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));
CREATE POLICY contents_update_client_decision ON contents FOR UPDATE TO nexo_app
  USING (client_id = app_client_id() AND app_audience() = 'client' AND visibility = 'COMPARTILHADO' AND status = 'AGUARDANDO_APROVACAO')
  WITH CHECK (client_id = app_client_id() AND app_audience() = 'client' AND visibility = 'COMPARTILHADO' AND status IN ('APROVADO', 'EM_REVISAO'));

-- Versao: o cliente so ve versao ENVIADA de conteudo que ele ve (a subconsulta passa pela RLS de contents).
CREATE POLICY versions_select ON content_versions FOR SELECT TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR (
    status = 'ENVIADA' AND EXISTS (SELECT 1 FROM contents c WHERE c.client_id = content_versions.client_id AND c.id = content_versions.content_id))));
CREATE POLICY versions_insert ON content_versions FOR INSERT TO nexo_app
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));
CREATE POLICY versions_update ON content_versions FOR UPDATE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()))
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));

-- Aprovacao: so a pessoa do CLIENTE decide (nem ADMIN, nem STAFF, nem escopo de sistema), e o autor e
-- sempre quem esta na sessao. Invalidar e coisa da agencia (o gatilho de contents faz isso).
CREATE POLICY approvals_select ON approvals FOR SELECT TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR EXISTS (
    SELECT 1 FROM content_versions v WHERE v.client_id = approvals.client_id AND v.id = approvals.version_id)));
CREATE POLICY approvals_insert ON approvals FOR INSERT TO nexo_app
  WITH CHECK (client_id = app_client_id() AND app_audience() = 'client' AND author_id = app_user_id());
CREATE POLICY approvals_update ON approvals FOR UPDATE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()))
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));

-- Comentario: o cliente so ve e so cria COMPARTILHADO, em alvo que ele ve; o autor e quem esta na sessao.
CREATE POLICY comments_select ON comments FOR SELECT TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR (
    visibility = 'COMPARTILHADO'
    AND ((content_id IS NOT NULL AND EXISTS (SELECT 1 FROM contents c WHERE c.client_id = comments.client_id AND c.id = comments.content_id))
      OR (script_id IS NOT NULL AND EXISTS (SELECT 1 FROM scripts s WHERE s.client_id = comments.client_id AND s.id = comments.script_id)))
    AND (version_id IS NULL OR EXISTS (SELECT 1 FROM content_versions v WHERE v.client_id = comments.client_id AND v.id = comments.version_id)))));
CREATE POLICY comments_insert ON comments FOR INSERT TO nexo_app
  WITH CHECK (app_in_scope(client_id) AND (app_is_system() OR author_id = app_user_id()) AND (app_is_agency() OR app_is_system() OR (
    visibility = 'COMPARTILHADO'
    AND ((content_id IS NOT NULL AND EXISTS (SELECT 1 FROM contents c WHERE c.client_id = comments.client_id AND c.id = comments.content_id))
      OR (script_id IS NOT NULL AND EXISTS (SELECT 1 FROM scripts s WHERE s.client_id = comments.client_id AND s.id = comments.script_id))))));

-- Roteiro: RASCUNHO e interno; so a agencia escreve.
CREATE POLICY scripts_select ON scripts FOR SELECT TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR status <> 'RASCUNHO'));
CREATE POLICY scripts_insert ON scripts FOR INSERT TO nexo_app
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));
CREATE POLICY scripts_update ON scripts FOR UPDATE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()))
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));

CREATE POLICY scenes_select ON script_scenes FOR SELECT TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR EXISTS (
    SELECT 1 FROM scripts s WHERE s.client_id = script_scenes.client_id AND s.id = script_scenes.script_id)));
CREATE POLICY scenes_insert ON script_scenes FOR INSERT TO nexo_app
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));
CREATE POLICY scenes_update ON script_scenes FOR UPDATE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()))
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));
CREATE POLICY scenes_delete ON script_scenes FOR DELETE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));

-- Gravacao: o cliente envia (status ENVIADA, autor = sessao) para roteiro que ele ve; a agencia revisa.
CREATE POLICY recordings_select ON recordings FOR SELECT TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR EXISTS (
    SELECT 1 FROM scripts s WHERE s.client_id = recordings.client_id AND s.id = recordings.script_id)));
CREATE POLICY recordings_insert ON recordings FOR INSERT TO nexo_app
  WITH CHECK (app_in_scope(client_id) AND (app_is_system() OR submitted_by_id = app_user_id()) AND (app_is_agency() OR app_is_system() OR (
    status = 'ENVIADA' AND EXISTS (SELECT 1 FROM scripts s WHERE s.client_id = recordings.client_id AND s.id = recordings.script_id))));
CREATE POLICY recordings_update ON recordings FOR UPDATE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()))
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));

-- Arquivo: o cliente ve o que ele mesmo enviou e o que esta ligado a um destino que ele ve.
CREATE POLICY assets_select ON assets FOR SELECT TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR (
    visibility = 'COMPARTILHADO' AND (uploaded_by_id = app_user_id() OR (
      status = 'DISPONIVEL' AND EXISTS (SELECT 1 FROM asset_links l WHERE l.client_id = assets.client_id AND l.asset_id = assets.id))))));
CREATE POLICY assets_insert ON assets FOR INSERT TO nexo_app
  WITH CHECK (app_in_scope(client_id) AND (app_is_system() OR uploaded_by_id = app_user_id())
    AND (app_is_agency() OR app_is_system() OR (visibility = 'COMPARTILHADO' AND status = 'PENDENTE')));
CREATE POLICY assets_update ON assets FOR UPDATE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR uploaded_by_id = app_user_id()))
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR uploaded_by_id = app_user_id()));

-- Vinculo: o cliente so ve vinculo de destino que ele ve e so cria vinculo de GRAVACAO da propria gravacao.
CREATE POLICY links_select ON asset_links FOR SELECT TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR
    (version_id IS NOT NULL AND EXISTS (SELECT 1 FROM content_versions v WHERE v.client_id = asset_links.client_id AND v.id = asset_links.version_id))
    OR (script_id IS NOT NULL AND EXISTS (SELECT 1 FROM scripts s WHERE s.client_id = asset_links.client_id AND s.id = asset_links.script_id))
    OR (recording_id IS NOT NULL AND EXISTS (SELECT 1 FROM recordings r WHERE r.client_id = asset_links.client_id AND r.id = asset_links.recording_id))
    OR (content_id IS NOT NULL AND EXISTS (SELECT 1 FROM contents c WHERE c.client_id = asset_links.client_id AND c.id = asset_links.content_id))));
CREATE POLICY links_insert ON asset_links FOR INSERT TO nexo_app
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR (
    role = 'GRAVACAO' AND recording_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM recordings r WHERE r.client_id = asset_links.client_id AND r.id = asset_links.recording_id AND r.submitted_by_id = app_user_id()))));
CREATE POLICY links_update ON asset_links FOR UPDATE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()))
  WITH CHECK (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));
CREATE POLICY links_delete ON asset_links FOR DELETE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()));
