# Primeira entrega: fundação, acesso e isolamento entre clientes (fases 0 e 1)

Estado: em andamento, telas e handlers implementados e provados em teste (aprovada pelo dono em 2026-11-24) · Data: 2026-11-24

Fonte do produto completo: contexto/ESPECIFICACAO-MESTRE.md. Esta spec cobre só as fases 0 e 1 do roadmap daquele documento.

## Objetivo e atores

Ter o Nexo Digital rodando localmente, com login por convite, e provar que a agência cadastra dois clientes e cada um enxerga somente os próprios dados.

Atores: ADMIN (dono da agência), STAFF (equipe, só clientes atribuídos), CLIENT_OWNER e CLIENT_COLLABORATOR (pessoas do cliente).

## Histórias por prioridade

### P1: Admin entra e cadastra clientes

- Jornada: o admin faz login, abre `/admin/clients`, cria a empresa "Cliente A" e "Cliente B" com nome, contato e fuso.
- Por que vem primeiro: sem clientes não há multiempresa para provar.
- Teste independente: com um admin criado por seed, criar dois clientes, ver os dois na lista e ver registros na auditoria.
- Dado um admin autenticado, quando cria um cliente com dados válidos, então o cliente aparece na lista e a criação fica na auditoria.

### P2: Convite de uso único e definição de senha

- Jornada: o admin convida uma pessoa para um cliente; ela abre o link, define a senha e entra no portal.
- Por que vem em segundo: é o único caminho de entrada (não há cadastro público).
- Teste independente: convite criado, aberto uma vez, senha definida, login funciona; segunda abertura do mesmo link falha.
- Dado um convite válido, quando a pessoa define uma senha forte, então a conta é ativada e o convite fica inutilizável.

### P3: Isolamento entre clientes

- Jornada: o usuário do Cliente A tenta abrir, por URL ou API, dados do Cliente B.
- Por que vem em terceiro: é a regra que não pode falhar.
- Teste independente: teste automatizado de IDOR/BOLA com dois clientes.
- Dado um usuário do Cliente A, quando pede qualquer recurso do Cliente B, então recebe acesso negado ou não encontrado, sem vazar dados.

### P4: Recuperação de senha, logout e revogação

- Jornada: a pessoa esquece a senha, recebe um link de uso único, redefine e as sessões antigas deixam de valer; admin pode bloquear uma conta.
- Teste independente: reset de uso único; sessão revogada não acessa mais nada; conta bloqueada não entra.

### P5: Layout base e papéis

- Jornada: admin vê o menu administrativo, cliente vê o portal; STAFF só vê clientes atribuídos; troca de cliente (usuário com mais de uma empresa) limpa o contexto anterior.
- Teste independente: usuários de cada papel abrem as rotas e veem apenas o que o papel permite; páginas com estados vazio, carregando, erro e acesso negado.

## Casos-limite e erros

- Convite expirado, já usado ou com token inválido: mensagem clara, sem revelar se o e-mail existe.
- E-mail duplicado: conflito tratado (409), sem criar usuário repetido.
- Senha fraca ou curta: erro inline.
- Muitas tentativas de login ou reset: limite de tentativas (429), por IP confiável e por e-mail, sem balde global (um anônimo não bloqueia o login dos outros; `docs/proxy-e-ip.md`).
- E-mail (SMTP) indisponível: o convite fica gerado e o admin pode copiar o link manualmente; nunca mostrar sucesso falso.
- Usuário sem permissão: acesso negado sem stack trace.

## Fluxo, telas e estados

Telas públicas: `/login`, `/invite/[token]`, `/forgot-password`, `/reset-password`. Admin: `/admin`, `/admin/clients`, `/admin/clients/[id]`, `/admin/audit`. Portal: `/portal`, `/portal/profile`. Cada tela com estados vazio, carregando, erro e acesso negado. Visual segue os tokens da especificação mestre (seção 6), tema claro e escuro, testado em 360, 768 e 1440 px. O design é detalhado em design/DESIGN.md antes de construir as telas (não há protótipo HTML).

## Dados, contratos e permissões

Tabelas desta entrega: users, clients, client_members, invitations, reset_tokens, sessions, audit_logs. Todas as tabelas de cliente carregam `client_id`; o repositório de dados sempre filtra pelo cliente da sessão, nunca por `clientId` vindo do navegador. Permissões verificadas no servidor em cada operação. Detalhes de papéis em contexto/MODELO-DE-SEGURANCA.md.

## Critérios de sucesso mensuráveis

- Admin cria dois clientes e convida um usuário para cada um em menos de 5 minutos.
- 100% dos testes de isolamento passam: nenhum recurso de B é lido, alterado ou listado por usuário de A.
- Convite funciona uma única vez e expira no prazo definido.
- Sessão revogada ou conta bloqueada perde acesso na requisição seguinte.
- Lint, typecheck, testes e build passam com os comandos reais de `quality/checks.json`.

## Suposições

- Hospedagem de produção: VPS própria (decidido pelo dono em 2026-11-24); só vira publicação depois da fase 5 e com autorização.
- Não há protótipo `portal_marketing.html`; o designer da base cria as telas a partir da especificação.
- Autenticação com Better Auth no lugar do Auth.js citado na especificação (ver D-0002, ainda proposta), por ser a recomendação da base e do próprio Auth.js para projetos novos.
- Prazo de validade do convite: 7 dias. Senha mínima: 12 caracteres.
- MFA do admin fica para a fase 5.
- Envio de e-mail por SMTP é opcional nesta fase; o admin pode copiar o link do convite.
- Usuário inicial admin criado por seed local com dados fictícios; em produção, criado por `app/scripts/provisionar-producao.mjs` (confirmação explícita, ambiente declarado, senha por ambiente ou prompt; `docs/runbook-producao.md`).

## Referências e armadilhas

- contexto/ESPECIFICACAO-MESTRE.md (seções 3, 4, 7, 8, 9 e 12), playbook/stacks/web.md, playbook/saas/contas-e-acesso.md, playbook/saas/multiempresa.md, playbook/seguranca.md, playbook/licoes-de-producao.md.
- Ler o guia do Next.js da versão instalada em `node_modules/next/dist/docs/` antes de seguir exemplos externos.
- Armadilhas: `npm install` sem versão traz pré-lançamento do Prisma; cache do Next mostrando dado de outro usuário; confiar em `clientId` do navegador; variável `NEXT_PUBLIC_` é pública.

## Fora do escopo, dependências e riscos

- Fora: planos, conteúdos, roteiros, financeiro, métricas, relatórios, contratos, integrações, deploy real (fases 2 a 6).
- Dependências: Node, PostgreSQL local (Docker Compose), SMTP opcional.
- Risco: divergência entre a especificação (Auth.js) e a recomendação da base (Better Auth); resolvida em D-0002.

## Execução e evidências

- Comandos reais de verificação: `python scripts/verificar.py --executar` (prisma-generate, lint, typecheck, testes-unitarios, testes-integracao, build); migrate e seed por `app/scripts/db-migrar.mjs` e `db-seed.mjs` (ver contexto/HANDOFF.md).
- Resultado por história e critério (telas e handlers, 2026-11-24; ambiente `nexo_dev`/`nexo_test`, app compilado em 127.0.0.1):
  - **P1** admin cria Cliente A e B: `app/e2e/jornada.spec.ts` (UI real: login, "Novo cliente" com fuso padrão America/Maceio, lista com busca e paginação no servidor, auditoria "Cliente criado"); `app/tests/http/accounts.test.ts` (API: criação, 422 por campo, busca, página 2, auditoria). Passou.
  - **P2** convite de uso único: `jornada.spec.ts` (admin convida, link mostrado uma única vez com aviso de que nenhum e-mail foi enviado, pessoa ativa a conta e entra, segunda abertura mostra "Convite inválido ou expirado"); `accounts.test.ts` (410 idêntico para expirado, revogado, usado e inexistente; só o hash SHA-256 no banco; 409 para e-mail com conta ou convite pendente). Passou.
  - **P3** isolamento: `app/tests/http/authorization.test.ts` (HTTP real: usuário do A recebe 401/403/404 em `/api/admin/*`, "Acesso negado" nas páginas, `?clientId=` do B ignorado, membro/convite do B na rota do A dão 404 sem alterar nada, STAFF não atribuído recebe 404) e `jornada.spec.ts` (A e B entram e não alcançam o outro, por URL e pela API). Passou.
  - **P4** reset, logout, revogação, bloqueio: `accounts.test.ts` (reset de uso único com token em hash e sessões antigas derrubadas; login errado com mesma mensagem; 429 com limite em banco; CSRF 403), `authorization.test.ts` (sessão revogada, conta bloqueada e participação revogada perdem acesso na requisição seguinte), `estados.spec.ts` (bloquear, encerrar sessões e desbloquear com modal de confirmação, vistos por outra sessão aberta; troca de senha). **Sem SMTP o link de redefinição não é enviado**: a UI mostra "indisponível" e a API responde 503 igual para qualquer e-mail; o reset por token foi provado emitindo o token pela mesma configuração do app dentro do teste.
  - **P5** layout e papéis: `estados.spec.ts` (vazio, erro, carregando, acesso negado, não encontrado; teclado; menu móvel; escolha e troca de cliente limpando o anterior; tema por usuário), `visual.spec.ts` (90 capturas em `specs/0001/evidencias/`, 360/768/1440 px, claro e escuro, sem rolagem horizontal) e `a11y.spec.ts` (axe WCAG A/AA, 0 violações em 12 execuções).
  - Critérios mensuráveis: criar dois clientes e convidar um usuário em cada em menos de 5 minutos (a jornada E2E inteira leva menos de 20 s); testes de isolamento 100% verdes; convite uma vez só e 7 dias; sessão revogada ou conta bloqueada perde acesso na requisição seguinte; lint, typecheck, testes e build pelo `quality/checks.json` (`python scripts/verificar.py --executar`).
  - **Não provado**: envio real de e-mail (SMTP não existe), 410 como código HTTP das páginas (com Cache Components a página responde 200 com a tela de erro; a API responde 410), `error.tsx` de segmento exercitado por falha real, zoom 200%, leitor de tela, 1024 px, Safari/Firefox, MFA (fase 5), deploy.
- Publicação e recuperação: fora desta entrega.
