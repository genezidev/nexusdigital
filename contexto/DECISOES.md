# Decisões

Registre apenas as decisões que afetam arquitetura, dependências, dados, plataforma ou operação e que seriam caras de reverter: escolha de stack, banco, autenticação, gateway, hospedagem, formato de dados, estrutura de pastas. Correções pequenas, testes descartáveis e escolhas já definidas por padrão da stack não precisam de registro.

## Regras

- Uma decisão por registro. Se uma decisão gerar outras, abra registros novos e cite o anterior.
- Escreva o porquê, não só o quê. Quem abrir o projeto daqui a seis meses (ou outro agente) precisa entender o motivo.
- Data em tudo que muda com o tempo: preço, limite de plano, versão.
- Não apague registros antigos. Para mudar de ideia, crie um novo com estado `substitui D-000X` e marque o antigo como `substituída por D-000Y`.
- Sempre que possível, diga como a decisão é conferida automaticamente (uma checagem em `quality/checks.json`, um teste, uma regra de lint). Decisão sem conferência tende a ser esquecida no código.

Estados: `proposta`, `aceita`, `rejeitada`, `substituída por D-000Y`.

## Modelo

Copie o bloco abaixo para cada decisão, numerando em sequência.

```markdown
## D-0001: <título curto, no formato "usar X para Y">

- Data: AAAA-MM-DD · Estado: proposta | aceita | rejeitada | substituída por D-000Y
- Quem decidiu: <pessoa ou papel>

**Contexto:** qual problema ou necessidade pede essa decisão, em duas ou três frases.

**Opções consideradas:**
- Opção A: a favor..., contra...
- Opção B: a favor..., contra...

**Escolha:** Opção A, porque <motivo ligado ao contexto>.

**Consequências:** o que melhora, o que piora, o que precisa ser feito depois.

**Como conferir:** <checagem automática, teste ou revisão que mostra que a decisão continua valendo>.

**Fontes:** <links da documentação oficial consultada, com data>.
```

Formato inspirado no MADR (https://github.com/adr/madr, MIT ou CC0).

---

## D-0001: usar VPS própria com Docker e PostgreSQL para hospedar o Nexo Digital

- Data: 2026-11-24 · Estado: aceita
- Quem decidiu: dono do projeto

**Contexto:** o sistema guarda contratos, vídeos e dados financeiros de clientes e exige uploads grandes e banco privado.

**Opções consideradas:**
- VPS própria: a favor, controle total, vídeos grandes, banco sem porta pública; contra, exige operar servidor e backups.
- Vercel + Supabase: a favor, publicação simples; contra, troca a autenticação e o storage previstos e limita upload de vídeo.

**Escolha:** VPS própria, conforme a especificação mestre.

**Consequências:** antes de publicar, rodar `scripts/inventario-vps.sh` para conferir capacidade; backup e restauração testados fazem parte da fase 5. Nada é publicado sem autorização.

**Como conferir:** checklist de `playbook/vps.md` e `scaff-publicar` antes do primeiro deploy.

## D-0002: usar Better Auth no lugar de Auth.js para login e sessões

- Data: 2026-11-24 · Estado: aceita (validação técnica pendente na fundação)
- Quem decidiu: dono do projeto

**Contexto:** a especificação cita Auth.js com credenciais, mas exige convite, reset de uso único, revogação de sessão e bloqueio de conta. O playbook da base indica que o README do Auth.js recomenda o Better Auth para projetos novos.

**Opções consideradas:**
- Auth.js: a favor, citado na especificação; contra, suporte a credenciais e revogação de sessão é mais limitado.
- Better Auth: a favor, e-mail e senha, 2FA e organizações prontos; contra, diverge do texto da especificação.

**Escolha proposta:** Better Auth, validando na fundação convite, reset, revogação e bloqueio antes de seguir.

**Consequências:** a especificação mestre precisa de nota de divergência; se a validação falhar, reabrir esta decisão.

**Como conferir:** testes de convite de uso único, reset, revogação e bloqueio da spec 0001.

## D-0003: usar PostgreSQL com Prisma, filtro por client_id em todo acesso

- Data: 2026-11-24 · Estado: aceita
- Quem decidiu: dono do projeto

**Contexto:** multiempresa com vazamento entre clientes como risco principal.

**Escolha proposta:** PostgreSQL com Prisma (versões a conferir na fundação com `scripts/conferir_versoes.py`), repositórios sempre escopados pelo cliente da sessão e testes de IDOR obrigatórios. Avaliar políticas de linha (RLS) no banco como segunda camada com o agente de banco.

**Como conferir:** testes de isolamento com dois clientes em banco de teste separado.

## D-0004: RLS no PostgreSQL como segunda camada, com papel de app sem BYPASSRLS

- Data: 2026-11-24 · Estado: aceita (implementada e testada em nexo_test; produção depende de autorização). Confirmada pelo dono em 2026-11-24, incluindo o risco aceito nos escopos de sistema.
- Quem decidiu: agente de dados, seguindo D-0003; confirmação do dono pendente

**Contexto:** D-0003 pediu avaliar RLS. O usuário `nexo` do compose é superusuário e ignora RLS, então só vale como segunda camada se o app usar outro papel.

**Escolha:** dois papéis. `nexo` (dono, só migrate/seed/setup) e `nexo_app` (LOGIN, NOSUPERUSER, NOBYPASSRLS), usado em runtime por `DATABASE_URL`. Migration `20261124151100_rls_e_papeis` liga RLS forçada em `clients`, `client_members`, `invitations` e `audit_logs`. As políticas leem `app.client_id` e `app.system`, gravados por transação com `set_config(..., true)` em `app/src/server/db/scope.ts`; sem contexto, nenhuma linha é visível. GRANTs mínimos: `audit_logs` só SELECT/INSERT (append-only), `clients` sem DELETE. Viável com Prisma 7 + `@prisma/adapter-pg` porque todo acesso de cliente roda em `$transaction` interativa.

**Consequências e limites:**
- O escopo de sistema (`app.system = on`) existe para ADMIN entre clientes, para o fluxo de convite por token e para resolver a sessão. Nesses trechos a RLS não protege: vale o código de `authorization/context.ts` (criação do escopo só por `systemContextFor*`) e a revisão. Risco aceito até a revisão antes do primeiro deploy.
- `users`, `sessions`, `accounts`, `verifications` (tabelas do Better Auth) não têm `client_id` e não têm RLS; quem lê membros passa por `client_members`, que tem.
- Tabelas novas de cliente precisam de `client_id`, GRANT e política na mesma migration (lição de produção: GRANT e RLS são camadas diferentes).
- A senha do `nexo_app` não está na migration; `scripts/db-migrar.mjs` a define a partir de `APP_DB_PASSWORD`. Em produção, definir por comando controlado.
- `audit_logs` guarda FKs com `ON DELETE SET NULL`: apagar usuário ou cliente (LGPD) muda linhas de auditoria como dono; decidir a política de retenção/anonimização antes da fase 5.

**Como conferir:** `app/tests/integration/rls.test.ts` (consultas cruas sem filtro, escrita cruzada, append-only, sem contexto = vazio) e a suite de isolamento rodando também na conexão do dono (só filtro de código). Reversão: `app/prisma/rollback/20261124151100_rls_e_papeis.down.sql` (ensaiada em nexo_test).

**Fontes:** documentação do PostgreSQL sobre CREATE POLICY/FORCE ROW LEVEL SECURITY; Prisma 7 (prisma.config.ts, driver adapter) conferida em 2026-11-24.

## D-0005: usar as tabelas do Better Auth (plugin admin) e o `verification` para reset, sem plugin organization

- Data: 2026-11-24 · Estado: aceita (valida D-0002 para login, bloqueio e reset; convite próprio). Confirmada pelo dono em 2026-11-24, incluindo scrypt do Better Auth como equivalente aceito a Argon2id/bcrypt.
- Quem decidiu: agente de dados; confirmação do dono pendente

**Contexto:** a spec pede users, sessions e reset_tokens; o Better Auth já exige `user`, `session`, `account`, `verification`.

**Escolha:** schema gerado pelo CLI oficial (`npx auth@1.7.27 generate --adapter prisma`, plugin admin) e ajustado: ids UUID (`advanced.database.generateId: "uuid"`), tabelas `users/sessions/accounts/verifications`, `role` como enum `GlobalRole`, `banned` = conta bloqueada. Reset de senha usa `verification` com `verification.storeIdentifier: "hashed"` e uso único (sem tabela `reset_tokens` duplicada). Convite é próprio (`invitations`, `token_hash` SHA-256, 7 dias, uso único atômico), pois o plugin `organization` não cobre STAFF atribuído a vários clientes nem os papéis desta spec. Cadastro público desligado (`disableSignUp`). Senha mínima de 12 caracteres.

**Consequências:** pendentes para as telas de login: rate limit com `rateLimit.storage: "database"` (exige tabela), `ipAddressHeaders` atrás do proxy, envio real de e-mail de reset (hoje falha de forma explícita sem SMTP), MFA do admin (fase 5). `lastLoginAt` existe no schema mas ainda não é preenchido.

**Como conferir:** `app/tests/integration/auth-schema.test.ts` e `invitations.test.ts`.

## D-0006: camada de telas com proxy só de cookie, limite de tentativas em banco e tema por usuário

- Data: 2026-11-24 · Estado: aceita pelo agente web, confirmação do dono pendente (nada foi aplicado fora de `nexo_dev` e `nexo_test`)
- Quem decidiu: agente web, a partir de D-0002, D-0004 e D-0005

**Contexto:** as telas precisam de limite de tentativas (429), tema persistido por usuário, cliente ativo na sessão e uma primeira barreira de acesso, com Cache Components ligado e sem confiar em `clientId` do navegador.

**Opções consideradas:**
- Limite em memória (padrão do Better Auth): a favor, sem tabela; contra, some ao reiniciar, não vale com mais de uma instância e só liga em produção por padrão.
- Limite em banco (`rateLimit.storage: "database"`): a favor, documentado e persistente; contra, exige a tabela `rate_limits` e uma migration.
- Proxy (`proxy.ts`) com consulta ao banco: a favor, devolve 403 real nas páginas; contra, o Next recomenda só cookie no Proxy (roda também em pré-busca) e a decisão real já vive no servidor.

**Escolha:** limite em banco, com a migration versionada `20261124200000_tema_e_rate_limit` (colunas `users.theme_preference` e tabela `rate_limits` com GRANT para `nexo_app`; reversão em `app/prisma/rollback/20261124200000_tema_e_rate_limit.down.sql`, ensaiada em `nexo_test`: desfez e reaplicou). O mesmo armazenamento atende os handlers próprios (`consumeRateLimit`, janela fixa atômica, chaves `app:`). O `proxy.ts` só confere cookie; a decisão fica em `resolveTenantContext` e nos guardas de cada página e handler. O cliente ativo da sessão é gravado pelo servidor num hook de criação de sessão (um único cliente ativo) ou por `switchActiveClient` (vários). Só as rotas do Better Auth que a interface usa passam (lista de permissão).

**Consequências:**
- Com Cache Components, a página que nega acesso depois de transmitir o esqueleto responde 200 com "Acesso negado"; as APIs respondem 401, 403, 404, 409, 410, 422 e 429 de verdade.
- `TRUST_PROXY=true` só atrás de proxy reverso confiável; sem isso o limite por IP vira um balde único por rota (seguro, mas global). Definir no deploy.
- A tabela `rate_limits` guarda IP (dado pessoal): definir retenção na revisão de LGPD (o Better Auth apaga linhas vencidas).
- Envio de e-mail continua fora: recuperação de senha e convite por e-mail aparecem como indisponíveis e o admin copia o link.

**Como conferir:** `app/tests/http/accounts.test.ts` (429 por IP e em banco, 503 uniforme sem SMTP, CSRF), `app/tests/http/authorization.test.ts`, `app/e2e/*.spec.ts`; migration `prisma migrate diff` sem diferença em `nexo_dev`.

**Fontes:** `app/node_modules/next/dist/docs/` (Proxy, Authentication with Cache Components, loading.js: status codes), código do Better Auth 1.7.27 em `node_modules/better-auth/dist/api/rate-limiter` e `middlewares/origin-check`, conferidos em 2026-11-24.


## D-0007: auditoria imutavel e usuario que o app nao apaga (B-1)

- Data: 2026-11-24 · Estado: aceita pelo agente de servidor a partir da revisao de seguranca; confirmacao do dono pendente (aplicada so em `nexo_dev` e `nexo_test`)
- Quem decidiu: agente de servidor, a partir de D-0004

**Contexto:** o app nao tem UPDATE nem DELETE em `audit_logs`, mas tinha DELETE em `users`, e a FK `audit_logs_actor_id_fkey ON DELETE SET NULL` reescrevia `actor_id` das linhas de auditoria (provado: UPDATE direto deu `permission denied`; DELETE do usuario anulou o autor). O mesmo vale para `client_id` se um dono do banco apagasse um cliente.

**Opcoes consideradas:**
- So `REVOKE DELETE ON users FROM nexo_app`: a favor, simples; contra, o dono do banco (migrations, correcoes manuais) ainda reescreve a trilha sem querer.
- So gatilho em `audit_logs`: a favor, protege contra qualquer papel e contra a acao referencial; contra, deixaria o app com um privilegio que ninguem usa.
- Os dois (escolhida): privilegio minimo no app e imutabilidade no proprio banco.

**Escolha:** migration `20261124210000_auditoria_imutavel` (reversao em `app/prisma/rollback/20261124210000_auditoria_imutavel.down.sql`, ensaiada em `nexo_test`: desfez, os dois testes novos falharam, reaplicou e passaram): `REVOKE DELETE ON users FROM nexo_app` e gatilho `BEFORE UPDATE OR DELETE ... FOR EACH ROW` mais `BEFORE TRUNCATE` em `audit_logs`, que levantam excecao (`42501`) para qualquer papel, inclusive nas acoes referenciais. Nenhum fluxo do codigo apaga usuario (conferido por busca em `src/`, `tests/`, `e2e/`, seed e scripts); a pessoa sai por bloqueio (`users.banned`) e participacao revogada.

**Consequencias:**
- Apagar um usuario ou cliente que tenha linhas de auditoria passa a falhar, mesmo para o dono do banco. Quem precisar mesmo (restauracao, manutencao) usa o backup ou desabilita o gatilho de forma consciente e registrada, fora do app.
- **LGPD (fase 5):** exclusao ou anonimizacao a pedido do titular **nao pode ser `DELETE FROM users`**. Deve ser `UPDATE` que remove os dados pessoais (nome, e-mail para um valor sem identificacao, `image`, sessoes e contas apagadas, `banned`) e mantem o `id`, de modo que a auditoria continue apontando para um autor anonimizado. Se o titular exigir apagar tambem o conteudo de `audit_logs.diff`, isso precisa de uma funcao propria, revisada e com registro (decisao de LGPD da fase 5), nunca de reabrir `UPDATE`/`DELETE` para o app. O `diff` ja nao guarda senha, token ou hash (`sanitizeDiff`).
- **Gatilhos `ENABLE ALWAYS` (revisao A-5):** disparam tambem em sessoes com `session_replication_role = replica` (que desligam gatilhos comuns, "ENABLE ORIGIN"). Limite aceito, nao eliminado: superusuario ainda pode `DISABLE TRIGGER`, `DROP TRIGGER` ou usar replicacao logica; e operacao de DDL fora do app e deve ficar no registro de mudancas.
- Restauracao de backup e `prisma migrate reset` em dev recriam o schema inteiro e nao sao afetados; `TRUNCATE audit_logs` (inclusive em cascata) tambem e recusado.

**Como conferir:** `app/tests/integration/rls.test.ts` (casos "o app nao apaga usuario", "nem o dono do banco reescreve a auditoria" e "ENABLE ALWAYS", com `tgenabled = 'A'` e `session_replication_role = replica`).

## D-0008: IP do cliente e limite de tentativas sem balde global (M-1)

- Data: 2026-11-24 · Estado: aceita pelo agente de servidor; confirmacao do dono pendente. Substitui, para o limite de login, a escolha de D-0006 de usar o limitador do Better Auth.
- Quem decidiu: agente de servidor, a partir da revisao de seguranca

**Contexto:** com `TRUST_PROXY=false` o Better Auth usava um balde unico `no-trusted-ip` (5 por minuto no login) e o handler proprio devolvia `no-trusted-ip` (10 por minuto no aceite): qualquer anonimo bloqueava o login de todos. Com proxy que acrescenta ao `x-forwarded-for`, o handler proprio usava o PRIMEIRO valor (forjavel) e a chave recebia texto livre. Conferido no codigo do Better Auth 1.7.27 (`@better-auth/core/utils/ip`): sem `trustedProxies` ele so aceita cabecalho de valor unico; sem IP cai no balde unico.

**Escolha:**
- `TRUST_PROXY` obrigatorio e explicito em producao: o processo encerra na partida (`src/instrumentation.ts`) e `getServerEnv` recusa (`env.ts`).
- Um unico resolvedor de IP (`src/server/http/client-ip.ts`) para as rotas de autenticacao e para os handlers proprios: cabecalho configuravel (`TRUSTED_IP_HEADER`, padrao `x-real-ip`, que o proxy sobrescreve), `TRUSTED_PROXIES` opcional para cadeias, validacao como IPv4/IPv6, limite de 512 caracteres e 16 saltos, normalizacao (IPv4 mapeado, IPv6 em /64). A requisicao segue ao Better Auth com um cabecalho interno recalculado (`x-nexo-client-ip`; o que o cliente mandar nesse nome e descartado).
- Limite de tentativas movido para `src/server/http/auth-guard.ts` (o do Better Auth fica desligado). Sem IP confiavel nao existe balde global: fora o login, o balde e do e-mail, do token ou da sessao da propria requisicao. Corpo acima de 8 KB responde 413.
- **Corpo lido como o Better Auth le (revisao A-1):** nas rotas de login, pedido de redefinicao, redefinicao e troca de senha o corpo precisa ser `application/json` (415 caso contrario; o Better Auth aceita tambem form-urlencoded e `text/plain`, que o guard nao conseguia ler e deixavam a requisicao sem balde). O guard le o corpo uma vez (UTF-8, sem BOM), exige identificador valido (e-mail ou token, inclusive o `?token=` da redefinicao) e responde 400 sem repassar ao Better Auth se faltar, e repassa a ele o JSON canonico, de modo que nao ha diferenca entre o que foi contado e o que foi processado.
- **Login conta so falhas (revisao A-3, opcao escolhida pelo orquestrador):** antes, o balde por e-mail contava toda tentativa e bloqueava antes da senha: um anonimo trancava o login do ADMIN com ~10 requisicoes por 15 minutos. Agora: (a) a tentativa reserva uma vaga de forma atomica antes (incrementar depois, como pedido, deixaria N requisicoes paralelas passarem pelo limite) e a vaga e devolvida se o Better Auth responder sucesso ou algo que nao seja falha (429, 5xx); falha e 400, 401, 403 ou 422; (b) o balde de falhas e por (e-mail, IP normalizado /64) com 10 falhas em 15 minutos (`AUTH_SIGNIN_EMAIL_MAX`), mais um teto por e-mail de 100 falhas em 15 minutos de qualquer IP (`AUTH_SIGNIN_EMAIL_GLOBAL_MAX`), so contra ataque distribuido; (c) quem ja entrou com sucesso na conta a partir daquele IP (marca por 30 dias) nao e barrado pelo balde (e-mail, IP), so pelo teto. O 429 e identico para conta existente e inexistente. O balde por IP (5 por minuto, toda tentativa) continua.
- **Limite residual honesto:** um atacante distribuido com 100 ou mais falhas em 15 minutos para o mesmo e-mail ainda pode atrasar o login daquela conta (inclusive o do ADMIN) por ate 15 minutos; mitigacao: MFA do admin na fase 5 e banimento de IP no proxy. Sem IP confiavel (`TRUST_PROXY=false`), todos os anonimos dividem o balde "sem-ip" do e-mail: 10 falhas travam aquele e-mail por 15 minutos para quem nao tem IP conhecido. A marca de "ja entrou deste IP" guarda hash do e-mail e IP por 30 dias na `rate_limits` (dado pessoal; entra na revisao de LGPD).
- **Retencao (revisao A-4):** a poda remove baldes parados ha mais de 1 hora (maior janela 15 minutos mais folga), marcas de IP conhecido apos 30 dias, em lotes de 1000, por indice em `last_request` (migration `20261124220000_rate_limits_indice`, com reversao ensaiada). Sem IP confiavel a tabela ainda cresce com e-mails distintos, mas so por 1 hora por linha e limitada pelo volume que o proxy deixar passar.
- Rejeitado: contar a tentativa so depois da resposta (corrida: requisicoes paralelas ultrapassam o limite); reserva antes e devolucao no sucesso tem o mesmo efeito sem corrida. Rejeitado: manter o limitador do Better Auth com `customRules` por funcao (a semantica de IP ausente nao e nossa, e o proximo upgrade pode mudar); rejeitar de vez login sem IP (derrubaria o acesso direto de quem nao tem proxy).

**Consequencias:** limite residual do ataque distribuido (acima), documentado em `docs/proxy-e-ip.md`; o proxy continua responsavel pelo limite de volume e por sobrescrever o cabecalho de IP; a configuracao de Nginx, Caddy e Cloudflare nao foi testada em servidor real.

**Como conferir:** `app/tests/http/rate-limit.test.ts` (quatro instancias do app compilado), `app/tests/integration/rate-limit-prune.test.ts`, `app/src/server/http/client-ip.test.ts`, `app/src/server/config/env.test.ts`.

## D-0009: provisionamento do papel do app e do primeiro ADMIN por script unico (M-3)

- Data: 2026-11-24 · Estado: aceita pelo agente de servidor; confirmacao do dono pendente (nada executado em producao)
- Quem decidiu: agente de servidor, a partir da revisao de seguranca

**Contexto:** a migration cria `nexo_app` sem senha e cita um script que nao existia; o seed e o `db-migrar` recusam producao. Faltava um caminho seguro para a senha do papel e para o primeiro administrador.

**Escolha:** `app/scripts/provisionar-producao.mjs`, uma transacao com trava consultiva: segredos so por ambiente ou prompt oculto (nunca argumento, nunca impresso, sem ler `.env`), `--ambiente` obrigatorio, confirmacao explicita, destino validado por ambiente (dev/test so local; producao so host em `PROVISIONAR_HOST_PERMITIDO` e nunca `nexo_dev`/`nexo_test`), recusa se ja existe ADMIN (codigo 3), senha forte (12 a 128, mesmo minimo do app, sem palavras comuns, sem e-mail ou nome) e auditoria `admin.provisioned`. A senha do papel e gravada como verificador SCRAM calculado no cliente, para o texto nao aparecer em log de SQL do servidor.

**Revisao A-2 e A-6:** a URL do banco e validada pela sintaxe WHATWG e tambem pelo que o driver `pg` vai usar para conectar (o `pg` deixa `?host=`, `?port=`, `?hostaddr=` e `?options=` sobrescreverem a URL); qualquer query alem de `sslmode` e recusada. A checagem de senha rejeita as piores e padroes obvios (palavras comuns, meses e estacoes, sequencias de teclado, substituicoes como `P@ssw0rd`, palavra + numero); **nao garante senha forte**: use um gerenciador de senhas.

**Comentario da migration `20261124151100`:** cita `scripts/preparar-papel-app.mjs`, que nao existe. Corrigir o comentario muda o checksum da migration ja aplicada (o `migrate status` nao acusa, mas o checksum em `_prisma_migrations` diverge e o `migrate dev` reclamaria); por isso a correcao foi revertida e o nome certo (`provisionar-producao.mjs`) fica so na documentacao (`docs/runbook-producao.md`).

**Consequencias:** o dono do banco precisa ignorar RLS para gravar a auditoria (superusuario ou `BYPASSRLS`); em caso contrario o script falha sem gravar nada. Ordem e comandos em `docs/runbook-producao.md`.

**Como conferir:** `app/tests/integration/provisionar.test.ts` (bancos temporarios com as migrations reais).

## D-0010: interface de storage; motor de disco local em dev e S3 compativel em producao (motor a decidir)

- Data: 2026-11-25 · Estado: interface aceita pelo agente de dados (nenhum motor implementado); escolha do servico S3 depende do dono e do inventario da VPS
- Quem decidiu: agente de dados, a partir da spec 0002 (decisoes pendentes 1 a 3, aprovadas pelo dono com as recomendacoes)

**Escolha:** `app/src/server/storage/types.ts` define `ObjectStorage` (alvo de envio assinado com limite embutido, URL de download curta, `stat` com tamanho, SHA-256 e primeiros bytes, `delete`). `storage/keys.ts` gera a chave `clients/<client_id>/<uuid aleatorio>`, sem nome original nem extensao. O banco confere o formato (CHECK `assets_values_check`): chave da pasta de outro cliente e recusada. A politica de tipos e tamanhos (imagem 20 MB, PDF 50 MB, video 2 GB; JPEG, PNG, WebP, PDF, MP4, MOV, WebM) e a lista de extensoes bloqueadas (dupla extensao e maiusculas incluidas) sao funcoes puras em `domain/asset-policy.ts`. `assets.scan_status` nasce `NAO_VERIFICADO` e so a agencia o muda (gatilho): pronto para quarentena. O servico `services/assets.ts` so registra o estado: cria o registro PENDENTE com chave aleatoria, finaliza com tipo, tamanho e SHA-256 medidos pelo servidor (fora da politica vira REJEITADO e auditado) e autoriza o download devolvendo a chave so para quem ve o arquivo.

**Fica para o backend de arquivos (R-5):** driver de disco local, driver S3, rota de upload e de download com URL assinada, conferencia do tipo real pelos primeiros bytes, limpeza de pendentes e orfaos, limite de tentativas por usuario. Nada disso foi implementado nem provado nesta entrega.

**Como conferir:** `src/server/domain/asset-policy.test.ts`, `tests/integration/fase2-planejamento-arquivos.test.ts` (bloco de arquivos).

## D-0011: aprovacao imutavel e vinculada a versao; primeira decisao vence

- Data: 2026-11-25 · Estado: aceita pelo agente de dados; confirmacao do dono pendente (aplicada so em `nexo_dev` e `nexo_test`)
- Quem decidiu: agente de dados, a partir da spec 0002 (P3 e casos-limite)

**Escolha:**
- **Versao atual = um unico ponteiro** (`contents.current_version_id`), e nao uma coluna booleana por versao: "so uma versao e a atual" vale por construcao. O gatilho `contents_guard` exige que o ponteiro so avance, para uma versao ENVIADA do proprio conteudo (a FK composta cobre o cliente).
- **Versao ENVIADA e imutavel** (gatilho `content_versions_guard`, `ENABLE ALWAYS`, vale para qualquer papel); numero sequencial por conteudo; no maximo um rascunho por conteudo (indice parcial); o historico de versoes nunca e apagado.
- **Aprovacao** (`approvals`): `INSERT` so pela pessoa do CLIENTE (a politica RLS exige `app.audience = 'client'` e `author_id = app.user_id`: ADMIN e STAFF nao aprovam em nome do cliente nem por SQL; o escopo de sistema tambem nao); o gatilho `approvals_guard` grava `created_at` com o horario do servidor e recusa decisao sobre versao que nao e a atual, versao que nao e ENVIADA e conteudo que nao esta AGUARDANDO_APROVACAO. `UPDATE` so para invalidar uma vez (GRANT por coluna em `invalidated_at` e `invalidation_reason`); `DELETE` e `TRUNCATE` recusados para qualquer papel (`ENABLE ALWAYS`).
- **Concorrencia (decisao pedida no briefing): a PRIMEIRA decisao vence.** Camadas: (1) trava consultiva por conteudo (`pg_advisory_xact_lock`) no servico, que serializa as requisicoes e permite devolver 409 "ja decidida por [nome] em [data]"; (2) indice unico parcial `approvals_one_active_decision_per_version (version_id) WHERE invalidated_at IS NULL`; (3) gatilho que recusa se a versao nao e mais a atual. Mesma pessoa repetindo a mesma decisao recebe a mesma resposta, sem linha nova. Aprovar e pedir revisao ao mesmo tempo: quem chegou primeiro vence.
- **Invalidacao no proprio banco:** ao mudar o ponteiro de versao atual, o gatilho `contents_invalidate_approvals` marca como invalidadas (motivo `NOVA_VERSAO`) as decisoes ativas da versao anterior; a linha fica como historico. Editar material de conteudo APROVADO ou AGENDADO cria nova versao ja ENVIADA (copiando os vinculos de arquivo) e devolve o conteudo a AGUARDANDO_APROVACAO.
- **O cliente so decide o status:** politica de UPDATE em `contents` para o lado do cliente (so conteudo compartilhado AGUARDANDO_APROVACAO, so para APROVADO ou EM_REVISAO) mais gatilho que recusa qualquer outra coluna alterada por sessao de cliente.
- Briefing fica na versao e conta como material (qualquer mudanca gera nova versao): mais conservador que a spec, que nao o lista.
- Comentarios sao imutaveis (gatilho, sem UPDATE nem DELETE).

**Como conferir:** `tests/integration/fase2-visibility-approval.test.ts` (inclui 20 rodadas de aprovacao concorrente por `Promise.all`, indice sem gatilho e gatilho sem indice).

## D-0012: chaves estrangeiras compostas (client_id, id) e RLS por audiencia

- Data: 2026-11-25 · Estado: aceita pelo agente de dados; confirmacao do dono pendente
- Quem decidiu: agente de dados, a partir de D-0003 e D-0004

**Escolha:** toda tabela de cliente tem `UNIQUE (client_id, id)` e toda ligacao entre tabelas de cliente usa FK composta `(client_id, x_id) -> (client_id, id)` (migration `20261125100000_planos_conteudos_aprovacao_arquivos`; reversao `prisma/rollback/20261125100000_planos_conteudos_aprovacao_arquivos.down.sql`, ensaiada em `nexo_test`). Ligar conteudo do A a ciclo do B, versao a conteudo, aprovacao a versao, vinculo de arquivo a versao, roteiro, gravacao ou conteudo falha no banco, ate pela conexao do dono. FKs opcionais (conteudo do roteiro, versao do comentario, versao atual) usam `MATCH SIMPLE`: coluna nula nao e conferida, e o `client_id` continua amarrado pela FK do proprio cliente. Todas com `ON DELETE RESTRICT`.
- **Duas variaveis novas por transacao**, gravadas por `withTenant` (`app/src/server/db/scope.ts`): `app.audience` (`admin`, `staff` ou `client`, derivado de `users.role`) e `app.user_id`. Sem contexto o padrao e `client` (menos privilegiado). `withSystem` as zera. Com elas a RLS decide: o cliente so ve conteudo COMPARTILHADO, versao ENVIADA, comentario compartilhado, roteiro a partir de ENVIADO e arquivo ligado a destino visivel; so a agencia escreve em conteudo, versao e roteiro; so o ADMIN escreve em assinatura, ciclo e plano.
- **Gatilhos tratam conexao sem contexto como cliente.** Seed e fixtures que usam a conexao do dono precisam abrir transacao com `set_config('app.system','on',true)` (feito em `prisma/seed-fase2.ts` e `tests/integration/helpers/phase2.ts`).
- `service_plans` nao tem `client_id`: leitura so de ADMIN e STAFF (RLS e `systemContextForStaffArea`), escrita so do ADMIN (RLS e `systemContextForAdmin`), plano publicado imutavel (gatilho; so `active` muda). O portal le plano e preco do retrato da assinatura, congelado por gatilho.
- **Contadores de progresso:** `cycle_progress_counts(cycle_id)` e `SECURITY DEFINER` de proposito (o portal precisa dos numeros de todo o ciclo, inclusive pecas ainda internas, nunca dos titulos); o corpo trava no `app.client_id` e devolve so contagens. **Exige dono do banco com BYPASSRLS ou superusuario** (como o provisionamento, D-0009); com dono sem esse atributo a funcao devolveria zero linhas. Confirmar no deploy.
- Permissoes finas: STAFF atribuido tem `content:write` e `script:write` por padrao e pode te-las revogadas com entradas negativas (`-content:write`) em `client_members.permissions`; CLIENT_COLLABORATOR so aprova com a entrada `content:approve`. Nenhuma outra concessao e aceita. Nao ha tela para editar isso (por banco ou seed ate la).

**Como conferir:** `tests/integration/fase2-isolation.test.ts`, `src/server/authorization/permissions.test.ts`.

## D-0013: regra de progresso e maquinas de estado como funcoes puras

- Data: 2026-11-25 · Estado: aceita pelo agente de dados; duas escolhas de borda para o dono confirmar
- Quem decidiu: agente de dados, a partir da spec 0002

**Escolha:** `domain/progress.ts` (`computeCycleProgress`), `domain/content-state.ts`, `domain/script-state.ts` e `domain/external-link.ts` sao puras (sem banco, sem relogio, sem rede). Porcentagem por aritmetica inteira (`floor(publicadas * 100 / cota)`, trava em 100): sem erro de ponto flutuante. Contam so `countsTowardQuota && !isBonus` e status diferente de CANCELADO; Story, bonus e nao contaveis vao para `outsideQuota`; cancelados nao entram em nada. Funil cumulativo: publicadas (PUBLICADO, ANALISADO) estao em aprovadas (mais APROVADO, AGENDADO), em produzidas (mais AGUARDANDO_APROVACAO, EM_REVISAO) e em planejadas.
- **Cota zero:** `hasQuota=false`, porcentagem nula ("sem cota definida") e **excedente 0** (a spec dava `max(publicadas - cota, 0)`, que mostraria excedente sem haver meta; escolhi 0). Confirmar com o dono.
- Maquina do conteudo com tres gatilhos (`manual`, `version_sent`, `client_decision`): a agencia nunca aprova a mao; invalidar so por nova versao; CANCELADO terminal com justificativa de 10+ caracteres; PUBLICADO exige data e URL HTTPS (Instagram: instagram.com) ou evidencia; material de PUBLICADO ou ANALISADO nao se edita.
- Maquina do roteiro: fluxo linear mais regravacao (GRAVACAO_RECEBIDA ou EM_EDICAO volta a AGUARDANDO_GRAVACAO, com justificativa); com conteudo ligado, AGUARDANDO_APROVACAO, FINALIZADO e PUBLICADO exigem o estado do conteudo. A spec nao define cancelamento de roteiro: nao existe.
- Ciclo encerrado grava retrato (`close_snapshot`: contadores e escopo) e as telas leem o retrato; o banco recusa qualquer mudanca em ciclo encerrado, exceto reabrir com justificativa.

**Como conferir:** `src/server/domain/*.test.ts` (tabelas completas origem x destino, exemplo 7 de 12 = 58%, excedente 2).

## D-0014: matriz de permissoes da fase 2 (deny-by-default)

- Data: 2026-11-25 · Estado: aceita pelo agente de dados, a partir da matriz da spec 0002
- Quem decidiu: agente de dados

**Escolha:** `app/src/server/authorization/permissions.ts` (acoes novas `plan:*`, `subscription:*`, `cycle:*`, `content:*`, `comment:*`, `script:*`, `recording:*`, `asset:*`). ADMIN pode tudo menos `content:approve`. STAFF atribuido: le plano, assinatura e ciclo; opera conteudo, roteiro, arquivo e comentario interno; nao classifica cota nem aprova. CLIENT_OWNER: le o proprio retrato e progresso, comenta (so compartilhado), envia gravacao e arquivo, aprova. CLIENT_COLLABORATOR: igual, sem aprovar, salvo a concessao `content:approve`. `TenantContext` agora carrega `permissions` (lidas de `client_members` a cada requisicao). Cada servico e cada repositorio chamam `assertCan`; a RLS repete as regras de visibilidade e escrita.

**Como conferir:** `src/server/authorization/permissions.test.ts` (matriz completa) e os testes de integracao da fase 2.

## D-0015: driver de disco local para os arquivos (R-5); interface de storage no nivel dos bytes; S3 fica para depois

- Data: 2026-11-25 · Estado: aceita pelo agente de servidor; confirmacao do dono pendente (nada em producao)
- Quem decidiu: agente de servidor, a partir da spec 0002 (P4) e de D-0010

**Contexto:** D-0010 deixou a interface `ObjectStorage` com "alvo de envio assinado" e "URL de download" do proprio motor, pensando em S3. Para o disco local isso nao faz sentido (quem assina e o app) e, mesmo no S3, o link precisa ficar preso a pessoa e ser reconferido na entrega.

**Escolha:** a interface passou a mover so bytes (`put` em streaming com limite, `open`, `delete`, `list` para orfaos); URL assinada, autorizacao e tipo real ficam na camada de servico (`services/files.ts`), igual para qualquer motor. Driver de disco (`storage/local-disk.ts`): pasta por `STORAGE_LOCAL_DIR` (recusada dentro de `public/`, `src/`, `.next/`, `node_modules/`), chave `clients/<cliente>/<uuid>` validada por regex estrita (nome do usuario nunca vira caminho: sem path traversal), escrita em `.tmp/<uuid>.part` (flag `wx`, modo 0600), contagem de bytes e SHA-256 em streaming, `fsync` e publicacao por `link` (falha se a chave ja existe: nunca sobrescreve), diretorios 0700. Disco cheio ou pasta impossivel: `StorageUnavailableError` (503), sem detalhe interno. **Driver S3 nao implementado** (capacidade da VPS desconhecida, sem S3 real para testar); `docs/armazenamento.md` lista o que ele precisara cumprir.

**Limite aceito:** o envio e UM PUT em streaming, sem retomada por partes. Se cair, recomeca do zero enquanto o alvo vale. Para videos de ate 2 GB em rede movel isso pode ser ruim; **decisao do dono** se vale projetar envio em partes antes do uso real (nao foi feito para nao inventar complexidade sem teste).

**Consequencias:** a pasta de arquivos entra no backup junto com o banco; permissao so do usuario do app; o `proxy.ts` NAO pode cobrir `/api/files` (o Proxy do Next bufferiza o corpo ate 10 MB e entrega so o inicio ao handler, em silencio: ver a mutacao H9 no handoff).

**Como conferir:** `src/server/storage/storage.test.ts`, `tests/integration/fase2-arquivos.test.ts`, `tests/http/fase2-arquivos.test.ts`.

## D-0016: URL assinada curta ligada a pessoa, cliente e arquivo; entrega com reautorizacao a cada requisicao

- Data: 2026-11-25 · Estado: aceita pelo agente de servidor; confirmacao do dono pendente
- Quem decidiu: agente de servidor

**Escolha:** token HMAC-SHA256 (`storage/signed-token.ts`) com `STORAGE_SIGNING_SECRET` (obrigatorio em producao; em dev/teste deriva do `BETTER_AUTH_SECRET`), carregando finalidade (envio ou download), arquivo, cliente, pessoa e vencimento. Envio: 900 s; download: 60 s (configuraveis). O link e emitido por `POST` (gasta limite por pessoa) so depois de `assertCan`, de conferir que o arquivo e do cliente da sessao, esta `DISPONIVEL` e e visivel para a pessoa. Na entrega (`GET /api/files/download/<token>`, `PUT /api/files/upload/<token>`) o servidor reconfere sessao, assinatura, `token.userId == sessao`, participacao ativa (`resolveTenantContext`) e visibilidade: perder o acesso mata o link antigo. **Qualquer falha de vinculo e 404** (assinatura ruim, outra pessoa, outro cliente, acesso perdido, objeto sumido); **410** so para a pessoa certa com acesso valido e link vencido (nao revela que a assinatura de um terceiro era valida). Entrega **sempre como anexo**, com `Content-Type` do tipo validado, `nosniff`, `CSP: default-src 'none'; sandbox`, `no-store` e nome limpo (RFC 6266/5987); a querystring nao muda nada. Sem `Range`.

**Por que app-level e nao URL do motor:** o link pre-assinado do S3 nao fica preso a pessoa e nao reconfere acesso; aqui o app e sempre o porteiro. Custo: a banda passa pelo app (aceitavel no tamanho esperado; o S3 pode usar redirect de 60 s depois da reautorizacao, ver `docs/armazenamento.md`).

**Como conferir:** `src/server/storage/storage.test.ts` (token), `tests/integration/fase2-arquivos.test.ts` (relogio simulado, outra pessoa, outro cliente, acesso perdido), `tests/http/fase2-arquivos.test.ts` (410 com relogio real de 5 s, links forjados com o segredo de teste).

## D-0017: tipo real, limites por tipo e por pessoa, cota e limpeza (R-5)

- Data: 2026-11-25 · Estado: aceita pelo agente de servidor; valores dependem do dono (spec 0002, decisoes pendentes 2 e 3)
- Quem decidiu: agente de servidor

**Escolha:** (1) tipo real pelos primeiros 4096 bytes (`domain/file-type.ts`): JPEG, PNG, WebP, PDF (`%PDF-` no inicio), MP4 (so as marcas `isom`, `iso2` a `iso6`, `mp41`, `mp42`, `avc1`, `dash`, `M4V `, `MSNV`, `XAVC`; HEIC/HEIF/AVIF tambem usam `ftyp` e ficam de fora), MOV (`qt  `) e WebM (EBML com DocType `webm`; Matroska comum fica de fora). Tipo declarado, extensao final e conteudo precisam concordar; qualquer divergencia = 422, objeto apagado, registro `REJEITADO` e auditado. Extensao perigosa em QUALQUER parte do nome (`foto.jpg.exe`, maiusculas) recusa no pedido; isso tambem recusa nomes como `empresa.com.jpg` (falso positivo aceito: `com` esta na lista de executaveis da spec). (2) Limite por tipo por `MAX_IMAGE_MB`, `MAX_PDF_MB`, `MAX_VIDEO_MB` (20, 50, 2048); o envio e limitado ao MENOR entre o limite do tipo e o tamanho declarado, e tamanho recebido menor que o declarado nao finaliza (`INCOMPLETE_UPLOAD`, segue `PENDENTE`). (3) Por pessoa, nunca global: pedidos de alvo (`UPLOAD_RATE_MAX`, 60 por 10 min), links e entregas (`DOWNLOAD_RATE_MAX`, 300), pendentes simultaneos (10) e cota de armazenamento do cliente (`STORAGE_CLIENT_QUOTA_MB`, 50 GB, `DISPONIVEL` mais pendentes declarados). (4) Limpeza idempotente (`cleanupFiles` e `scripts/limpar-arquivos.mjs`): pendentes com mais de 24 h viram `EXCLUIDO`, objetos orfaos e temporarios velhos saem, nunca toca `DISPONIVEL`; roda com o papel do app em escopo de manutencao (`systemContextForMaintenance`, so tarefas, nunca handler). (5) Arquivo da gravacao precisa ser `VIDEO` `DISPONIVEL` que a pessoa ve.

**Fica sem prova:** PDF ou video valido com conteudo malicioso (sem antivirus, decisao do dono); arquivo de 2 GB real; disco cheio real.

## D-0018: contrato HTTP da fase 2 (portas separadas, Zod nos dois lados, erros do banco, idempotencia)

- Data: 2026-11-25 · Estado: aceita pelo agente de servidor
- Quem decidiu: agente de servidor

**Escolha:** duas portas sem autorizacao compartilhada: `/api/admin/clients/[id]/...` (`adminCtx`: ADMIN ou STAFF atribuido; o id da URL e so o alvo, 404 uniforme) e `/api/portal/...` (`portalCtx`: so pessoa de cliente; o cliente vem da sessao, `?clientId=` e ignorado). Catalogo de planos em `/api/admin/plans` (STAFF le, so ADMIN escreve). Id de rota malformado e inexistente respondem o mesmo 404. **Entrada**: `z.strictObject` em todo corpo (campo desconhecido, como `clientId`, `authorId` ou `status`, vira 422: sem mass assignment); autor e horario nunca vem do corpo; JSON com teto de 1 MB (413, lido em streaming, sem confiar so no Content-Length). **Saida**: esquemas Zod por recurso, um para a agencia e outro menor para o portal (`http/dto-fase2.ts`); `parse` descarta toda chave nao declarada. Regras que o banco faz valer (gatilhos, CHECK, unicidade, FK, RLS) viram 409/422/403 padronizados (`mapDatabaseError`); so o texto dos NOSSOS gatilhos volta ao cliente. Versao desatualizada: decisao (`versionId`), edicao de material e envio (`expectedVersionId`) recusam com 409. Idempotencia: decisao repetida da mesma pessoa = 200 com o mesmo id, upload finalizado repetido = 200, gravacao repetida = a mesma. Lista paginada (`page`, `pageSize` ate 50), filtrada e ordenada no servidor (`sort` so por colunas permitidas; valor invalido = 422). Sem server action e sem GET que mude estado (o link de download e emitido por POST). Auditoria: `plan.*`, `subscription.*`, `cycle.*`, `content.*` (inclui `planning_updated`), `approval.decided`, `asset.finalized|rejected|deleted|attached|detached|visibility_changed|pending_purged`, `script.*`, `recording.*`. O portal nunca recebe `overRevisionLimit`, classificacao de cota, objetivo, pilar, briefing, notas, rascunho, responsavel (so o nome, se marcado) nem `storage_key`.

**Responsavel (assignee):** so ADMIN ou STAFF atribuido ao cliente (`assertAssignable`); impede apontar usuario de outro cliente.

**Progresso no portal:** `GET /api/portal/plan` devolve o retrato da assinatura e SO numeros do ciclo (sem fora-da-cota por peca nem titulos); sem `cycleId`, vale o ciclo da competencia atual no fuso do cliente.

**Como conferir:** `tests/http/fase2-*.test.ts`.

## D-0019: telas da fase 2 (cliente-alvo na URL da agencia, decisao no servidor, sem capacidade simulada)

- Data: 2026-11-25 · Estado: aceita pelo agente de telas (depende de confirmacao do dono)
- Quem decidiu: agente de telas

**Escolha:** (1) as telas de agencia (`/admin/plans`, `/admin/subscriptions`, `/admin/calendar`, `/admin/contents`, `/admin/scripts`) mostram um cliente por vez; o cliente vem em `?client=<id>` e e so o ALVO: `loadAdminScope` chama `resolveAdminClientContext` (ADMIN, ou STAFF atribuido; id invalido, inexistente ou nao atribuido = a mesma tela de nao encontrado) em CADA pagina, o layout nunca e a unica barreira. (2) O portal nunca le cliente da URL: `loadPortalScope` usa `resolveTenantContext` com a sessao; `?client=` no portal e ignorado (provado no E2E). (3) Paginas leem pelos mesmos servicos e pelos mesmos esquemas Zod de saida da API (`dto-fase2.ts`), entao o cliente nunca recebe campo interno na tela; nada de dado por pessoa em cache compartilhado (todas as paginas sao dinamicas por sessao). (4) Botao so existe para quem tem a permissao (`can` no servidor), mas isso e conveniencia: a API recusa de novo (403/404). (5) Mutacoes pelo cliente unico da API (`lib/api/client.ts`, resposta validada com Zod, erros em pt-BR); envio de arquivo em duas etapas com XMLHttpRequest so para ter progresso (`lib/api/upload.ts`); download so por link assinado curto emitido por POST. (6) Capacidades que o backend nao tem aparecem como ausentes, sem botao falso: tela de permissoes finas (`content:approve`, `-content:write`) so por banco; sem e-mail ou notificacao; sem driver S3; sem selo "aguardando o cliente ha N dias uteis" nem "revisao acima do combinado" (o servico calcula mas nao guarda); atraso e calculado na tela (data prevista passada sem publicar, analisar ou cancelar). (7) Seletor nativo (`NativeSelect`) nos formularios novos e filtros: teclado, leitor de tela e GET sem JavaScript.

**Como conferir:** `app/e2e/fase2-*.spec.ts`; `app/src/server/page-data.ts`.


## D-0020: limpeza de arquivos so com banco e pasta da mesma instalacao; orfao vai para a lixeira (M-A, revisao independente da fase 2)

- Data: 2026-11-25 · Estado: aceita pelo agente de servidor; confirmacao do dono pendente
- Quem decidiu: agente de servidor, por pedido do dono depois da revisao independente

**Problema (confirmado):** a limpeza apagava do disco todo objeto com mais de N horas sem linha em `assets`. Com o banco errado, ou restaurado de um backup mais velho que os arquivos, todo objeto virava "orfao" e sumia sem lixeira; `--ambiente` era so um rotulo; `--horas 0` era aceito e matava envios em andamento.

**Escolha:** (1) **lixeira**: orfao NAO e apagado; `moveToTrash` o leva para `.trash/` dentro da raiz do armazenamento (mesma chave, hora do movimento no `mtime`) e so `cleanupFiles` o apaga de verdade depois de `STORAGE_TRASH_RETENTION_DAYS` (padrao 30). Restaura por `--restaurar <chave>` (`restoreFromTrash`; recusa se a chave ja existe). (2) **tetos**: antes de mover qualquer orfao, a conta fecha ou a limpeza aborta (codigo 3, nada movido): mais de `CLEANUP_MAX_ORPHANS` (20), mais de `CLEANUP_MAX_ORPHAN_RATIO` (10%, so com 10 objetos ou mais na pasta) ou banco sem nenhum arquivo `DISPONIVEL` com 10 objetos ou mais na pasta. Quem opera pode aceitar de forma explicita com `--max-orfaos` e `--max-proporcao`; mesmo assim o orfao so vai para a lixeira. (3) **identificador da instalacao**: a migration `20261125140000` cria `app_settings` com um `installation_id` aleatorio (RLS so em escopo de sistema; o app so le e cria, sem UPDATE nem DELETE); `.install-id` na raiz do armazenamento guarda o mesmo valor; a limpeza so roda se os dois existem e combinam. Divergencia aborta sempre, ate com as flags de aceite; falta de um dos lados aborta e NUNCA cria em silencio: so `--vincular-instalacao` (pedido explicito) grava o que falta, copiando o que existe, e nunca sobrescreve. (4) **minimo de 1 hora** em `--horas` (e no servico). (5) **`--ambiente` obrigatorio e conferido** contra o banco real com a mesma funcao do provisionamento (`autorizarDestino`): dev = 127.0.0.1/localhost com `nexo_dev`, test = `nexo_test`, producao = banco que nao seja de dev/teste e host em `PROVISIONAR_HOST_PERMITIDO`; divergencia = recusa com codigo 2.

**Limite aceito:** backup restaurado do MESMO banco (mesmo `installation_id`) mas mais velho que os arquivos passa pela trava de identificador; quem protege nesse caso sao os tetos e a lixeira (objetos recentes demais para a idade minima nao sao candidatos; os antigos sem registro vao para a lixeira por 30 dias, tempo de perceber e restaurar). Nao ha como o app distinguir "arquivo sem registro porque o backup e velho" de "orfao de verdade".

**Como conferir:** `app/tests/integration/fase2-limpeza-capacidade.test.ts`, o bloco do comando em `fase2-arquivos.test.ts`, `src/server/domain/cleanup-policy.test.ts`, `fase2-endurecimento.test.ts` (tabela `app_settings`).

## D-0021: capacidade do armazenamento: trava por cliente, cota do cliente inteiro, teto global e espaco livre (M-B)

- Data: 2026-11-25 · Estado: aceita pelo agente de servidor; valores dependem do dono
- Quem decidiu: agente de servidor

**Problema (confirmado):** "contar e depois inserir" sem trava (pedidos paralelos passavam de 10 pendentes e da cota), cota so conferida no pedido, sem teto global nem espaco livre. **Achado extra deste agente:** a cota somava bytes pela sessao do cliente, e a RLS de `assets` so mostra ao cliente o que ele mesmo enviou; ou seja, cada colaborador tinha uma cota propria e os arquivos INTERNOS da agencia nao contavam.

**Escolha:** (1) trava consultiva por cliente (`pg_advisory_xact_lock`, `lockClientUploads`) no pedido de envio e na finalizacao do PUT, antes de contar pendentes e bytes; (2) cota do CLIENTE INTEIRO por `client_storage_bytes` (SECURITY DEFINER, so devolve um numero, confere o cliente da sessao; mesma dependencia de `cycle_progress_counts`: o dono do banco ignora RLS); (3) rechecagem da cota ao finalizar o PUT (`STORAGE_QUOTA_EXCEEDED` 422, objeto apagado, registro `REJEITADO` e auditado); (4) `STORAGE_GLOBAL_QUOTA_MB` (padrao 100 GB; soma de todos os clientes, em escopo de capacidade, por `storage_bytes_total`, SECURITY DEFINER que so devolve um numero e so responde em escopo de sistema; somar pela RLS custava ~50 microssegundos por linha, 180 ms por pedido com 3 400 arquivos, e cresceria com a tabela) e `STORAGE_MIN_FREE_MB` (padrao 2 GB; `fs.statfs` no pedido e de novo no PUT), ambos com **507** `STORAGE_FULL`, mensagem clara e sem numero interno; no PUT o alvo continua valendo e o registro segue `PENDENTE`; (5) cota por cliente padrao **10 GB** (era 50 GB), tudo por variavel de ambiente (0 desliga) e documentado em `docs/armazenamento.md` e no runbook (volume dedicado, alerta de disco).

**Limite aceito:** o teto global NAO tem trava entre clientes diferentes (travar todos os pedidos num ponto so e pior que passar um pouco do teto): pedidos simultaneos de clientes distintos podem ultrapassar o teto global por ate (numero de pedidos simultaneos x tamanho declarado). O espaco livre e medido de verdade a cada envio e e a protecao final.

**Como conferir:** `fase2-limpeza-capacidade.test.ts` (20 pedidos paralelos, cota por varias pessoas e por arquivo interno, PUT acima da cota, teto global, espaco livre), `env.test.ts`.

## D-0022: o banco tambem barra o cliente em decisao, membros e convites; gatilhos de regra ENABLE ALWAYS (B-1, B-2, extras)

- Data: 2026-11-25 · Estado: aceita pelo agente de servidor
- Quem decidiu: agente de servidor

**Problema (confirmado por SQL como `nexo_app` com `audience=client`):** `UPDATE contents SET status='APROVADO'` direto passava sem linha em `approvals`; `client_members.role`/`permissions`/`status` eram gravaveis pela sessao do cliente (um colaborador virou dono com `content:approve`). **Achados extras do agente:** um colaborador sem `content:approve` gravava decisao por SQL, e a sessao do cliente criava convite (`invitations`, politica FOR ALL) de dono para o proprio cliente.

**Escolha (migration `20261125140000`, com `.down.sql` ensaiado):** `contents_client_decision_guard` (o cliente so passa de AGUARDANDO_APROVACAO para APROVADO ou EM_REVISAO se existir decisao ATIVA da versao atual, do tipo certo, feita por ele nesta MESMA transacao: `created_at = now()` arredondado a ms); `approvals_client_permission_guard` (so dono ou colaborador com `content:approve`, ativos, gravam decisao); `client_members_admin_only` e `invitations_admin_only` (so ADMIN ou escopo de sistema criam, alteram ou apagam; STAFF tambem nao). Os gatilhos valem para o papel do app (`current_user = 'nexo_app'`): o dono do banco (migrate, seed, fixtures) fica fora, porque ele pode desligar qualquer gatilho de qualquer forma (limite aceito, como em R-10). Todos os gatilhos de regra de usuario, antigos e novos, passam a `ENABLE ALWAYS` (valem com `session_replication_role = replica`): `contents_guard`, `contents_invalidate_approvals`, `assets_guard`, `asset_links_guard`, `recordings_guard`, `subscriptions_guard`, `editorial_cycles_guard`, `service_plans_guard`, `client_members_role_check`, mais os quatro novos. O teste confere `tgenabled = 'A'` em TODO gatilho do esquema `public`.

**Como conferir:** `app/tests/integration/fase2-endurecimento.test.ts`.

## D-0023: limites por pessoa nas demais mutacoes, auditoria faltante, quarentena e APP_URL https (B-3 a B-6, B-8)

- Data: 2026-11-25 · Estado: aceita pelo agente de servidor
- Quem decidiu: agente de servidor

**Escolha:** (1) B-5: `limitMutation` (reusa `rate_limits` e `limitByUser` da fase 2, balde proprio `app:mut-<tipo>:user:<id>`, janela de 10 min, valor por variavel) em decisao (`DECISION_RATE_MAX` 60), comentario de conteudo e de roteiro (`COMMENT_RATE_MAX` 60), gravacao (`RECORDING_RATE_MAX` 20), criacao de conteudo (`CONTENT_CREATE_RATE_MAX` 120) e PUT dos bytes (`UPLOAD_PUT_RATE_MAX` 120); nada do login nem dos limites antigos foi afrouxado. (2) B-6: `editScript` grava `script.updated` (so nomes de campo e numero de cenas); a emissao do link de download grava `asset.download_link_issued` na mesma transacao da autorizacao, sem token e sem chave. **Comentarios ficam so no proprio registro imutavel** (`comments` e append-only, com autor e horario; auditar cada comentario duplicaria o dado). A entrega (GET do link) nao grava auditoria: ja tem limite por pessoa e a emissao ja foi registrada. (3) Quarentena: `scan_status = QUARENTENA` faz `requestDownload` e `deliverDownload` recusarem com 423 `ASSET_QUARANTINED`; nao ha antivirus que defina esse estado (so a agencia o define, por banco, ate existir tela). (4) B-3: tipos permitidos em `Map` (`ruleForMime`); `__proto__`, `constructor`, `toString` e afins nao sao tipo. (5) B-4: o nome do download perde a barra invertida, e cortado em 120 pontos de codigo ANTES de montar o cabecalho (sem partir par substituto) e substituto solto vira U+FFFD. (6) B-8: em producao `APP_URL` e obrigatoria e https; o app nao inicia sem isso (mensagem cita so o nome). `ALLOW_INSECURE_LOCAL_APP_URL=true` existe so para o teste automatizado e so vale para http em localhost, 127.0.0.1 ou [::1]; um dominio real continua recusado.

**Como conferir:** `tests/http/fase2-limites.test.ts` (instancia `BASE_MUT`), `fase2-limpeza-capacidade.test.ts` (auditoria e quarentena), `asset-policy.test.ts`, `content-disposition.test.ts`, `env.test.ts`.
