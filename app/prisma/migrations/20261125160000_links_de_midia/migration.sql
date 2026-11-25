-- D-0025: midia por LINK externo. Tabela media_links (versao, roteiro ou gravacao), com FK composta (client_id, id),
-- RLS forcada, CHECKs que repetem o formato da URL (https, sem usuario, sem porta, host igual ao da coluna `host`) e
-- gatilho que impede mexer em versao ENVIADA e limita a 20 links por destino.
-- A lista de dominios e a normalizacao ficam no codigo (domain/media-link.ts): ela e configuravel por ambiente.
-- Reversao: prisma/rollback/20261125160000_links_de_midia.down.sql

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGEM', 'VIDEO', 'PDF', 'DOCUMENTO', 'OUTRO');

-- CreateTable
CREATE TABLE "media_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "version_id" UUID,
    "script_id" UUID,
    "recording_id" UUID,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_links_client_id_version_id_idx" ON "media_links"("client_id", "version_id");

-- CreateIndex
CREATE INDEX "media_links_client_id_script_id_idx" ON "media_links"("client_id", "script_id");

-- CreateIndex
CREATE INDEX "media_links_client_id_recording_id_idx" ON "media_links"("client_id", "recording_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_links_client_id_id_key" ON "media_links"("client_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "media_links_version_id_url_key" ON "media_links"("version_id", "url");

-- CreateIndex
CREATE UNIQUE INDEX "media_links_script_id_url_key" ON "media_links"("script_id", "url");

-- CreateIndex
CREATE UNIQUE INDEX "media_links_recording_id_url_key" ON "media_links"("recording_id", "url");

-- AddForeignKey
ALTER TABLE "media_links" ADD CONSTRAINT "media_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_links" ADD CONSTRAINT "media_links_client_id_version_id_fkey" FOREIGN KEY ("client_id", "version_id") REFERENCES "content_versions"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_links" ADD CONSTRAINT "media_links_client_id_script_id_fkey" FOREIGN KEY ("client_id", "script_id") REFERENCES "scripts"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_links" ADD CONSTRAINT "media_links_client_id_recording_id_fkey" FOREIGN KEY ("client_id", "recording_id") REFERENCES "recordings"("client_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_links" ADD CONSTRAINT "media_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras que o banco recusa mesmo se o codigo errar: exatamente um destino; rotulo curto e sem controle; URL https
-- sem espaco, controle ou barra invertida, de ate 2048 caracteres; host em minusculas; a URL COMECA por https://<host> e
-- o que vem depois do host e caminho, consulta, fragmento ou nada (sem usuario@, sem :porta).
ALTER TABLE media_links ADD CONSTRAINT media_links_values_check CHECK (
  ((version_id IS NOT NULL)::int + (script_id IS NOT NULL)::int + (recording_id IS NOT NULL)::int = 1)
  AND char_length(btrim(label)) BETWEEN 1 AND 120 AND label !~ '[[:cntrl:]]'
  AND char_length(url) <= 2048 AND url ~ '^https://[^[:space:][:cntrl:]\\]+$'
  AND char_length(host) BETWEEN 3 AND 253 AND host = lower(host) AND host ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' AND host !~ '[.][.]'
  AND left(url, 8 + char_length(host)) = 'https://' || host
  AND substr(url, 9 + char_length(host), 1) IN ('', '/', '?', '#'));

-- Gatilho: versao ENVIADA e imutavel (nem cria nem tira link: a saida e criar nova versao) e no maximo 20 links por
-- destino (a trava consultiva serializa dois cadastros simultaneos no mesmo destino). ENABLE ALWAYS: vale com
-- session_replication_role = replica.
CREATE FUNCTION media_links_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  dest uuid;
  version_status "VersionStatus";
  total integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    dest := COALESCE(NEW.version_id, NEW.script_id, NEW.recording_id);
    IF NEW.version_id IS NOT NULL THEN
      SELECT status INTO version_status FROM content_versions WHERE id = NEW.version_id AND client_id = NEW.client_id;
      IF version_status = 'ENVIADA' THEN
        RAISE EXCEPTION 'media_links: versao ENVIADA nao aceita link novo; crie uma nova versao' USING ERRCODE = '42501';
      END IF;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('media-links:' || dest::text, 0));
    SELECT count(*) INTO total FROM media_links
     WHERE client_id = NEW.client_id AND COALESCE(version_id, script_id, recording_id) = dest;
    IF total >= 20 THEN
      RAISE EXCEPTION 'media_links: no maximo 20 links por destino' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.version_id IS NOT NULL THEN
    SELECT status INTO version_status FROM content_versions WHERE id = OLD.version_id AND client_id = OLD.client_id;
    IF version_status = 'ENVIADA' THEN
      RAISE EXCEPTION 'media_links: link de versao ENVIADA nao sai; crie uma nova versao' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN OLD;
END
$$;
CREATE TRIGGER media_links_guard BEFORE INSERT OR DELETE ON media_links
  FOR EACH ROW EXECUTE FUNCTION media_links_guard();
ALTER TABLE media_links ENABLE ALWAYS TRIGGER media_links_guard;

-- GRANT minimo (sem UPDATE: link errado se remove e se cadastra de novo) e RLS forcada.
GRANT SELECT, INSERT, DELETE ON media_links TO nexo_app;
ALTER TABLE media_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_links FORCE  ROW LEVEL SECURITY;

-- Leitura: a agencia ve tudo do cliente; o cliente so ve link de destino que ele ve (a subconsulta passa pela RLS do
-- destino: versao ENVIADA de conteudo COMPARTILHADO, roteiro a partir de ENVIADO, gravacao de roteiro visivel).
CREATE POLICY media_links_select ON media_links FOR SELECT TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system()
    OR (version_id IS NOT NULL AND EXISTS (SELECT 1 FROM content_versions v WHERE v.client_id = media_links.client_id AND v.id = media_links.version_id))
    OR (script_id IS NOT NULL AND EXISTS (SELECT 1 FROM scripts s WHERE s.client_id = media_links.client_id AND s.id = media_links.script_id))
    OR (recording_id IS NOT NULL AND EXISTS (SELECT 1 FROM recordings r WHERE r.client_id = media_links.client_id AND r.id = media_links.recording_id))));
-- Cadastro: o autor e sempre quem esta na sessao; a agencia cadastra em qualquer destino do cliente; o cliente so em
-- gravacao DELE (enviada por ele).
CREATE POLICY media_links_insert ON media_links FOR INSERT TO nexo_app
  WITH CHECK (app_in_scope(client_id) AND (app_is_system() OR created_by_id = app_user_id()) AND (app_is_agency() OR app_is_system() OR (
    recording_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM recordings r WHERE r.client_id = media_links.client_id AND r.id = media_links.recording_id AND r.submitted_by_id = app_user_id()))));
-- Remocao: a agencia remove qualquer um do cliente; o cliente so o que ele mesmo cadastrou.
CREATE POLICY media_links_delete ON media_links FOR DELETE TO nexo_app
  USING (app_in_scope(client_id) AND (app_is_agency() OR app_is_system() OR created_by_id = app_user_id()));
