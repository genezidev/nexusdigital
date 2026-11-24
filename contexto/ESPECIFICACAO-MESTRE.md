# NEXO DIGITAL — Especificação mestre de produto e desenvolvimento

**Versão:** 1.0 | **Idioma:** pt-BR | **Nome provisório:** Nexo Digital | **Primeiro cliente:** Cliente Modelo

## 1. Missão do agente de programação

Atue como arquiteto de software, engenheiro full-stack sênior, especialista em UX, segurança, PostgreSQL, testes e DevOps. Construa uma aplicação web real, multiempresa, para gestão estratégica de marketing digital, com administrativo e portal do cliente. Não entregue apenas telas estáticas. Cada ação deve persistir no banco, respeitar permissões e possuir tratamento de erros. O protótipo `portal_marketing.html`, quando anexado, é referência visual e não código de produção. Não copie sua troca de perfil simulada como mecanismo de autorização.

Antes de alterar código, inspecione o repositório, ambiente, dependências e arquivos existentes; apresente plano de implementação e riscos. Se o repositório estiver vazio, inicialize a arquitetura abaixo. Preserve trabalho existente. Não execute deploy, operações destrutivas, publicação social ou cobrança real sem autorização. Trabalhe em etapas, com commits pequenos, testes e documentação. Não declare uma funcionalidade concluída sem evidência de teste. Não invente integrações, dados de clientes ou resultados. Use dados sintéticos em desenvolvimento e nunca coloque credenciais ou documentos privados no Git.

## 2. Visão de produto

Portal privado de uma agência de gestão estratégica de marketing digital. Centraliza contratos, planos, calendário, produção, aprovação, roteiros, gravações, indicadores, melhorias, relatórios, reuniões e cobranças. O cliente entende o que foi entregue, o que depende dele e como os indicadores evoluem. A agência controla a operação de vários clientes em um único ambiente. Inicialmente não é um SaaS público, marketplace, ERP fiscal, banco, ferramenta de SAC ou plataforma de publicação automática. Não prometer vendas nem atribuir crescimento à agência sem evidências.

### Metas do produto

- Reduzir retrabalho e dispersão de arquivos no WhatsApp.
- Demonstrar cumprimento do escopo contratado e valor de entregas extras.
- Aumentar previsibilidade de aprovações, gravações e cobranças.
- Permitir comparação histórica de métricas com fonte e período.
- Preparar expansão para outros clientes sem reconstruir a aplicação.

## 3. Usuários, acesso e isolamento

| Papel | Acesso |
|---|---|
| ADMIN | Todos os clientes, configurações, usuários, financeiro, publicação de relatórios e auditoria |
| STAFF | Somente clientes atribuídos e permissões específicas de conteúdo, métricas ou financeiro; sem administração global por padrão |
| CLIENT_OWNER | Dados publicados da própria empresa, plano, financeiro, documentos, aprovação e gravações |
| CLIENT_COLLABORATOR | Dados da própria empresa e funções delegadas; financeiro e contratos restritos por padrão |

Não há cadastro público. Admin cria empresa e envia convite de uso único com validade; usuário define senha. Login por e-mail e senha, recuperação por token de uso único, logout, revogação de sessões e bloqueio de contas. Hash Argon2id ou bcrypt com parâmetros adequados; nunca senha em texto puro. Admin pode reenviar convite, não consultar senha. Usuários com mais de uma empresa selecionam contexto autorizado. Permissões verificadas no servidor a cada operação, inclusive arquivos, exportações, jobs e endpoints. Não confiar em `clientId` recebido do navegador. A troca de cliente deve limpar caches e impedir vazamento de dados. MFA para admin recomendado antes de produção.

## 4. Navegação e rotas

Público: `/login`, `/invite/[token]`, `/forgot-password`, `/reset-password`.

Admin: `/admin`, `/admin/clients`, `/admin/clients/[id]`, `/admin/plans`, `/admin/subscriptions`, `/admin/projects`, `/admin/calendar`, `/admin/contents`, `/admin/scripts`, `/admin/metrics`, `/admin/links`, `/admin/reports`, `/admin/contracts`, `/admin/finance`, `/admin/improvements`, `/admin/meetings`, `/admin/notifications`, `/admin/settings`, `/admin/audit`.

Portal: `/portal`, `/portal/plan`, `/portal/calendar`, `/portal/contents`, `/portal/approvals`, `/portal/scripts`, `/portal/results`, `/portal/links`, `/portal/improvements`, `/portal/reports`, `/portal/documents`, `/portal/finance`, `/portal/meetings`, `/portal/profile`, `/portal/notifications`.

Detalhes por ID nas rotas correspondentes. Menu responsivo, breadcrumbs, filtro de cliente (admin), filtro de competência, busca, paginação, estados vazios, loading, erro e acesso negado. No portal, mostrar apenas itens explicitamente compartilhados/publicados, nunca notas internas ou rascunhos.

## 5. Módulos funcionais — administrativo e cliente

| Módulo | Administrativo | Portal do cliente |
|---|---|---|
| Dashboard | Clientes ativos, receita recorrente contratada, recebimentos, vencidos, produção, aprovações, gravações, próximos 7 dias | Progresso do plano, próximos passos, métricas, últimas entregas, pendências e próxima cobrança |
| Clientes | CRUD, logo, contatos, canais, cobertura, briefing, voz da marca, restrições, status, convite e membros | Perfil da empresa, dados autorizados e contatos |
| Planos | Criar modelos de pacote, limites, preço, periodicidade, escopo e exclusões; versionar | Ver plano contratado, vigência, benefícios, entregas consumidas e restantes |
| Projetos/campanhas | Objetivo, cliente, responsáveis, período, tarefas e status | Ver projetos compartilhados e andamento |
| Calendário | Criar ciclos mensais, datas, pautas, filtros por formato, arrastar/reagendar com validação | Calendário mensal/lista com conteúdos compartilhados |
| Conteúdos | CRUD, versões, arquivos, legenda, CTA, canal, objetivo, data, status, link publicado, métricas | Prévia, legenda, aprovar ou solicitar revisão, consultar histórico e publicação |
| Roteiros | Criar roteiro por cenas, atribuir funcionário, prazo, referências, PDF, receber vídeos e registrar status | Ler instruções, baixar roteiro, enviar gravações, informar conclusão e consultar retorno |
| Indicadores | Cadastro manual, importação CSV/JSON, validação, comparação, fonte e evidência | Gráficos históricos, filtros, explicações e data de atualização |
| Links | Cadastrar central de links, botões, métricas disponíveis e origem | Ver visitas/cliques registrados e destinos |
| Melhorias | Registrar ação, categoria, data, benefício, evidências antes/depois e status | Histórico de melhorias e bônus efetivamente realizados |
| Relatórios | Upload PDF, elaboração, revisão, publicação, versões e exportação | Visualizar/baixar auditoria e relatórios mensais publicados |
| Contratos | Upload privado, vigência, situação, link de assinatura autorizado e versões | Visualizar/baixar documentos compartilhados |
| Financeiro | Cobranças, links de boleto, PDF, PIX, pagamentos parciais, baixa manual, recibos e filtros | Valor, vencimento, situação, histórico, acesso ao boleto e recibo |
| Reuniões | Agendar, pauta, ata, decisões, tarefas e links | Consultar reunião, pauta e decisões compartilhadas |
| Notificações | Central de pendências, configurar lembretes e preferências | Avisos de aprovação, roteiro, relatório, reunião e cobrança |
| Configurações | Marca, tema, permissões, integrações, logs e políticas | Perfil, senha, preferências de avisos |

### 5.1 Dashboard e experiência de valor

Admin: filtros por cliente, período e status; receita contratada separada de receita recebida; cobrança vencida; conteúdos atrasados; tarefas dependentes do cliente; fila de aprovações; gravações; relatórios pendentes. Cliente: saudação, período selecionado, data de atualização, plano vigente, progresso de entregas, métricas com comparação válida, ações necessárias, melhorias recentes, próxima reunião e vencimento. Exibir histórico cronológico de eventos compartilhados. Evitar gamificação enganosa: progresso não significa crescimento comercial.

### 5.2 Conteúdo e aprovação

Campos: título, descrição, cliente, ciclo, campanha, formato (arte, carrossel, Reel animado, Reel humanizado, Story, outro), canal, objetivo, pilar, legenda, CTA, hashtags opcionais, briefing, arquivos, data prevista, data de publicação, URL, responsável, status, visibilidade, contabiliza no plano, versão atual. Carrossel possui páginas ordenadas. Rascunhos internos não aparecem ao cliente.

Fluxo: PLANEJADO → EM_PRODUCAO → AGUARDANDO_APROVACAO → APROVADO → AGENDADO → PUBLICADO → ANALISADO. Solicitação de revisão retorna a EM_REVISAO; nova versão volta à aprovação. CANCELADO é terminal, com justificativa. Aprovação é vinculada à versão, autor e timestamp; editar material aprovado invalida aprovação. Publicação exige URL ou evidência e data; não publicar automaticamente. Status AGENDADO no MVP é registro manual, não confirmação da Meta. Atraso é calculado a partir do prazo, não substitui status. Revisões excedentes sinalizam necessidade de acordo, sem cobrança automática. Silêncio não aprova. Comentários internos separados dos compartilhados.

Progresso = publicações efetivamente publicadas/analisadas que contabilizam no plano ÷ quantidade contratada no ciclo. Exibir planejadas, produzidas, aprovadas e publicadas separadamente. Não contar Stories, bônus ou itens cancelados automaticamente; admin define classificação. Acima da meta, mostrar excedente separado. Ciclos encerrados preservam histórico e escopo vigente.

### 5.3 Roteiros e gravações

Roteiro vinculado opcionalmente a conteúdo. Campos: título, objetivo, duração, responsável, prazo, local, equipamento, formato vertical 9:16, instruções de áudio, luz, enquadramento, falas por cena, referências, checklist e arquivo PDF. Fluxo: RASCUNHO → ENVIADO → AGUARDANDO_GRAVACAO → GRAVACAO_RECEBIDA → EM_EDICAO → AGUARDANDO_APROVACAO → FINALIZADO → PUBLICADO. Permitir solicitação de regravação com justificativa. Cliente pode enviar arquivo e marcar gravação enviada; admin confirma recebimento. Upload grande via URL assinada/multipart com limite configurável, progresso, validação de tipo e tamanho. Permitir link externo autorizado como alternativa. Não editar vídeo automaticamente no MVP. Edição pode ocorrer externamente no Claude Code; anexar resultado final. Obter autorização de uso de imagem e evitar dados pessoais desnecessários.

### 5.4 Indicadores e central de links

Registrar conta/canal, métrica, unidade, início/fim do período, data da coleta, fonte, valor, método (manual/importação/API), observações, evidência e responsável. Seguidores são snapshot; visualizações, interações, visitas e cliques são valores de período. Alcance/contas únicas não devem ser somados entre períodos sobrepostos. Não confundir visualizadores com alcance se a fonte usa termos distintos. Dados ausentes = nulo, nunca zero inventado. Comparar períodos equivalentes e mesma definição/fonte; variação percentual = (atual − anterior)/anterior × 100, se anterior > 0; caso contrário mostrar N/D. Diferenciar orgânico e pago quando disponível. Taxas devem declarar denominador. Cliques não são leads nem vendas. Registrar leads e contratações somente com evidência e método de atribuição.

Importação CSV/JSON: prévia, mapeamento de colunas, validação de datas e números, deduplicação por chave de métrica/conta/período/fonte, relatório de erros, confirmação e transação. Não sobrescrever silenciosamente; registrar revisão. Exportar CSV por cliente/período. Central de links: visitas, cliques totais, cliques por botão, destino, origem e UTM quando disponíveis. Não presumir API do Abre.bio. Integrações oficiais Meta/Postiz ficam para fase posterior; tokens no servidor, escopos mínimos, revogação, expiração e limites. Não usar scraping não autorizado.

### 5.5 Financeiro

Valores em centavos inteiros BRL; datas de competência e vencimento como datas locais. Cobrança vinculada a cliente e assinatura, descrição, valor, competência, emissão, vencimento, link HTTPS externo, PDF privado, instrução PIX, observações compartilhadas e internas. Estados: RASCUNHO, ABERTA, PARCIAL, PAGA, CANCELADA; VENCIDA calculada se saldo > 0 e prazo expirado. Pagamentos com valor, data, método, comprovante, referência, autor. Baixa manual exige confirmação e registra log; pagamento parcial mantém saldo. Estorno/correção por evento auditável, não apagar histórico. Evitar duplicidade e concorrência com transação e idempotência. Não gerar boleto bancário nem processar cartão; apenas cadastrar link/documento emitido externamente. Recibo anexado ou gerado como comprovante interno, sem afirmar validade fiscal. Cobrança recorrente opcional com prévia e confirmação; exceções contratuais não podem ser sobrescritas. Receita recebida = soma de pagamentos válidos no período; receita recorrente contratada = soma de mensalidades ativas; não misturar.

### 5.6 Relatórios, documentos e melhorias

Relatório: tipo AUDITORIA_INICIAL/MENSAL/OUTRO, cliente, período, versão, título, resumo, PDF, data de publicação, visibilidade. Relatório mensal: resumo executivo, entregas planejadas x realizadas, indicadores com fonte e comparação, destaques, oportunidades rastreadas, melhorias, limitações, aprendizados, próximos passos. Gerador automático posterior; no MVP upload PDF e edição de resumo. Relatório publicado é snapshot imutável; correção cria versão. Contrato: vigência, situação (rascunho/enviado/assinado/encerrado), documento privado e link de assinatura opcional; não afirmar assinatura sem evidência. Melhorias: categoria CONTRATADO/BONUS/ADICIONAL, título, descrição, benefício esperado ou observado (distinguir), data, status, evidências, visibilidade; extras não consomem cota de conteúdo por padrão. Reuniões: data/hora, fuso, participantes, pauta, link, ata, decisões, responsáveis e prazos. Notificações in-app com lida/não lida; e-mail opcional por SMTP, sem disparos duplicados.

## 6. Design system

Marca Nexo provisória e configurável. Interface limpa, corporativa, tecnológica; não usar verde da Cliente Modelo como marca global. Logo e cor de destaque opcionais por cliente, mantendo contraste. Referência `portal_marketing.html`.

| Token | Claro | Escuro sugerido |
|---|---|---|
| Sidebar | #101B30 | #101B30 |
| Primário | #315DE0 | #83A4FF |
| Fundo | #F4F6FA | #0B1220 |
| Superfície | #FFFFFF | #17243A |
| Texto | #18243A | #F1F5F9 |
| Texto secundário | #64748B | #A8B5C8 |
| Borda | #E2E7EF | #334155 |
| Sucesso | #16A34A | #4ADE80 |
| Atenção | #D97706 | #FBBF24 |
| Erro | #DC2626 | #F87171 |

Inter com fallback system-ui; títulos 24–32px, corpo 14–16px, legenda 12–13px; escala de espaçamento 4/8/12/16/24/32; raio 8–16px; sidebar desktop 240px, mobile drawer, header com contexto e período. Cards de KPI, gráficos acessíveis com alternativa tabular, tabelas responsivas, filtros, modal de confirmação, toast, skeleton, badges de status com texto, formulário com erros inline, calendário e timeline. WCAG AA, foco visível, teclado, contraste, não depender apenas de cor. Testar 360px, 768px e 1440px. Formatar moeda pt-BR e datas DD/MM/AAAA; fuso padrão America/Maceio configurável. Tema claro/escuro persistido por usuário. Sem links ou botões decorativos sem função.

## 7. Arquitetura técnica proposta

Monólito modular Next.js App Router + TypeScript estrito + React + Tailwind + shadcn/ui; PostgreSQL + Prisma; Auth.js com estratégia de credenciais e sessões compatível com a versão escolhida (validar revogação e recuperação); Zod + React Hook Form; Recharts; storage privado S3 compatível; SMTP; PDF via Playwright/Puppeteer quando necessário; Vitest e Playwright; Docker Compose; Caddy ou Nginx com HTTPS. Escolher versões estáveis compatíveis, fixar lockfile. Não misturar Supabase/Auth.js ou múltiplos ORMs sem justificativa. Verificar capacidade da VPS antes de escolher storage local, serviço S3 ou MinIO e serviços auxiliares. Sem microserviços no MVP.

```text
src/
  app/(auth)/
  app/(admin)/admin/
  app/(portal)/portal/
  app/api/
  components/ui/
  components/layout/
  features/{clients,plans,contents,scripts,metrics,finance,reports,meetings,improvements}/
  server/{auth,authorization,db,services,repositories,storage,notifications,audit}/
  lib/{validation,formatting,dates}/
prisma/{schema.prisma,migrations,seed.ts}
public/                 # somente arquivos públicos
 tests/{unit,integration,e2e}/
 docs/
 Dockerfile
 compose.yaml
 .env.example
 AGENTS.md
 README.md
```

Camadas: UI → actions/handlers validados → serviços de domínio → repositórios com escopo de tenant → banco/storage. Nunca importar secrets em componentes client. API REST ou server actions consistentes; validar entrada e saída; erros 400/401/403/404/409/422/429/500 adequados, sem stack trace ao cliente. Paginação, filtros e ordenação no servidor. Logs estruturados sem dados sensíveis. Jobs simples para lembretes e relatórios com idempotência; não depender de processo em memória para tarefas críticas.

## 8. Modelo de dados relacional

UUIDs, timestamps UTC, `client_id` obrigatório nas entidades de cliente, índices compostos por cliente e status/data, FKs e restrições únicas. Usar relações compostas ou validação transacional para impedir associação cruzada entre tenants. Soft delete/arquivamento onde necessário; financeiro e auditoria preservados. Campos abaixo são mínimos, não SQL final.

| Tabela | Campos principais |
|---|---|
| users | id, email unique, name, password_hash, status, global_role, last_login_at |
| clients | id, name, legal_name opcional, slug unique, logo_asset_id, contact, timezone, status, brand_settings |
| client_members | client_id, user_id, role, permissions, status; unique(client_id,user_id) |
| invitations / reset_tokens / sessions | user/client, token_hash, expires_at, used_at/revoked_at |
| service_plans | id, name, version, monthly_amount_cents, quota, scope, exclusions, active |
| subscriptions | client_id, plan_id, snapshot_scope, amount_cents, quota, starts_on, ends_on, billing_day, status |
| contracts | client_id, subscription_id, asset_id, version, signed_at, dates, status, visibility |
| projects / campaigns | client_id, title, objective, dates, owner_id, status, visibility |
| editorial_cycles | client_id, subscription_id, year, month, quota_snapshot, status; unique por assinatura/competência |
| contents | client_id, cycle_id, campaign_id, title, format, channel, objective, planned_at, published_at, url, status, counts_toward_quota, visibility |
| content_versions | client_id, content_id, version, caption, cta, brief, author_id, created_at |
| approvals | client_id, version_id, decision, comment, actor_id, created_at |
| comments | client_id, content_id, author_id, body, visibility |
| scripts / script_scenes | client_id, content_id, title, deadline, assignee, status, instructions; scenes com ordem e falas |
| recordings | client_id, script_id, asset_id/link, submitted_by, status, feedback |
| assets / asset_links | client_id, storage_key, mime, bytes, checksum, original_name, uploader, visibility; vínculos tipados e validados |
| social_accounts | client_id, platform, handle, external_id, status |
| metric_snapshots | client_id, account_id, metric_key, unit, period_start/end, collected_at, value, source, method, evidence, revision |
| link_pages / link_buttons / link_metrics | client_id, url, destination, metric_key, period, value, source |
| improvements | client_id, category, title, description, benefit, benefit_type, completed_at, status, visibility |
| invoices | client_id, subscription_id, competence, amount_cents, due_on, status, boleto_url, asset_id, idempotency_key |
| payments | client_id, invoice_id, amount_cents, paid_on, method, receipt_asset_id, actor_id, reversal_of |
| reports | client_id, period_start/end, type, version, asset_id, summary, published_at, status |
| meetings / action_items | client_id, starts_at, agenda, minutes, meeting_url, visibility; tarefas com responsável e prazo |
| notifications | client_id opcional, user_id, type, payload mínimo, read_at, dedupe_key |
| audit_logs | client_id opcional, actor_id, action, entity_type/id, timestamp, request_id, diff sanitizado |

Enums explícitos para status, formato, visibilidade e papel. Campos monetários inteiros, métricas decimais quando necessário. Evitar JSON para relações centrais; JSON somente para configurações flexíveis e snapshots versionados. Migrações versionadas; seed idempotente de demonstração separado de produção.

## 9. Segurança, privacidade e operação

- Autorização deny-by-default; testar IDOR/BOLA em leitura, edição, listagem, download e exportação. Staff sem atribuição não acessa cliente. Cliente não altera financeiro, métricas ou contrato.
- Storage privado: nomes aleatórios, URLs assinadas curtas após autorização, sem bucket público; validar MIME real, extensão, tamanho, bloquear executáveis e HTML ativo, quarentena/antivírus conforme capacidade. Não armazenar documentos em public/.
- Cookies HttpOnly, Secure e SameSite apropriado; CSRF em mutações conforme framework; rate limiting em login/reset/upload; proteção XSS e validação de URLs (somente HTTPS para links externos, sem fetch arbitrário/SSRF).
- Secrets em variáveis de ambiente, não em Git ou logs. Banco sem porta pública. HTTPS, headers de segurança, dependências atualizadas, backups criptografados e teste de restauração.
- LGPD: minimização, finalidade, controle de acesso, política de retenção, exportação e exclusão conforme obrigações contratuais/legais; não coletar CPF ou dados sensíveis sem necessidade. Consentimento/autorização para imagens e gravações. Registrar incidentes.
- Auditoria de convites, permissões, aprovações, publicação de relatórios, alterações financeiras e exclusões. Logs append-only para usuários comuns. Não registrar senhas, tokens ou documentos completos.

## 10. Primeiro cliente — configuração inicial Cliente Modelo

Usar cadastro autorizado em produção, nunca dados pessoais ou contrato real no seed público. Nome Cliente Modelo, Instagram @cliente.modelo, site https://cliente-modelo.example/, central https://link.example/cliente-modelo. Plano Essencial R$ 1.200/mês, 12 publicações Instagram, copy/legendas, calendário, reunião e relatório mensal, uma revisão por peça, agendamento/publicação pelo gestor. Aprovação em até dois dias úteis, sem aprovação tácita. Vigência prevista 10/11/2026 a 09/11/2027; vencimento dia 10. Primeira mensalidade dividida em R$ 600 em 10/11/2026 e R$ 600 em 10/12/2026; recorrência regular prevista a partir de 10/01/2027, confirmar com contrato definitivo antes de gerar cobranças. Não presumir pagamento ou assinatura. Vídeos/edição adicionais tratados separadamente; não alterar escopo contratual automaticamente. Restrições editoriais: não criar campanhas de Natal, Halloween, aniversários ou outras comemorações conforme acordo. Identidade verde/preto/branco e mascote robótico; anexar logo original no cadastro.

Distribuição inicial: 3 artes, 4 carrosséis, 3 vídeos animados e 2 humanizados. Planejamento não comprova execução. Importar calendário aprovado, conferir datas e status reais com gestor. Melhorias iniciais: auditoria, central de links, resposta automática (ativação a confirmar), organização visual e planejamento. Registrar evidência e status individual, sem marcar tudo concluído.

Linha de base coletada em 13/11/2026 (Insights, janela de 30 dias): 4.777 seguidores snapshot; 6.020 visualizações; 1.489 visualizadores únicos; 61 interações; 661 visitas ao perfil; 396 toques em links externos. Importar CSV original preservando período e definições; não apresentar como resultado posterior à contratação. Janela histórica inclui dias anteriores e posteriores ao início contratual. Não somar janelas sobrepostas. Relatório inicial e contrato devem ser anexados manualmente pelo gestor.

## 11. Roadmap e critérios de entrega

| Fase | Entrega | Critério de aceite |
|---|---|---|
| 0 | Inspeção, arquitetura, setup e documentação | Ambiente local reproduzível, lockfile, decisões registradas |
| 1 | Auth, tenants, layout, clientes e convites | Admin cria dois clientes; cada um entra e não acessa o outro |
| 2 | Planos, ciclos, conteúdos, versões, aprovação, roteiros e arquivos | Fluxo completo persistido, aprovação por versão, upload privado e progresso correto |
| 3 | Contratos, relatórios e financeiro | PDF privado, cobrança externa, baixa parcial/total e histórico auditável |
| 4 | Métricas, links, melhorias, reuniões, notificações | Importação validada, comparação correta, dashboard real e evidências compartilhadas |
| 5 | Hardening, testes, backups e implantação | Testes críticos passam, restauração testada, HTTPS, acesso piloto autorizado |
| 6 | Integrações futuras | Meta/Postiz, central de links própria, e-mails, relatórios PDF automáticos e conciliação opcional após validação |

Prioridade: fases 1–5 antes de automações. Não bloquear MVP por API externa. Referências arquiteturais opcionais: Marketing Agency OS, Fuorix, Postiz (avaliar licença, maturidade e dependências antes de incorporar); https://github.com/nextjs/saas-starter, https://github.com/shadcn-ui/ui, https://github.com/prisma/prisma, https://github.com/nextauthjs/next-auth, https://github.com/recharts/recharts, https://github.com/coollabsio/coolify. Não clonar ou incorporar automaticamente; não assumir compatibilidade ou licença sem revisão.

## 12. Plano de testes obrigatório

Unitários: cálculo de progresso, valores/saldo, vencimento, comparação de métricas, validação de CSV, transições de status, permissões. Integração: migrações, convite expirado, login/reset, CRUD com tenant, aprovação versionada, upload/download privado, importação duplicada, baixa concorrente, estorno, relatório publicado. E2E: admin cadastra A e B; cliente A tenta acessar IDs e arquivos de B por URL/API/exportação e é bloqueado; cliente aprova conteúdo e solicita revisão; admin registra publicação; cliente envia gravação; admin publica relatório; cliente abre boleto; admin registra pagamento parcial e total; cliente vê saldo atualizado; staff restrito não acessa financeiro; logout/revogação bloqueiam sessão. Testar estados vazios, erros, acessibilidade, mobile e tema escuro. Usar banco de teste separado e dados fictícios. Não executar testes destrutivos em produção.

## 13. Deploy na VPS

Primeiro levantar SO, CPU, RAM, disco, domínio/subdomínio, serviços existentes, portas, backups e volume de vídeos. Não assumir capacidade. Criar `.env.example` sem valores reais: DATABASE_URL, AUTH_SECRET, APP_URL, S3_ENDPOINT/BUCKET/ACCESS_KEY/SECRET_KEY, SMTP_HOST/PORT/USER/PASSWORD/FROM, timezone e limites de upload. Docker multi-stage, usuário não root, healthcheck, volumes persistentes, rede interna, proxy HTTPS, banco privado. Configurar DNS e certificado após autorização. Migrações em etapa controlada, backup antes de mudança, rollback documentado. Backup diário do banco e arquivos com retenção configurável e cópia externa; testar restauração. Monitorar espaço, erros, uptime e jobs. Documentar comandos de setup, dev, lint, typecheck, test, build, migrate, seed demo, deploy e restore. Não publicar credenciais nem expor painel de banco. Implantar staging antes de produção quando possível.

## 14. Definition of Done e instrução final ao Claude Code

Para cada etapa: listar arquivos alterados, migrações, comandos executados, resultados dos testes, limitações, pendências e instruções para validação manual. Atualizar README e documentação. Não deixar botões falsos, dados hardcoded em produção, rotas sem autorização, TODO crítico ou sucesso simulado. Se uma integração não estiver configurada, mostrar estado indisponível e alternativa manual. Não inventar métricas. Antes de finalizar, rodar lint, typecheck, testes e build. Solicitar aprovação antes de deploy real.

Comece agora pela fase 0: examine o diretório, leia esta especificação e o HTML de referência se disponível, verifique o ambiente e apresente um plano técnico curto, decisões de versão e estrutura inicial. Depois implemente fase por fase, começando pela autenticação e isolamento multiempresa. Crie `AGENTS.md` com as regras permanentes e mantenha `docs/PROGRESS.md` com o estado real do desenvolvimento. Não tente implementar tudo em uma única resposta. Priorize segurança, funcionalidade real, experiência do cliente e manutenção simples.
