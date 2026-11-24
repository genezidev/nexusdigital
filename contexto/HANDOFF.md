# Handoff

- Revisão e branch: repositório Git local, sem commits (nada commitado ainda)
- Spec ativa: specs/0001/spec.md (aprovada pelo dono em 2026-11-24; fases 0 e 1)
- Estado (2026-11-24): fase 1 com camada de dados e camada de telas/handlers prontas e provadas em `nexo_test` (HTTP real e Playwright). Falta a revisão de segurança (`playbook/varreduras.md`), SMTP e a decisão do dono sobre D-0006 antes de qualquer deploy.
- Decisões: D-0001 VPS (aceita); D-0002 Better Auth (aceita; validado em banco: login, bloqueio, reset em hash e de uso único, sem cadastro público); D-0003 Postgres + Prisma com filtro por cliente; D-0004 RLS com papel `nexo_app` sem BYPASSRLS (aceita, depende de confirmação do dono); D-0005 tabelas do Better Auth + convite próprio (aceita, idem)
- Design: design/DESIGN.md preenchido com os tokens da especificação
- App: pasta `app/` (Next.js 16.4.6, React 19.3.0, Prisma 7.10.1 + @prisma/adapter-pg 7.10.1 + pg 8.23.1, Better Auth 1.7.27, Zod 4.6.7, Vitest 4.1.12, tsx 4.23.15, dotenv 18.0.10), versões fixas. Vitest 5.1.1 deu conflito com @types/node 20.

## Banco e dados (feito nesta fase)

- PostgreSQL 18.7 em `docker compose up -d db` (127.0.0.1:5433). Bancos `nexo_dev` e `nexo_test`. O Docker Desktop reiniciou o motor uma vez durante o trabalho; o volume persistiu.
- Segredos de DEV só em `app/.env` (ignorado pelo Git), gerado por `node scripts/gerar-env-dev.mjs` (não sobrescreve). `app/.env.example` tem só nomes. Duas URLs: `DATABASE_URL` (papel `nexo_app`, runtime) e `DATABASE_MIGRATE_URL` (dono `nexo`, só migrate/seed). Variáveis `TEST_*` apontam para `nexo_test`.
- Schema: `app/prisma/schema.prisma` (users, sessions, accounts, verifications geradas pelo CLI do Better Auth e ajustadas; clients, client_members, invitations, audit_logs). UUIDs, timestamptz, enums, índices e únicos compostos. `reset_tokens` não existe: o reset usa `verifications` com identificador em hash (D-0005).
- Migrations: `20261124151026_init` e `20261124151100_rls_e_papeis` (papel, GRANTs, RLS forçada, constraints, gatilho de papel de membro, índice único parcial de convite pendente). Reversão da segunda: `app/prisma/rollback/20261124151100_rls_e_papeis.down.sql` (ensaiada em nexo_test: desfez e reaplicou). Prisma não gera "down"; a volta da primeira em dev/teste é recriar o banco; em produção seria restaurar o backup tirado antes.
- Camada de acesso: `app/src/server/db` (cliente com adapter, `withTenant`/`withSystem`), `authorization` (contexto resolvido da sessão, permissões deny-by-default), `repositories` (clients, members, invitations, audit), `services/invitations.ts`, `auth/auth.ts` (Better Auth configurado).
- Seed de demonstração (somente nexo_dev/nexo_test, recusa outro destino): admin, staff (atribuído ao A), dono do Cliente A, dono do Cliente B; senha vem de `SEED_PASSWORD`.

## Comandos (a partir de `app/`)

- `node scripts/gerar-env-dev.mjs` (uma vez), depois `node scripts/db-migrar.mjs dev` e `... test` (aplica migrations e define a senha do `nexo_app`), `node scripts/db-seed.mjs dev`.
- `node node_modules/prisma/build/index.js generate` antes de typecheck/build (o client fica em `src/generated`, ignorado pelo Git). Está em `quality/checks.json` como `prisma-generate`.
- Testes de integração: `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts` (script `npm run test:integration`; em `quality/checks.json` como `testes-integracao`). O global setup aplica as migrations em nexo_test.
- `python scripts/verificar.py --executar` (raiz) em 2026-11-24: prisma-generate OK, lint OK, typecheck OK, testes unitários OK (4), testes de integração OK (5 arquivos, 60 testes, ~25 s), build OK.

## Prova de que os testes pegam a violação

Mutações manuais (código quebrado de propósito, restaurado depois): remover o filtro de `clientId` em members, invitations e clients; remover a checagem de expiração do convite; remover `used_at IS NULL`; aceitar STAFF sem participação; guardar token de reset em texto puro; remover a checagem e o tratamento de e-mail duplicado; desligar a RLS de `invitations` em nexo_test. Em todos, pelo menos um teste falhou. Uma mutação (remover só a checagem de e-mail no código) passou porque o índice único do banco e o tratamento de P2002 cobrem o caso; removidas as duas camadas, o teste falhou.

## Telas e handlers (2026-11-24, agente web)

- Rotas: `/login`, `/invite/[token]`, `/forgot-password`, `/reset-password`, `/admin` (painel), `/admin/clients`, `/admin/clients/[id]`, `/admin/audit` (só ADMIN), `/admin/profile`, `/portal`, `/portal/profile`, `/acesso-negado`. API em `app/src/app/api/` (`auth/[...all]` com lista de permissão, `invitations/accept`, `admin/clients...`, `admin/audit`, `portal/context`, `portal/client`, `me/theme`).
- Camadas novas: `src/server/http/` (actor, handler com CSRF e limite, respond, dto, rate-limit), `src/server/services/` (access, clients, members, portal, preferences), `src/server/page-session.ts`, `src/proxy.ts` (só cookie), `src/lib/api/client.ts` (cliente único que valida a resposta com Zod), `src/lib/schemas.ts`, `src/components/ui` (shadcn) e `src/components/app`.
- Migration nova `20261124200000_tema_e_rate_limit` (tema por usuário e `rate_limits`), aplicada em `nexo_dev` e `nexo_test`; reversão ensaiada em `nexo_test`. Ver D-0006.
- Dependências novas (todas com versão fixa): react-hook-form 7.92.0, @hookform/resolvers 7.0.9, radix-ui 1.8.1, lucide-react 1.79.0, sonner 2.0.8, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.1, tw-animate-css 1.4.0; dev: @playwright/test 1.65.1, @axe-core/playwright 4.14.0. O CLI do shadcn (4.23.0) foi usado e removido (trazia vulnerabilidade moderada em dependência de desenvolvimento). Atenção: o CLI instalou o pacote npm `cn` (homônimo, não é o utilitário); foi removido e o utilitário vive em `src/lib/utils.ts`. `npm audit` ainda aponta 3 altas em `effect`, dependência do CLI do Prisma (pré-existente, sem correção sem subir o Prisma).
- Comandos novos (a partir de `app/`): `node node_modules/vitest/vitest.mjs run --config vitest.http.config.ts` (testes HTTP; exige `next build` antes e sobe `scripts/iniciar-app-teste.mjs` na porta 3100 contra `nexo_test`); `node node_modules/@playwright/test/cli.js test` (E2E, capturas e axe; porta 3101; exige `next build`; instalar o navegador uma vez com `node node_modules/@playwright/test/cli.js install chromium`). Ambos em `quality/checks.json` (`testes-http`, `e2e-playwright`). Os dois exigem `SEED_PASSWORD` e as URLs `TEST_*` em `app/.env`. Não rode dois `verificar.py` ao mesmo tempo (disputam `.next`).
- Variáveis novas (nomes em `.env.example`): `TRUST_PROXY`, `AUTH_SIGNIN_RATE_MAX`.

## Falha do e2e dentro do verificar.py (2026-11-24) e correção

- Sintoma: `python scripts/verificar.py --executar` derrubava 31 testes e2e com "browserType.launch: Executable doesn't exist at ...\AppData\Local\ms-playwright\...", enquanto o mesmo e2e rodado direto do shell passava.
- Causa raiz (confirmada com evidência, não era rate limit nem estado de teste): o Python usado pelo `verificar.py` (`pythoncore-3.15`) enxerga uma cópia virtualizada de `%LOCALAPPDATA%`. `os.path.exists` do Python devolvia False para o Chromium que o PowerShell via (226 MB, presente), e o `node` filho herda essa visão. O erro só aparece quando o e2e é lançado pelo Python.
- Correção: `app/playwright.config.ts` fixa `PLAYWRIGHT_BROWSERS_PATH` em `app/.playwright-browsers` (ignorado pelo Git). Instalar uma vez com `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers node node_modules/@playwright/test/cli.js install chromium` (em `app/`). O cache antigo em AppData não é mais usado.
- Teste "carregando: skeleton" era instável por corrida: o esqueleto só aparece se o Next já pré-buscou o casco da rota; às vezes o clique vinha antes. A UI estava certa. O teste agora espera a resposta da pré-busca antes de atrasar a rede (`e2e/estados.spec.ts`). `--repeat-each=10`: 10 de 10 verdes (antes: 4 de 5).
- Prova: duas passadas completas e seguidas de `python scripts/verificar.py --executar`, cada uma com as 8 checagens OK (prisma-generate, lint, typecheck, testes-unitarios 30, testes-integracao 60, build, testes-http 34, e2e-playwright 34) e código de saída 0.
- Observação: o rate limit não foi tocado; o e2e usa `AUTH_SIGNIN_RATE_MAX=1000` só no app de teste e os testes HTTP usam IP próprio por teste.

## Limitações e o que não foi provado

- Nada foi aplicado em produção nem em banco remoto. Restauração de backup não foi testada nesta fase.
- Escopos de sistema (ADMIN entre clientes, convite por token, resolução de sessão) não têm RLS por cliente; a proteção ali é o código (D-0004).
- Isolamento, cookies, CSRF e limite de tentativas agora foram provados por HTTP real e navegador (ver spec e MODELO-DE-SEGURANCA R-6 a R-9). Continua sem prova: carga, penetração, `playbook/varreduras.md`, CSP com nonce e HSTS.
- Páginas de acesso negado/redirecionamento respondem 200 com a tela correspondente (Cache Components); as APIs devolvem o status real.
- Envio de e-mail não existe: recuperação de senha mostra "indisponível" (API 503 uniforme) e o link de convite é copiado pelo admin uma única vez.
- `design/DESIGN.md`: o linter `designmd` não foi rodado (o `npx` do pacote de terceiros não foi autorizado); rode `npx -p @google/design.md designmd lint design/DESIGN.md` com a autorização do dono.
- Convite para pessoa que já tem conta continua 409; STAFF só pode ser atribuído por banco/seed (não há tela de atribuição).
- Armazenamento de senha é scrypt (Better Auth); a especificação cita Argon2id ou bcrypt (decisão do dono pendente, ver R-3).
- Convite para pessoa que já tem conta (acesso a mais de um cliente) não foi implementado: hoje dá conflito 409.
- `lastLoginAt` ainda não é preenchido. Envio de e-mail (SMTP) não implementado: reset sem SMTP falha de forma explícita.
- O banner do Prisma sugeriu versão mais nova; mantida a 7.10.1 fixa (o dist-tag `latest` de @prisma/adapter-pg era 7.10.1 em 2026-11-24).
- A senha DEV do banco (`nexo_dev_local`) já está em `compose.yaml` e aparece em `app/scripts/gerar-env-dev.mjs`; é só local. Em produção, usar segredos fora do Git.

## Próximos passos

1. Dono: confirmar D-0006 (limite em banco, proxy só de cookie, migration de tema/rate limit) e decidir se quer tela de atribuição de STAFF e convite para quem já tem conta.
2. Revisão de segurança com `playbook/varreduras.md`, CSP com nonce, HSTS no proxy da VPS, `TRUST_PROXY=true` atrás do proxy, política de retenção de `rate_limits` (IP).
3. SMTP real (convite e recuperação de senha); então ligar `isEmailDeliveryAvailable` e testar o reset de ponta a ponta.
4. Backup e restauração testados antes da fase 5; MFA do admin na fase 5.
