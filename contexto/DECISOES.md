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
