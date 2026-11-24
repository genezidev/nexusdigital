# Catálogo de repositórios

Repositórios analisados para a base. Consulte por busca quando uma tarefa precisar de referência, ferramenta ou exemplo. Antes de instalar ou copiar algo, confira a licença, a revisão atual e a documentação oficial. A versão registrada aqui é a da análise: rode `python scripts/conferir_versoes.py <nome>` para comparar com a última release estável e leia as notas e os avisos de segurança de uma versão mais nova antes de usá-la.

Status: **incorporado** (os princípios já estão nos guias da base), **ferramenta** (instalar quando a tarefa pedir), **referência** (estudar sob demanda), **descartado** (analisado e não recomendado, com motivo), **avaliar** (ainda não analisado).

## SaaS e templates

### Open SaaS
- Link: https://github.com/wasp-lang/open-saas · Docs: https://docs.opensaas.sh (versão para IA: https://docs.opensaas.sh/llms.txt)
- Licença: MIT · Revisão analisada: `1793ce9` (2026-11-11)
- Stack: Wasp (React + Node.js + Prisma), PostgreSQL, shadcn/ui, Playwright, Astro (blog/docs)
- Status: **incorporado** em [playbook/saas/](../playbook/saas/README.md) e **referência** como template pronto para SaaS web
- O que trouxemos: pasta por funcionalidade, validação de ambiente na inicialização, permissões no servidor, interface de pagamento com adaptador por gateway, sincronização de assinatura buscando o estado no gateway, idempotência de webhook, reserva atômica de créditos, upload com URL assinada, painel admin com métricas diárias por tarefa agendada, consentimento de cookies opt-in, SEO com pré-renderização, JSON-LD e llms.txt, testes Playwright, checklist de personalização e de deploy, skills de "primeiros passos" e "tour guiado" que pausam para perguntas.
- Quando usar como template: SaaS web em React/Node com prazo curto e equipe confortável com Wasp. Sem gateway brasileiro nativo; Windows exige WSL.
- Cuidados: o link de download de arquivos não confere o dono; o CI de exemplo usa ações por tag, não por SHA.

### Relacionados ao Open SaaS
| Repositório | Para que serve | Status |
|---|---|---|
| https://github.com/wasp-lang/wasp | Framework full-stack usado pelo Open SaaS | referência |
| https://github.com/wasp-lang/wasp-agent-plugins | Skills de Wasp para agentes de IA | ferramenta (só em projetos Wasp) |
| https://github.com/t3dotgg/stripe-recommendations | Origem da regra "buscar o estado da assinatura no gateway a cada webhook" | referência |
| https://openvibe.sh | Currículo gratuito que usa um agente de IA como tutor para construir SaaS | referência didática para o curso |

### Full Stack FastAPI Template
- Link: https://github.com/fastapi/full-stack-fastapi-template
- Licença: MIT · Revisão analisada: `77e550a` (2026-11-16) · Mantido pela equipe do FastAPI, muito ativo
- Stack: FastAPI + SQLModel + PostgreSQL + Alembic (Python 3.14+), React + Vite + TanStack + shadcn/ui, Playwright, Docker Compose + Traefik (HTTPS automático), Mailpit, pytest
- Plataforma: web e API
- Status: **referência** como template do perfil Python/API, com princípios **incorporados** em [playbook/saas/contas-e-acesso.md](../playbook/saas/contas-e-acesso.md) e [playbook/perfis.md](../playbook/perfis.md).
- O que trouxemos: o app se recusa a subir fora do ambiente local com segredo de exemplo (`changethis`); hash de senha Argon2 com bcrypt como alternativa e atualização do hash no login; cliente do front-end gerado a partir do OpenAPI da API; Mailpit para testar e-mail local; GitHub Actions fixadas por SHA e verificadas pelo zizmor.
- Quando usar: API em Python com painel React, quando Python é importante pelo domínio (dados, IA, automação). Clique em "Use this template" e siga `development.md`.
- Cuidados: o front-end guarda o token de login em `localStorage` (troque por cookie `HttpOnly` antes de produção, ver [playbook/seguranca.md](../playbook/seguranca.md)); exige Python 3.14+; o deploy padrão é o FastAPI Cloud (pago), a alternativa é Docker Compose numa VPS.

### Bulletproof React
- Link: https://github.com/alan2207/bulletproof-react
- Licença: MIT · Revisão analisada: `9506629` (2026-05-14)
- Stack: três apps de exemplo (Vite, Next.js App Router e Pages Router), React 18, Next 14, Vite 5, TanStack Query, Zustand, Vitest, Playwright, MSW
- Plataforma: web (React). Os princípios de pastas valem para React Native.
- Para que serve: guia de arquitetura de front-end React, não é template. Mostra pastas por funcionalidade, camada de API, estado, testes, erros e segurança no cliente.
- Status: **referência** com princípios **incorporados** em [playbook/perfis.md](../playbook/perfis.md) ("Organização em módulos"): código num sentido só (compartilhado → funcionalidades → aplicação), funcionalidade não importa outra, cliente HTTP único, chamadas declaradas com o formato validado, barreiras de erro por área da tela, sem arquivos "barrel" (`index.ts` que reexporta tudo).
- Cuidados: versões antigas (React 18, Next 14, Vite 5) e sem atualização desde maio de 2026. Não copie configuração nem `package.json`; use os princípios com as versões atuais da stack.

## Método, especificação e trabalho com agentes

### Spec Kit (GitHub)
- Link: https://github.com/github/spec-kit · Docs: https://github.github.io/spec-kit/
- Licença: MIT · Revisão analisada: `a4d5712` (2026-11-20), release v1.4.3 · Muito ativo, mantido pelo GitHub
- Plataforma: todas (é um processo para o agente; a CLI `specify` roda em Windows, Mac e Linux)
- Para que serve: desenvolvimento guiado por spec: princípios do projeto ("constituição"), spec, esclarecimento, plano, tarefas, implementação e "convergência" (compara o código com a spec e lista o que falta). Tem extensões para correção de bugs e avaliação de ideias. Funciona com Claude Code, Codex e mais de 30 agentes.
- Status: **incorporado** (princípios) e **ferramenta** opcional. Trouxemos para [specs/0001/spec.md](../specs/0001/spec.md) e [playbook/fluxo.md](../playbook/fluxo.md): histórias por prioridade, cada uma testável sozinha (a P1 já é entrega útil); marcador `[PRECISA ESCLARECER]`; casos-limite; critérios de sucesso mensuráveis sem citar tecnologia; suposições; no máximo cinco perguntas, uma por vez, com o porquê e a opção recomendada; conferência final da spec contra o código sem reescrever a spec.
- Quando instalar: equipe que quer o processo completo com comandos prontos. Exige Python 3.11+ e `uv` (`uv tool install specify-cli`). Não instale junto com as skills `scaff-*` no mesmo projeto: os dois processos disputam a mesma etapa.
- Riscos: cria a pasta `.specify/` e muitos comandos; extensões e presets da comunidade não são auditados pelo GitHub.

### BMAD Method
- Link: https://github.com/bmad-code-org/BMAD-METHOD · Docs: https://docs.bmad-method.org
- Licença: MIT no código; "BMad" é marca registrada (não use o nome em produto nosso) · Revisão analisada: `e435a22` (2026-11-12), release estável v6.12.4 · v7 em alfa
- Plataforma: todas
- Para que serve: método ágil com agentes especializados (analista, PM, arquiteto, UX, dev, product owner), planejamento do tamanho da mudança, revisão de código em camadas e manutenção do `AGENTS.md`.
- Status: **referência** e princípios **incorporados** em [playbook/revisao.md](../playbook/revisao.md) e [playbook/fluxo.md](../playbook/fluxo.md): planejamento do tamanho da mudança (PRD só quando várias pessoas precisam aprovar); revisão em três passadas (casos não tratados, lacuna de teste que nomeia a regressão, promessas do plano conferidas por último porque o plano não é prova); o que entra e o que fica fora do `AGENTS.md`; preferir checagem automática a mais uma linha de instrução.
- Quando consultar: na Fase 3 (equipe de agentes), como exemplo de papéis e de passagem de contexto entre eles.
- Riscos: a v7 muda com frequência e quebra compatibilidade; exige Node e `uv`; a v6 instala a pasta `_bmad/` e scripts próprios.

### Superpowers
- Link: https://github.com/obra/superpowers
- Licença: MIT · Revisão analisada: `22f0b46` (2026-11-03), v7.0.2 · Muito ativo, plugin nos marketplaces oficiais do Claude Code e do Codex
- Plataforma: todas
- Para que serve: plugin com 15 skills que entram sozinhas: brainstorming antes de codar, plano detalhado, desenvolvimento com subagentes, TDD, depuração sistemática, verificação antes de concluir, revisão de código e worktrees.
- Status: **ferramenta** opcional e princípios **incorporados** em [playbook/revisao.md](../playbook/revisao.md): evidência antes de afirmar (tabela "afirmação × prova"), relatório de subagente não é prova, causa raiz antes da correção, três correções falhas param o trabalho para rever a abordagem.
- Como instalar: no Claude Code, `/plugin install superpowers@claude-plugins-official`; no Codex, pela tela de plugins.
- Riscos: um hook injeta instruções em toda sessão e as skills disparam sozinhas, o que pode conflitar com as skills `scaff-*` (use um processo por projeto). O recurso visual do brainstorming carrega um logo do site do autor que conta uso e versão; desligue com a variável `SUPERPOWERS_DISABLE_TELEMETRY=1`. TDD obrigatório pode ser pesado para quem está começando.

### Context Engineering Intro
- Link: https://github.com/coleam00/context-engineering-intro
- Licença: MIT · Revisão analisada: `a2d84b0` (2026-03-16)
- Plataforma: todas (exemplos em Python e Claude Code)
- Para que serve: material didático sobre engenharia de contexto: pedido inicial com funcionalidade, exemplos, documentação e armadilhas; "PRP" (pedido com todo o contexto e comandos de validação); estratégia WISC (escrever memória em arquivos, isolar pesquisa em subagentes, selecionar só o contexto necessário, comprimir sessões longas).
- Status: **referência** didática para o curso. Trouxemos a seção "Referências e armadilhas" da [spec](../specs/0001/spec.md).
- Riscos: sem atualização desde março de 2026; o `.claude/settings.local.json` do repositório libera `Bash(python:*)`, o que permite qualquer comando Python; não copie esse arquivo.

### AGENTS.md
- Link: https://github.com/agentsmd/agents.md · Site: https://agents.md
- Licença: MIT · Revisão analisada: `d001185` (2026-09-10) · Formato aberto criado pela OpenAI, com carta de governança (`Technical_Charter.pdf`) no repositório
- Plataforma: todas
- Para que serve: define o `AGENTS.md`, "README para agentes", lido por Codex, Cursor, Copilot, Gemini e outros. O Claude Code lê pelo `CLAUDE.md` com `@AGENTS.md`.
- Status: **incorporado**. A base já usa o formato; acrescentamos em [playbook/fluxo.md](../playbook/fluxo.md) o `AGENTS.md` por pasta em monorepo (o mais próximo do arquivo vence, o pedido no chat vence todos).

### Vibe Coding Toolkit
- Link: https://github.com/soumatheusgomes/vibe-coding-toolkit
- Licença: MIT · Revisão analisada: `7ef68dd` (2026-11-08) · Projeto novo (agosto de 2026), um autor, README em português
- Plataforma: web (bootstrap em Next.js); a configuração de máquina e de projeto existente vale para qualquer stack
- Para que serve: prompts e templates para preparar a máquina, iniciar projeto Next.js (Drizzle, Zod, Pino, Vitest) e configurar projetos existentes no Claude Code e no Codex. Objetivo parecido com o desta base.
- Status: **referência**. Trouxemos para o roteiro da Fase 9 os cenários de avaliação do agente: handoff falso dizendo que o bug foi corrigido, bloqueio parcial (integração sem acesso), pausa e retomada em outra sessão, reaplicar o setup sem duplicar nem apagar personalizações.
- Riscos: o uso recomendado é mandar o agente ler e executar um arquivo da branch `main` do GitHub, que pode mudar a qualquer momento (prefira uma revisão fixa). Lista grande de ferramentas de terceiros; avalie cada uma separadamente.

## Skills para agentes

### Vercel Agent Skills
- Link: https://github.com/vercel-labs/agent-skills
- Licença: **sem licença no repositório**. Algumas skills declaram MIT no cabeçalho (react-best-practices, composition-patterns, react-native-skills, react-view-transitions); as demais não declaram · Revisão analisada: `5a37a63` (2026-11-20)
- Plataforma: web (React/Next.js), mobile (React Native) e Vercel
- Para que serve: skills de desempenho React/Next.js (mais de 40 regras por impacto), revisão de interface web (mais de 100 regras de acessibilidade e UX), React Native, transições de tela, padrões de componentes, revisão de texto e deploy/otimização na Vercel.
- Status: **ferramenta**, instalar por projeto quando a stack for React/Next/React Native: `npx skills add vercel-labs/agent-skills` (escolha só as skills necessárias). Indicada em [playbook/design.md](../playbook/design.md) para revisão de interface.
- Riscos: não copie skills sem licença para dentro da base. A skill `vercel-cli-with-tokens` manda imprimir o token no terminal para conferir (o valor fica no histórico do agente); a `deploy-to-vercel` manda não testar a URL publicada, o que contraria [playbook/revisao.md](../playbook/revisao.md). Prefira as skills de revisão às de deploy.

### Marketplace oficial de plugins do Claude Code
- Link: https://github.com/anthropics/claude-plugins-official · Docs: https://code.claude.com/docs/en/plugins
- Licença: cada plugin tem a sua. Os 43 da Anthropic em `plugins/` são Apache-2.0, exceto o `claude-security` (proprietário, uso conforme os termos da Anthropic). Os de terceiros seguem a licença do autor · Revisão analisada: `73c8cf3` (2026-11-20)
- Plataforma: Claude Code (o Codex tem marketplace próprio)
- Para que serve: catálogo `claude-plugins-official`, já ativo no Claude Code, com 317 entradas: plugins da Anthropic, plugins de terceiros e skills. Instalação: `/plugin install <nome>@claude-plugins-official`. Novos plugins de terceiros agora são enviados pelo diretório do claude.ai, não por este repositório.
- Status: **referência** para escolher plugins. Úteis para quem está começando:
  - `typescript-lsp` e `pyright-lsp`: o agente passa a ver erros de tipo enquanto edita.
  - `frontend-design`: direção visual que evita a "cara de IA"; princípios incorporados em [playbook/design.md](../playbook/design.md).
  - `security-guidance`: avisa padrões perigosos ao editar e revisa o diff com um modelo ao fim de cada turno e a cada commit.
  - `feature-dev`, `code-review` e `pr-review-toolkit`: fluxo de funcionalidade e revisão com agentes. Não use junto com as skills `scaff-*` na mesma etapa.
  - `claude-md-management`: mantém o `CLAUDE.md` atualizado.
  - `learning-output-style` e `explanatory-output-style`: o agente explica as escolhas e pede que o aluno escreva trechos-chave. Bom para o curso, mas gasta mais tokens.
  - `playwright` e `context7`: os mesmos servidores analisados acima.
- Riscos: a própria Anthropic avisa que não controla nem verifica o que os plugins de terceiros incluem; confira o autor e o código antes de instalar. O `security-guidance` faz chamadas extras ao modelo mais caro a cada turno e commit, consumindo a cota do plano (defina `SECURITY_REVIEW_MODEL` para um modelo mais barato). O plugin `telegram` é uma ponte para conversar com o Claude Code pelo Telegram, não envia notificações do app do aluno. Plugins que injetam instruções no início de cada sessão aumentam o custo de todas as conversas.

## Design e interface

### DESIGN.md (Google Labs)
- Link: https://github.com/google-labs-code/design.md · Especificação: https://github.com/google-labs-code/design.md/blob/main/docs/spec.md
- Licença: Apache-2.0 · Revisão analisada: `db977b3` (2026-11-17), CLI `@google/design.md` 0.4.x (alfa)
- Plataforma: todas (o arquivo descreve a identidade visual; a exportação gera tema Tailwind e tokens W3C para mobile e desktop)
- Para que serve: formato aberto para descrever a identidade visual para agentes: valores em YAML (cores, tipografia, cantos, espaços, movimento, componentes com referências como `{colors.primary}`) e o porquê em texto, em seções com ordem fixa. A CLI confere o arquivo (11 regras: referência quebrada, contraste WCAG, ordem das seções…), compara versões e exporta.
- Status: **incorporado**. [design/DESIGN.md](../design/DESIGN.md) virou um modelo nesse formato, com valores de exemplo que passam no contraste AA, e [playbook/design.md](../playbook/design.md) explica os comandos.
- Cuidados: versão alfa, o formato ainda pode mudar. No Windows, `npx @google/design.md` trava por causa do `.md` no nome (confirmado em teste); use `npx -p @google/design.md designmd lint DESIGN.md`. O modelo da base passou no linter 0.4.0 sem erros nem avisos, e a exportação `css-tailwind` funcionou. Os títulos das seções precisam ficar em inglês para a ferramenta reconhecer.

### shadcn/ui
- Link: https://github.com/shadcn-ui/ui · Docs: https://ui.shadcn.com/docs
- Licença: MIT · Revisão analisada: `bfa64ff` (2026-11-21), CLI `shadcn` 4.23.0 · Muito ativo (mais de 128 mil estrelas)
- Plataforma: web com React (Next.js, Vite, React Router, Astro, TanStack Start) e desktop com interface web (Tauri, Electron). Não serve para React Native nem Flutter.
- Para que serve: componentes acessíveis cujo código é copiado para dentro do projeto pela CLI (`npx shadcn@latest add button`), sobre Radix ou Base UI e Tailwind. Tem MCP, registros de terceiros e uma skill oficial (`npx skills add shadcn/ui`).
- Status: **ferramenta** (padrão sugerido para interface web React) com princípios **incorporados** em [playbook/design.md](../playbook/design.md): usar o componente pronto antes de criar, cores por função e não por código, inspecionar componente de registro de terceiros com `--view` ou `--dry-run` antes de instalar.
- Riscos: a skill oficial roda `npx shadcn@latest info` ao carregar e pré-autoriza comandos `npx shadcn@latest`, que sempre baixam a versão mais nova. Registros de terceiros são código de qualquer origem. Como o código fica no projeto, atualizações do shadcn não chegam sozinhas.

### React Bits
- Link: https://github.com/DavidHDev/react-bits · Site: https://reactbits.dev
- Licença: **MIT + Commons Clause** (não é código aberto no sentido estrito) · Revisão analisada: `701a8ac` (2026-11-20)
- Plataforma: web com React (mais de 215 componentes e fundos animados, em JS ou TS, com CSS ou Tailwind)
- Para que serve: textos animados, fundos, efeitos de cursor, galerias e microinterações, instalados pela CLI do shadcn (`npx shadcn@latest add @react-bits/SplitText-TS-TW`) ou pelo jsrepo. 206 dos 219 componentes conferidos tratam a preferência de movimento reduzido.
- Status: **ferramenta**, só dentro do app do aluno, com cuidado de licença registrado em [playbook/design.md](../playbook/design.md). A base citava React Bits sem esse alerta; corrigido.
- Riscos: a licença permite usar os componentes num app, site ou produto, inclusive pago, mas proíbe vender, sublicenciar ou redistribuir os componentes em si, sozinhos, em pacote ou adaptados. Por isso nunca entram nesta base, em templates ou no material do curso. Componentes com WebGL e animação pesada custam desempenho e bateria; o README direciona para a versão paga (Pro).

### UI UX Pro Max
- Link: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill · Site: https://uupm.cc
- Licença: MIT · Revisão analisada: `6ec2bb5` (2026-11-22), v2.15.0 · Muito popular (mais de 150 mil estrelas), atualização frequente
- Plataforma: web, mobile e desktop (dados para 22 stacks, de React e Next a Flutter, SwiftUI e React Native)
- Para que serve: skill com base de dados local (CSV) e busca em Python sem dependências: 80 estilos, 194 paletas por tipo de produto, 74 pares de fontes, 141 regras de UX com fontes citadas, gráficos e uma lista de verificação antes da entrega. Gera um design system por tipo de produto e exporta tokens.
- Status: **ferramenta** opcional para a etapa de design, com a lista de verificação **incorporada** em [playbook/design.md](../playbook/design.md) (contraste, foco, toque 44px, rótulos, movimento reduzido, larguras testadas, ícone SVG em vez de emoji).
- Como instalar: no Claude Code, `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` e `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`; no Codex e outros, `npm install -g ui-ux-pro-max-cli` e `uipro init --ai codex`.
- Riscos: o plugin traz outras skills (design, logo, banner, slides) que enviam pedidos a APIs pagas de terceiros (Gemini, MuAPI, UberLLM, Atlas Cloud) com chave do usuário; a skill principal funciona sem internet. As sugestões de paleta e estilo são ponto de partida, não substituem o `DESIGN.md` do projeto.

## Testes e navegador

### Playwright
- Link: https://github.com/microsoft/playwright · Docs: https://playwright.dev
- Licença: Apache-2.0 · Revisão analisada: `0492267` (2026-11-20), release v1.65.1 · Microsoft, muito ativo
- Plataforma: web (Chromium, Firefox e WebKit, com emulação de celular). Suporte experimental a Electron e Android; não testa app nativo de iOS ou Android.
- Para que serve: testes de ponta a ponta (Playwright Test), automação de navegador, CLI para agentes (`@playwright/cli`, mais econômica que o MCP), extensão do VS Code e três agentes de teste (planner, generator, healer).
- Status: **ferramenta** padrão para testes web, com regras **incorporadas** em [playbook/revisao.md](../playbook/revisao.md): localizar elementos como o usuário vê, sem espera fixa, sessão salva em `playwright/.auth/` fora do Git (já no `.gitignore` da base), trace na primeira repetição, revisar o diff do "healer".
- Riscos: o arquivo de sessão salva guarda cookies de login. O agente "healer" pode alterar a asserção ou pular o teste quando acha que a funcionalidade está quebrada, escondendo uma falha real. Os navegadores são baixados à parte (`npx playwright install`) e ocupam bastante disco.

### Playwright MCP
- Link: https://github.com/microsoft/playwright-mcp
- Licença: Apache-2.0 · Revisão analisada: `2337aff` (2026-11-18), v0.0.86 · Microsoft
- Plataforma: web
- Para que serve: servidor MCP que deixa o agente navegar, clicar, preencher e tirar capturas usando a árvore de acessibilidade da página (sem visão computacional). A própria Microsoft recomenda a CLI do Playwright para agentes de código, por gastar menos contexto; o MCP serve para exploração longa.
- Status: **ferramenta** para o agente conferir telas e fluxos, com regras em [playbook/design.md](../playbook/design.md).
- Como instalar: `npx @playwright/mcp@latest` no cliente MCP, ou o plugin `playwright` do marketplace oficial do Claude Code.
- Riscos: a documentação avisa que o MCP **não é barreira de segurança**. Por padrão usa um perfil persistente; prefira `--isolated`. O modo extensão conecta ao navegador pessoal com as contas logadas: não use. A opção `--allowed-origins` não protege de verdade. Em Docker, não publique a porta com `--host 0.0.0.0` em servidor acessível. Capturas e arquivos vão para `.playwright-mcp/` (no `.gitignore` da base).

## Documentação para agentes

### Context7
- Link: https://github.com/upstash/context7 · Site: https://context7.com
- Licença: MIT (só o servidor MCP e a CLI; o backend, o rastreador e o processamento são privados da Upstash) · Revisão analisada: `b1e3611` (2026-11-20)
- Plataforma: todas
- Para que serve: busca documentação atual e por versão de bibliotecas e entrega ao agente, por CLI com skill (`ctx7`) ou MCP. Evita API inventada ou desatualizada.
- Status: **ferramenta** opcional, com a ordem de consulta **incorporada** em [playbook/fluxo.md](../playbook/fluxo.md): primeiro a documentação da versão instalada, depois a oficial, por último o Context7.
- Como instalar: `npx ctx7 setup` (exige Node 22.13+, faz login por OAuth e cria uma chave gratuita) ou o plugin `context7` do marketplace oficial do Claude Code.
- Riscos: as perguntas vão para um serviço externo; nunca inclua segredo, dado pessoal ou código privado. A documentação indexada é enviada pela comunidade e a Upstash não garante exatidão nem segurança: confira na fonte oficial antes de usar em segurança, pagamento ou dados. A skill manda usar sempre, inclusive para o que o agente já sabe, o que gasta cota (sem chave, os limites de uso são menores). Os comandos usam `ctx7@latest`, sem versão fixa.

## Decisões e arquitetura

### MADR (Markdown Architectural Decision Records)
- Link: https://github.com/adr/madr · Docs: https://adr.github.io/madr/
- Licença: MIT ou CC0-1.0 (à escolha) · Revisão analisada: `ba75bb1` (2026-08-28), release 4.0.0
- Plataforma: todas (é um formato de documento, não código)
- Para que serve: modelo em Markdown para registrar uma decisão de arquitetura: contexto, opções, escolha, consequências e como conferir.
- Status: **incorporado** em [contexto/DECISOES.md](../contexto/DECISOES.md) (modelo em português, seção "Como conferir").
- Quando consultar: para ver os modelos completo, mínimo e vazio, ou exemplos reais de decisões.
- Riscos: nenhum relevante. Projeto estável, atualização esporádica.

### Architecture Decision Record (coletânea de Joel Parker Henderson)
- Link: https://github.com/architecture-decision-record/architecture-decision-record · Site: https://architecture-decision-record.github.io/
- Licença: CC-BY-NC-SA-4.0 ou OGL-UK-3.0, à escolha (os modelos de terceiros têm licenças próprias) · Revisão analisada: `2f3d996` (2026-11-21)
- Plataforma: todas
- Para que serve: guia sobre quando e como escrever decisões, mais de dez modelos (Nygard, MADR, Tyree-Akerman, arc42 e outros), exemplos (banco, segredos, monorepo, CSS), duas skills de Claude Code e lista de ferramentas.
- Status: **incorporado** (princípios, reescritos com nossas palavras) e **referência**. Trouxemos: uma decisão por registro, data em tudo que muda, não apagar e sim substituir, decisão conferida por checagem automática ("fitness function"), não registrar decisões pequenas ou temporárias.
- Quando consultar: para ver um exemplo de decisão parecida com a sua (pasta `locales/en-001/examples/`) ou escolher outro modelo.
- Riscos: não copie o texto nem as skills para o material do curso. A opção CC-BY-NC-SA proíbe uso comercial; a OGL-UK permite com atribuição, mas os modelos de terceiros têm licença própria. Inclui links para ferramentas pequenas de terceiros; avalie cada uma antes de usar.

### dependency-cruiser
- Link: https://github.com/sverweij/dependency-cruiser · Docs: https://github.com/sverweij/dependency-cruiser/tree/main/doc
- Licença: MIT · Revisão analisada: `65ae57f` (2026-11-22), versão 18.9.0
- Plataforma: projetos JavaScript/TypeScript (web, Node/API, Electron, React Native/Expo). Não serve para Python, Dart, C# ou Swift.
- Para que serve: lê os imports do projeto, desenha o grafo de dependências e falha quando uma regra é quebrada: importação circular, pacote ausente no `package.json`, arquivo órfão, produção usando dependência de desenvolvimento, camada importando o que não deve.
- Status: **ferramenta** (instalar como dependência de desenvolvimento quando o projeto JS/TS tiver módulos para proteger). Princípio **incorporado** em [playbook/fluxo.md](../playbook/fluxo.md): decisões de estrutura viram checagem automática.
- Como usar: `npm install --save-dev dependency-cruiser`, depois `npx depcruise --init` para gerar `.dependency-cruiser.js` com regras padrão, e `npx depcruise src` no `quality/checks.json` e no CI. Em projeto que já existe, `npx depcruise-baseline src` registra as violações atuais para barrar só as novas. O gráfico em SVG precisa do Graphviz instalado.
- Riscos: exige Node 22, 24 ou 26+; mantido por uma pessoa (muito ativo, versões frequentes). Regras de camada precisam ser ajustadas à estrutura de pastas do projeto.

## Segurança e segredos

### OWASP ASVS
- Link: https://github.com/OWASP/ASVS · Versão estável: 5.0.0 (maio de 2025), PDF, Word e CSV na pasta `5.0/`
- Licença: CC BY-SA 4.0 · Revisão analisada: `6e40a85` (2026-11-22), versão estável 5.0.0 · Projeto OWASP ativo desde 2014; próxima versão 5.0.1 (o GitHub também mostra uma release "Bleeding Edge" com a tag `latest`, que não é estável)
- Plataforma: web e APIs (inclui o backend de apps mobile e desktop). Para o app mobile em si, o equivalente é o OWASP MASVS.
- Para que serve: padrão com 345 requisitos de segurança verificáveis em 17 capítulos e três níveis (L1: 70, L2: 183, L3: 92).
- Status: **incorporado** em [playbook/seguranca.md](../playbook/seguranca.md), checklist em português do nível 1 com o código de cada requisito. Por exigência da licença, esse arquivo é distribuído sob CC BY-SA 4.0, com atribuição.
- Correções que ele trouxe à base: a regra "senha forte" virou o critério do ASVS (8+ caracteres, sem exigir símbolos, recusar senhas comuns); sessão em cookie, não em `localStorage`; o segredo na URL de webhook (Greenn, Pagar.me, Efí) passou a ter compensações documentadas.
- Quando consultar: nível 2 para sistemas com pagamento, dados pessoais em volume ou multiempresa; capítulo V10 para login social e OAuth. A tradução em português existe só para a 4.0.3 (desatualizada).

### SOPS
- Link: https://github.com/getsops/sops · Docs: https://getsops.io/docs/
- Licença: MPL-2.0 · Revisão analisada: `9aa10f1` (2026-11-09), versão 3.13.3 · Projeto CNCF (sandbox)
- Plataforma: todas (é ferramenta de linha de comando; binários para Windows, Mac e Linux)
- Para que serve: cifra os valores de arquivos `.env`, YAML, JSON e INI, mantendo as chaves legíveis. O arquivo cifrado pode ir para o Git; só quem tem a chave lê os valores. Funciona com age (recomendado, chave local simples), PGP e cofres de nuvem (AWS, Google, Azure, Vault).
- Status: **ferramenta**. Regra de uso **incorporada** em [playbook/vps.md](../playbook/vps.md) ("Segredos no servidor").
- Quando usar: segredos que precisam ser versionados ou compartilhados entre máquinas sem um painel de variáveis (VPS própria, várias pessoas, GitOps). Não é necessário quando a plataforma (Vercel, Coolify, GitHub Actions) já guarda as variáveis.
- Riscos: perder a chave privada do age significa perder os segredos; guarde uma cópia fora do computador. Cifrar de novo não revoga uma chave que já vazou. Acrescenta um passo na publicação, então não é padrão para iniciante. Baixe só das releases oficiais do GitHub e confira o checksum.

## Auditoria e varredura de segurança

Regras de uso incorporadas em [playbook/varreduras.md](../playbook/varreduras.md) e o modelo em [contexto/MODELO-DE-SEGURANCA.md](../contexto/MODELO-DE-SEGURANCA.md). Ferramenta determinística primeiro, revisão do agente depois.

### Gitleaks
- Link: https://github.com/gitleaks/gitleaks
- Licença: MIT · Revisão analisada: `5f6ec56` (2026-10-23), release v8.30.1 (2026-03-21) · Mais de 31 mil estrelas
- Plataforma: todas (binário único para Windows, Mac e Linux; Docker; hook de pre-commit)
- Para que serve: procura segredos (chaves de API, tokens, senhas) no histórico do Git (`gitleaks git`) ou em pastas (`gitleaks dir`), com `--redact` para não mostrar os valores e `.gitleaksignore` para falsos positivos.
- Status: **ferramenta** padrão para segredos, com regras **incorporadas** em [playbook/varreduras.md](../playbook/varreduras.md): varrer o histórico inteiro, revogar a chave no fornecedor antes de limpar o histórico, trocar todas de uma vez, repositório novo antes de tornar público.
- Riscos: o autor declarou o projeto **concluído**: só receberá correções de segurança, e o trabalho novo foi para o Betterleaks (abaixo). Continua útil e estável, mas sem regras novas para fornecedores novos. A ação oficial `gitleaks-action` tem licença própria e exige chave (gratuita, por cadastro com nome, e-mail e empresa) em repositórios de organização; em CI, prefira rodar o binário de versão fixa.
- Testado no Windows em 2026-11-22 (8.30.1, `winget` e zip oficial com hash conferido): `dir` não acha segredo que só existe no histórico, `git` acha; sem `--redact` o relatório JSON guarda a chave inteira; `.gitleaksignore` com o `Fingerprint` suprime o achado; código de saída 1/0 serve para CI. Na base mestre, nenhum achado.

### Trivy
- Link: https://github.com/aquasecurity/trivy · Docs: https://trivy.dev
- Licença: Apache-2.0 · Revisão analisada: `edf9f5c` (2026-11-20), release v0.76.2 (2026-11-05) · Aqua Security, muito ativo (quase 40 mil estrelas)
- Plataforma: todas (binário para Windows, Mac e Linux; Docker). Analisa projetos de qualquer stack pelos arquivos de trava, imagens Docker, Kubernetes e Terraform.
- Para que serve: um comando para dependências com falha conhecida, configuração insegura (Dockerfile, IaC), segredos e licenças; também gera SBOM.
- Status: **ferramenta** padrão para dependências, configuração e imagens, com uso **incorporado** em [playbook/varreduras.md](../playbook/varreduras.md).
- Riscos: **em 19 e 22 de março de 2026, credenciais roubadas foram usadas para publicar versões com malware** (binário v0.69.4 e imagens v0.69.5 e v0.69.6 no Docker Hub) e para redirecionar 76 das 77 tags da `trivy-action` e todas as da `setup-trivy` (aviso oficial GHSA-69fq-xp46-6x23). Causa: a troca de credenciais depois de um primeiro incidente não foi feita de uma vez. Lições levadas para a base: fixar ações por SHA, usar versão fixa e conferir assinatura, trocar todas as chaves juntas. Também envia dados de uso anônimos e consulta atualizações por padrão (`--disable-telemetry --skip-version-check`). Avisos recentes de travessia de caminho no gerenciador de plugins e na base de vulnerabilidades: mantenha atualizado.
- Testado no Windows em 2026-11-22 (0.76.2, zip oficial com hash conferido; o pacote `winget` usa o mesmo arquivo): achou 26 falhas altas ou críticas em `requirements.txt` antigo e 3 problemas no Dockerfile (root, `apt-get` sem `--no-install-recommends`, sem `HEALTHCHECK`). Primeira execução 2min19s, cache de 1,7 GB; seguintes, 3 s. A assinatura sigstore não foi conferida (exige o `cosign`). Na base mestre, nenhum achado.

### Semgrep (Community Edition)
- Link: https://github.com/semgrep/semgrep · Docs: https://semgrep.dev/docs
- Licença: LGPL-2.1 no motor. **As regras do registro (`p/default` etc.) usam a "Semgrep Rules License v1.0", que não é de código aberto** (repositório `semgrep/semgrep-rules`) · Revisão analisada: `c4dbe9e` (2026-11-20), release v1.186.0 (2026-11-18)
- Plataforma: todas para o código analisado (mais de 30 linguagens). A CLI instala por `uv tool install semgrep` ou `pipx install semgrep`; desde a v1.183.0 não há binário para Mac Intel (use Docker). Windows aparece no changelog com correções recentes, mas não foi testado nesta análise.
- Para que serve: análise estática com regras que parecem o próprio código; serve para achar padrões perigosos e para transformar uma regra do projeto em checagem ("toda consulta filtra pela empresa"). Tem servidor MCP (`semgrep mcp`) e plugin no marketplace oficial do Claude Code.
- Status: **ferramenta** para código, com uso **incorporado** em [playbook/varreduras.md](../playbook/varreduras.md).
- Riscos: com regras do registro, envia métricas ao semgrep.dev (use `--metrics=off --disable-version-check`). Não copie regras do registro para a base, templates ou curso. O README empurra login e produtos pagos (regras Pro, Supply Chain, Assistant), desnecessários para começar. A versão Community tem mais falsos positivos: trate cada achado como hipótese.
- Testado no Windows em 2026-11-22 (1.186.0 por `pip` num ambiente virtual; roda sem ajuste de codificação): com `p/default`, achou `eval` com dado do usuário, SQL montado com texto e Dockerfile sem usuário; não achou MD5 em senha nem segredo com valor padrão. Cerca de 20 s. Mesmo com `--metrics=off`, consultou os servidores do Semgrep para checar versão (use também `--disable-version-check`) e gravou um `anonymous_user_id` em `~/.semgrep/settings.yml`. O tráfego de rede não foi capturado. Na base mestre, nenhum achado.

### MobSF (Mobile Security Framework)
- Link: https://github.com/MobSF/Mobile-Security-Framework-MobSF · Docs: https://mobsf.github.io/docs
- Licença: GPL-3.0 · Revisão analisada: `fa87c37` (2026-11-17), release v4.6.9 (2026-11-18) · Mantido desde 2015, mais de 22 mil estrelas
- Plataforma: mobile (APK, AAB, IPA, apps React Native, Expo, Cordova, Capacitor) e pacotes Windows (APPX, MSIX). Roda via Docker ou Python 3.12+.
- Para que serve: análise estática (e dinâmica, com emulador) do app gerado: permissões, armazenamento inseguro, tráfego sem TLS, segredos no pacote, bibliotecas de rastreamento. O `mobsfscan` (LGPL-3.0, v1.2.0) faz a versão leve no código-fonte para CI, sem ler Dart.
- Status: **ferramenta** para conferir o app mobile antes da loja, com uso **incorporado** em [playbook/varreduras.md](../playbook/varreduras.md).
- Riscos: senha padrão `mobsf`/`mobsf` e porta 8000: rode só em `127.0.0.1`. Integração opcional com VirusTotal envia o app para fora (desligada por padrão; mantenha). O site público de demonstração recebe o arquivo enviado: não use com app privado. Atualiza bases de dados pela internet. GPL: nunca copie código para a base.
- Testes em 2026-11-22: o MobSF completo **não foi testado** (a máquina não tem Docker). O `mobsfscan` 1.2.0 instala no Windows, mas o `libsast` 3.2.0 desliga as regras de Java, Kotlin e Swift quando detecta Windows, sem aviso: no teste, deixou passar WebView com `addJavascriptInterface` e `MODE_WORLD_READABLE`. Rodar o Semgrep com a pasta de regras do mobsfscan achou as duas (comando em [playbook/varreduras.md](../playbook/varreduras.md)). O `mobsfscan` também trava o Semgrep na 1.172.0: instale em ambiente virtual separado.

### security-audit (Cloudflare)
- Link: https://github.com/cloudflare/security-audit-skill
- Licença: MIT · Revisão analisada: `c1c8a8c` (2026-09-14), sem releases · Repositório da organização oficial da Cloudflare, 3 contribuidores, número de estrelas muito alto para a idade (criado em junho de 2026)
- Plataforma: todas (é uma skill; os validadores usam Node.js sem dependências)
- Para que serve: auditoria de segurança em seis fases com subagentes: reconhecimento e "livro de cobertura", caça por classes de ataque (web, cliente, nuvem, dados multiempresa, mobile e desktop, cadeia de suprimentos, IA), validação de cada candidato por um agente novo que tenta desmentir, achados em JSON validado, nova verificação e relatório. Tem modo "orientação" (só responde) e modo "auditoria completa" (gera arquivos).
- Status: **ferramenta** opcional para auditoria completa antes de lançar sistema com dados sensíveis, com princípios **incorporados** em [playbook/varreduras.md](../playbook/varreduras.md): achado confirmado, a validar ou descartado; fronteira + resultado para ser vulnerabilidade; falta de camada extra é melhoria; gravidade só para confirmado; quem confirma não é quem achou; nada contra produção.
- Como instalar: `npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit`.
- Riscos: muito cara em tokens (vários subagentes por fase; o próprio README diz que uma rodada achou cerca de metade do que rodadas repetidas acharam). Para executar código do projeto, exige sandbox do sistema sem rede; sem ela, deixa o achado como "a validar". Grava fora do projeto por padrão (`~/security-audit-skill/`). A ligação com o "harness" de vulnerabilidades da Cloudflare é afirmação do README, não conferida.

### Trail of Bits Skills
- Link: https://github.com/trailofbits/skills · Ensino: https://appsec.guide
- Licença: **CC BY-SA 4.0** (o repositório inteiro) · Revisão analisada: `149d7b2` (2026-11-12) · 65 contribuidores, muito ativo
- Plataforma: Claude Code e Codex (marketplace de plugins); conteúdo vale para qualquer stack, com foco em C/C++, Rust, Python, Go e contratos inteligentes
- Para que serve: 47 plugins de auditoria e desenvolvimento. Úteis para iniciante: `insecure-defaults` (segredo com valor padrão, conta padrão, chave que liga/desliga segurança e falha aberta, CORS `*`, criptografia fraca, erro detalhado na resposta), `supply-chain-risk-auditor` (dependências abandonadas, de um só mantenedor ou com script de instalação), `open-sourcing` (preparar repositório para ficar público), `agentic-actions-auditor` (agente de IA no GitHub Actions) e `differential-review`.
- Status: **referência** e **ferramenta** opcional por plugin (`/plugin marketplace add trailofbits/skills`, depois instalar só o necessário). Ideias usadas, sem texto adaptado, em [playbook/varreduras.md](../playbook/varreduras.md): revogar antes de limpar o histórico, repositório novo antes de publicar, regras do agente no CI.
- Riscos: CC BY-SA obriga a manter a mesma licença em qualquer adaptação; por isso nada foi copiado. Alguns plugins instalam hooks: `gh-cli` intercepta buscas na web e `curl` e cria atalhos no PATH; `modern-python` troca `pip` por atalhos para `uv`; `fp-check` roda uma checagem extra com o modelo a cada fim de turno e de subagente (custo em toda conversa). Os hooks usam `bash` (no Windows, Git Bash). Vários plugins exigem `uv`, CodeQL ou outras ferramentas.

### Sentry Skills
- Link: https://github.com/getsentry/skills
- Licença: Apache-2.0 (a skill `security-review` traz material da OWASP Cheat Sheet Series, CC BY-SA 4.0, com licença própria na pasta) · Revisão analisada: `a582c51` (2026-11-14) · 28 contribuidores
- Plataforma: todas (Claude Code, Codex e outros via `npx skills`); várias skills são internas da Sentry (Django, marca, SR&ED, Linear)
- Para que serve: skills que a equipe da Sentry usa. Úteis aqui: `security-model` (arquivo que diz às ferramentas de revisão o que é falha no projeto), `security-review` (relata só achado de alta confiança, com a origem do dado rastreada), `skill-scanner` (analisa uma skill antes de instalar, com script em Python), `gha-security-review`, `secret-serialization` (segredo vazando por `repr`, `JSON.stringify`, logs) e `claude-settings-audit` (sugere permissões do Claude Code).
- Status: **incorporado** (o modelo [contexto/MODELO-DE-SEGURANCA.md](../contexto/MODELO-DE-SEGURANCA.md) foi reescrito a partir da `security-model`) e **ferramenta** opcional, instalando só skills escolhidas (`npx skills add getsentry/skills`, selecionando).
- Riscos: o plugin completo traz 31 skills e 2 subagentes, vários só fazem sentido na Sentry; a skill `commit` se declara obrigatória para todo commit, o que conflita com o fluxo da base. O `.claude/settings.json` do repositório libera `gh api` sem restrição: não copie. `skill-scanner` exige `uv`.

### SecuritySkills (UnitOne AI) e o fork groundfeel/securityskills
- Link original: https://github.com/UnitOneAI/SecuritySkills · Link recebido: https://github.com/groundfeel/securityskills (fork idêntico, 0 commits à frente, de uma conta com 788 repositórios e 5 seguidores)
- Licença: MIT · Revisão analisada: `70bc259` (2026-06-18) · 116 estrelas no original, sem atualização desde junho de 2026
- Plataforma: todas (45 skills e 5 pacotes por cargo: AppSec, nuvem, conformidade, resposta a incidente, IA)
- Para que serve: skills longas (cerca de 500 linhas cada) que amarram cada achado a um controle de OWASP, NIST, CIS ou MITRE ATT&CK.
- Status: **referência** (o original). O fork está **descartado** como link: use sempre o repositório de origem.
- Por que não incorporar: cita o ASVS 4.0.3, com numeração e regra de senha diferentes do ASVS 5.0.0 usado em [playbook/seguranca.md](../playbook/seguranca.md) (exige 12 caracteres pela regra antiga; a base usa 8, com 15 recomendado); misturar as duas geraria códigos de controle conflitantes. A instalação sugerida copia as 45 skills para `~/.claude/skills/` de todos os projetos, todas com ativação automática, disputando etapas com as skills `scaff-*`. Muito voltado a empresa grande (SOC 2, HIPAA, SIEM).

### Cybersecurity Skills (Bri Russell)
- Link: https://github.com/briiirussell/cybersecurity-skills
- Licença: MIT · Revisão analisada: `b198754` (2026-11-18), v1.99.2 · Um autor principal, versões quase diárias
- Plataforma: todas (Claude Code como formato principal, adaptadores para Codex e Cursor)
- Para que serve: 42 skills, de auditoria OWASP e API até resposta a incidente e conformidade. As mais úteis aqui: `scanner-pipeline` (escolhe e roda Gitleaks, Semgrep, Trivy, osv-scanner e o advisor do Supabase, normaliza a saída e monta o CI), `agent-supply-chain-audit` (confere skills, hooks, MCP e `CLAUDE.md` antes de instalar) e `security-start` (pergunta duas ou três coisas e indica a skill).
- Status: **referência** e **ferramenta** opcional. Princípios **incorporados** em [playbook/varreduras.md](../playbook/varreduras.md): ler hooks, settings e tarefas do editor antes de abrir o agente num repositório baixado; nunca imprimir o valor do segredo; varrer o histórico inteiro.
- Riscos: o README promove a empresa da autora (HoneyWarden). Mudanças muito frequentes: fixe a versão. Inclui skills ofensivas (pentest, reconhecimento, red team) que exigem autorização sobre o alvo. Números de campo citados (varredura de 45 apps, estudos sobre skills maliciosas) não foram conferidos.

### Relacionados à auditoria e varredura
| Repositório | Para que serve | Status |
|---|---|---|
| https://github.com/betterleaks/betterleaks | Sucessor do Gitleaks pelo mesmo autor (MIT, v1.10.1 estável e v2 em release candidate em 2026-11). A 1.10.1 foi testada no Windows: mesmos comandos e mesmo resultado do Gitleaks, validação de chaves desligada por padrão | avaliar (adotar quando a v2 estabilizar) |
| https://github.com/MobSF/mobsfscan | Versão leve do MobSF para CI, no código-fonte (LGPL-3.0) | ferramenta (mobile) |
| https://github.com/semgrep/semgrep-rules | Regras do registro do Semgrep, sob a Semgrep Rules License (não aberta) | só usar, nunca copiar |
| https://github.com/openai/codex-security | Origem da ideia de política de segurança lida por ferramentas de revisão (Apache-2.0) | referência |
| https://github.com/aquasecurity/trivy-action | Ação do Trivy para GitHub Actions; comprometida em março de 2026. Fixe por SHA ou rode o binário | ferramenta com cuidado |

## Stacks

Ferramentas recomendadas nos guias de [playbook/stacks/](../playbook/stacks/). Versões conferidas em 2026-11-22 na release do GitHub e, quando há pacote npm, na tag `latest` do npm. Antes de criar um projeto, rode `python scripts/conferir_versoes.py <nome>`.

### Next.js
- Link: https://github.com/vercel/next.js · Pacote npm: `next`
- Licença: MIT · Revisão analisada: release v16.4.6 (2026-11-09)
- Para que serve: framework React para sites e SaaS web, com telas e API no mesmo projeto. Criar com `npx create-next-app@<versão>`.
- Status: **ferramenta**, padrão do perfil web em [stacks/web.md](../playbook/stacks/web.md).
- Riscos: muda bastante entre versões principais; leia o guia da versão instalada em `node_modules/next/dist/docs/`.

### Prisma
- Link: https://github.com/prisma/prisma · Pacote npm: `prisma`
- Licença: Apache-2.0 · Revisão analisada: release 7.10.1 (2026-10-15)
- Para que serve: ORM para TypeScript com schema legível e migrations versionadas.
- Status: **ferramenta**, ORM padrão do perfil web.
- Riscos: em 2026-11-22 a tag `latest` do npm apontava para `8.0.0-rc.34`, um pré-lançamento. `npm install prisma` sem versão instala o RC: fixe a versão estável (`prisma@7.10.1` e `@prisma/client` igual).

### Drizzle ORM
- Link: https://github.com/drizzle-team/drizzle-orm · Pacote npm: `drizzle-orm`
- Licença: Apache-2.0 · Revisão analisada: release 0.45.4 (2026-10-08)
- Para que serve: ORM leve em TypeScript, com consultas próximas do SQL.
- Status: **ferramenta**, alternativa ao Prisma quando a pessoa ou a equipe preferir SQL; ainda antes da versão 1.

### Better Auth
- Link: https://github.com/better-auth/better-auth · Pacote npm: `better-auth`
- Licença: MIT · Revisão analisada: release v1.7.27 (2026-11-20)
- Para que serve: login e permissões em TypeScript (e-mail e senha, login social, 2FA, organizações para várias empresas), com adaptadores para Prisma e Drizzle.
- Status: **ferramenta**, padrão de autenticação do perfil web. O README do Auth.js (NextAuth) diz que o projeto passou a fazer parte do Better Auth e recomenda o Better Auth para projetos novos; Auth.js fica para quem já usa.

### Expo
- Link: https://github.com/expo/expo · Pacote npm: `expo`
- Licença: MIT · Revisão analisada: release 58.0.26 (SDK 58, npm, 2026-11-22)
- Para que serve: app Android e iOS em React Native com TypeScript; teste no celular com o Expo Go e build na nuvem com o EAS (inclusive iOS sem Mac).
- Status: **ferramenta**, padrão do perfil mobile em [stacks/mobile.md](../playbook/stacks/mobile.md).
- Riscos: as tags do GitHub são de pacotes internos (`jest-expo@...`): confira a versão pelo npm. EAS tem plano gratuito com limites; confira preço antes.

### Flutter
- Link: https://github.com/flutter/flutter · Versões: https://docs.flutter.dev/release/archive
- Licença: BSD-3-Clause · Revisão analisada: versão estável 3.50.1 (Dart 3.14.0), lançada em 2026-11-20
- Para que serve: app Android, iOS, web e desktop em Dart, com interface desenhada pelo próprio Flutter.
- Status: **ferramenta**, alternativa no perfil mobile.
- Riscos: as releases do GitHub não seguem as versões estáveis; confira na página de versões. O script de versões não consegue comparar esta entrada.

### Electron
- Link: https://github.com/electron/electron · Pacote npm: `electron`
- Licença: MIT · Revisão analisada: release v45.4.1 (2026-11-19)
- Para que serve: app desktop Windows, Mac e Linux com interface web e Node.js.
- Status: **ferramenta**, padrão do perfil desktop em [stacks/desktop.md](../playbook/stacks/desktop.md), criado com o Electron Forge.
- Riscos: cada versão principal tem suporte curto (só as mais recentes recebem correções); planeje atualizar. Configuração insegura (Node na janela, conteúdo remoto) abre o computador da pessoa.

### Electron Forge
- Link: https://github.com/electron/forge · Pacote npm: `@electron-forge/cli`
- Licença: MIT · Revisão analisada: release v8.0.1 (2026-09-29)
- Para que serve: cria, empacota, assina e publica apps Electron. Criar com `npx create-electron-app@<versão> meu-app --template=vite` (na v8 o modelo `vite` já vem em TypeScript; o antigo `vite-typescript` não existe mais na pasta de modelos).
- Status: **ferramenta** do perfil desktop.

### Tauri
- Link: https://github.com/tauri-apps/tauri
- Licença: Apache-2.0 (e MIT) · Revisão analisada: release tauri-v2.12.7 (2026-11-18)
- Para que serve: app desktop (e mobile) com interface web e núcleo em Rust; instaladores bem menores que os do Electron e permissões negadas por padrão.
- Status: **ferramenta**, alternativa no perfil desktop quando tamanho e memória importam.
- Riscos: exige Rust e, no Windows, as ferramentas de build do Visual Studio.

### FastAPI
- Link: https://github.com/fastapi/fastapi
- Licença: MIT · Revisão analisada: release 0.165.0 (2026-11-18)
- Para que serve: API HTTP em Python com validação e documentação automática.
- Status: **ferramenta**, padrão do perfil Python em [stacks/python.md](../playbook/stacks/python.md).
- Riscos: ainda antes da versão 1; fixe a versão e leia as notas ao atualizar.

### SQLModel
- Link: https://github.com/fastapi/sqlmodel
- Licença: MIT · Revisão analisada: release 0.0.50 (2026-11-13)
- Para que serve: modelos de banco e de API na mesma classe Python, sobre SQLAlchemy.
- Status: **ferramenta** do perfil Python; migrations com Alembic.

### uv
- Link: https://github.com/astral-sh/uv
- Licença: Apache-2.0 (e MIT) · Revisão analisada: release 0.13.9 (2026-11-17)
- Para que serve: instala Python, cria ambiente, trava dependências e roda comandos (`uv init`, `uv add`, `uv run`, `uv tool install`).
- Status: **ferramenta** padrão para Python e CLI.

### Typer
- Link: https://github.com/fastapi/typer
- Licença: MIT · Revisão analisada: release 0.29.2 (2026-11-18)
- Para que serve: programas de linha de comando em Python com ajuda e validação automáticas.
- Status: **ferramenta**, padrão do perfil CLI em [stacks/cli.md](../playbook/stacks/cli.md).

### AI SDK (Vercel)
- Link: https://github.com/vercel/ai · Pacote npm: `ai`
- Licença: Apache-2.0 · Revisão analisada: release 7.0.179 (npm, 2026-11-22)
- Para que serve: chamar modelos de IA de vários fornecedores em TypeScript, com streaming, ferramentas e saída estruturada.
- Status: **ferramenta**, padrão do perfil IA em [stacks/ia.md](../playbook/stacks/ia.md).
- Riscos: monorepo com muitas tags (a lista de releases do GitHub mostra versões antigas mantidas, como `ai@6`); confira pelo npm.

### Medusa
- Link: https://github.com/medusajs/medusa · Pacote npm: `@medusajs/medusa`
- Licença: MIT, **exceto** os materiais Enterprise listados em `ENTERPRISE-LICENSE.md` (RBAC e SSO), que são proprietários · Revisão analisada: release v2.23.0 (2026-11-20)
- Para que serve: back-end de loja virtual em Node.js (produtos, carrinho, pedidos, painel), com vitrine em Next.js. Criar com `npx create-medusa-app@<versão>`.
- Status: **ferramenta** do perfil e-commerce em [stacks/ecommerce.md](../playbook/stacks/ecommerce.md), quando a loja precisa de regras próprias.
- Riscos: não ative recursos Enterprise (flags de RBAC/SSO) sem contrato; o próprio aviso diz que ativar a flag declara ter licença.

### WooCommerce
- Link: https://github.com/woocommerce/woocommerce
- Licença: GPL-2.0 · Revisão analisada: release 11.3.1 (2026-11-19)
- Para que serve: loja virtual como plugin do WordPress.
- Status: **ferramenta** do perfil e-commerce quando a pessoa já usa WordPress.
- Riscos: segurança depende de manter WordPress, tema e plugins atualizados; cada plugin extra é um risco.

## Publicação e operação

Ferramentas dos guias de [playbook/publicacao/](../playbook/publicacao/README.md), [playbook/vps.md](../playbook/vps.md) e [playbook/saas/monitoramento.md](../playbook/saas/monitoramento.md). Versões conferidas em 2026-11-23. Nenhuma foi instalada nos testes da base; os pilotos da Fase 9 vão exercitá-las.

### Coolify
- Link: https://github.com/coollabsio/coolify
- Licença: Apache-2.0 · Revisão analisada: release v4.7.6 (2026-11-19)
- Para que serve: painel auto-hospedado para publicar apps do Git numa VPS, com HTTPS, bancos, variáveis e backups.
- Status: **ferramenta**, destino recomendado para iniciante em [vps.md](../playbook/vps.md).
- Riscos: o primeiro cadastro vira admin com acesso de root (cadastre logo após instalar); atualização automática diária por padrão; perder o `APP_KEY` impede restaurar o painel.

### cloudflared (Cloudflare Tunnel)
- Link: https://github.com/cloudflare/cloudflared
- Licença: Apache-2.0 · Revisão analisada: release 2026.11.1 (2026-11-17)
- Para que serve: publica um serviço sem abrir porta de entrada no servidor.
- Status: **ferramenta** opcional em [publicacao/cloudflare.md](../playbook/publicacao/cloudflare.md).
- Riscos: o túnel ignora o firewall do servidor; cada rota publicada precisa de proteção própria.

### Supabase CLI
- Link: https://github.com/supabase/cli · Pacote npm: `supabase`
- Licença: MIT · Revisão analisada: release 3.2.0 (npm, 2026-11-23)
- Para que serve: migrations, backup (`db dump`) e Security Advisor (`db advisors`) de projetos Supabase.
- Status: **ferramenta** do destino Vercel + Supabase em [publicacao/vercel-supabase.md](../playbook/publicacao/vercel-supabase.md).
- Riscos: as releases do GitHub mostram só pré-lançamentos (`4.0.0-next`); confira pelo npm.

### Resend (SDK Node)
- Link: https://github.com/resend/resend-node · Pacote npm: `resend`
- Licença: MIT · Revisão analisada: release v6.39.0 (2026-11-18)
- Para que serve: envio de e-mail transacional e verificação de webhooks.
- Status: **ferramenta** em [saas/arquivos-emails-tarefas.md](../playbook/saas/arquivos-emails-tarefas.md).
- Riscos: domínio precisa de DKIM e SPF sem proxy da Cloudflare; limites diários no plano gratuito.

### Sentry (SDK Next.js)
- Link: https://github.com/getsentry/sentry-javascript · Pacote npm: `@sentry/nextjs`
- Licença: MIT · Revisão analisada: release 11.16.0 (2026-11-20)
- Para que serve: captura de erros e desempenho no app.
- Status: **ferramenta** em [saas/monitoramento.md](../playbook/saas/monitoramento.md).
- Riscos: manda IP, usuário e corpo de requisição por padrão; ajuste `dataCollection` e `beforeSend`. O token de source maps é credencial.

### Uptime Kuma
- Link: https://github.com/louislam/uptime-kuma
- Licença: MIT · Revisão analisada: release 2.5.12 (2026-11-17)
- Para que serve: monitor de disponibilidade auto-hospedado com alertas no Telegram.
- Status: **ferramenta** em [saas/monitoramento.md](../playbook/saas/monitoramento.md).
- Riscos: na mesma VPS cai junto com ela; publique o painel só em `127.0.0.1`.

### pino
- Link: https://github.com/pinojs/pino · Pacote npm: `pino`
- Licença: MIT · Revisão analisada: release v10.4.0 (2026-10-02)
- Para que serve: logs estruturados em JSON no Node.js, com `redact` para esconder dados sensíveis.
- Status: **ferramenta** em [saas/monitoramento.md](../playbook/saas/monitoramento.md).
- Riscos: sem `redact`, cabeçalhos de autorização e cookies vão para o log.

## Lista para análise

Os próximos grupos entram aqui conforme forem analisados.
