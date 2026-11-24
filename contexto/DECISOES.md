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

