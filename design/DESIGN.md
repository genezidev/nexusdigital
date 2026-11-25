---
# Formato DESIGN.md (https://github.com/google-labs-code/design.md, Apache-2.0).
name: Nexo Digital
description: Portal privado de gestão de marketing digital para agência e clientes
colors:
  sidebar: "#101B30"
  on-sidebar: "#F1F5F9"
  primary: "#315DE0"
  on-primary: "#FFFFFF"
  background: "#F4F6FA"
  surface: "#FFFFFF"
  on-surface: "#18243A"
  secondary: "#5B6B80"
  border: "#E2E7EF"
  success: "#15803D"
  warning: "#B45309"
  error: "#B91C1C"
  on-error: "#FFFFFF"
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: 700
    lineHeight: 1.25
  headline-md:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.3
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: 8px
  md: 12px
  lg: 16px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: 12px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: 12px
  page:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 24px
  sidebar:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.on-sidebar}"
    padding: 16px
  alert-error:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    rounded: "{rounded.sm}"
    padding: 16px
---

## Overview

Portal de uma agência de marketing digital: a equipe controla vários clientes em um só lugar e cada cliente acompanha o que foi entregue, o que depende dele e como os números evoluem. Uso principal no computador no escritório (admin) e no celular (cliente aprovando conteúdo). A sensação deve ser limpa, corporativa e confiável, sem gamificação enganosa: progresso de entregas não é prova de crescimento comercial. A marca Nexo é provisória e configurável; a cor de destaque do cliente é opcional e nunca substitui a marca global. Referências visuais: tokens da especificação mestre (contexto/ESPECIFICACAO-MESTRE.md, seção 6); não há protótipo HTML.

## Colors

`primary` para ação principal e foco; `sidebar` fixa para a navegação; `surface` para cards sobre `background`. `success`, `warning` e `error` indicam estado, sempre acompanhados de texto ou ícone, nunca só cor. Texto com contraste mínimo de 4,5:1. Ajustes de contraste feitos na implementação da spec 0001 (medidos, WCAG AA): o texto secundário do tema claro passou de `#64748B` (4,40:1 sobre o fundo) para `#5B6B80` (5,03:1); `error`, `success` e `warning` do tema claro foram escurecidos para `#B91C1C`, `#15803D` e `#B45309` (texto branco sobre eles passa de 5:1; os tons anteriores davam 3,2:1 a 4,8:1). A borda de campo (`--input`) é `#77869B` no claro e `#7D8CA3` no escuro para manter 3:1 contra a superfície; a borda decorativa (`border`) segue a do DESIGN. Os tokens viram variáveis CSS em `app/src/app/globals.css`, nomeadas pela função (`primary`, `muted-foreground`, `destructive`, `success`, `warning`, `sidebar-*`). Tema escuro persistido por usuário: fundo #0B1220, superfície #17243A, texto #F1F5F9, secundário #A8B5C8, borda #334155, primário #83A4FF, sucesso #4ADE80, atenção #FBBF24, erro #F87171. Nunca usar o código da cor direto no componente: use o token.

## Typography

Inter com fallback system-ui. Títulos entre 24 e 32px, corpo entre 14 e 16px (16px em formulários e no celular), legenda entre 12 e 13px. Linhas de texto corrido até 80 caracteres. Moeda em pt-BR (R$ 1.200,00) e datas DD/MM/AAAA, fuso padrão America/Maceio.

## Layout

Escala de espaçamento 4/8/12/16/24/32. Sidebar de 240px no desktop e drawer no celular; header com contexto (cliente, para admin) e período. Tamanhos testados: 360, 768 e 1440px. Navegação do admin: Painel, Clientes, Planos, Assinaturas e ciclos, Calendário, Conteúdos, Roteiros, Auditoria (só ADMIN) e Perfil; do portal: Início, Meu plano, Calendário, Conteúdos, Aprovações, Roteiros e Perfil (a fase 2 só acrescentou rotas que existem). Breadcrumbs, filtro de cliente (admin), busca, paginação e estados vazios previstos desde o shell.

## Shapes

Raio de 8px em botões e campos, 12px em cards, 16px em modais e painéis grandes.

## Motion

Transições curtas (até 200ms) em abrir drawer, modal e toast. Tudo respeita `prefers-reduced-motion`.

## Components

shadcn/ui sobre Tailwind (versões fixadas na fundação; licença MIT). Origem e versões da spec 0001: componentes copiados com o CLI `shadcn@4.23.0` (estilo `new-york`, base Radix via pacote `radix-ui@1.8.1`, ícones `lucide-react@1.79.0`, toasts `sonner@2.0.8`), em `app/src/components/ui/`: alert, alert-dialog, badge, breadcrumb, button, card, dialog, dropdown-menu, input, label, select, sheet, skeleton, sonner, table. Ajustes locais: alvo de toque de 44px (botões, campos, itens de menu), raios 8/12/16px, badges com `success` e `warning`, botão e badge destrutivos com texto de alto contraste e `sonner` lendo o tema próprio (sem `next-themes`). O CLI resolveu `cn` como um pacote npm homônimo e o instalou: removido; `cn` vive em `app/src/lib/utils.ts`. O CLI não ficou como dependência (use `npx shadcn@4.23.0 add <componente> --dry-run` antes de adicionar). Componentes próprios em `app/src/components/app/` (shell, estados, formulários, diálogos, tema). Sem protótipo HTML nem referência visual externa. Estados obrigatórios em cada componente: carregando (skeleton), vazio, erro, sucesso (toast), desabilitado e foco visível. Formulários com erro inline e confirmação em modal para ações destrutivas. Tabelas responsivas, gráficos com alternativa tabular, badges com texto. Área de toque mínima de 44×44px. Sem botão ou link decorativo sem função.

## Do's and Don'ts

- Faça: WCAG AA, uso completo por teclado, texto de erro que diz como corrigir, estado "acesso negado" claro.
- Faça: mostrar ao cliente só o que foi publicado e compartilhado, nunca notas internas.
- Não faça: usar o verde da Cliente Modelo como cor global; mostrar zero onde o dado é ausente (mostrar N/D); prometer vendas ou resultados.
- Evidência: capturas de tela em 360, 768 e 1440px (claro e escuro) em `specs/0001/evidencias/` (geradas por `app/e2e/visual.spec.ts`), mais checagem automática com axe-core (WCAG 2.0/2.1/2.2 A e AA, 0 violações) em `app/e2e/a11y.spec.ts`. Sem prova ainda: zoom de 200%, leitor de tela real, 1024px e o linter `designmd lint` (o `npx` do pacote de terceiros não foi autorizado nesta sessão).

## Padrões da fase 2 (telas de planos, conteúdos, aprovação, roteiros e arquivos)

- **Escolha do cliente na agência**: as telas de agência mostram um cliente por vez. O seletor é um formulário GET com `<select>` nativo (`ClientScopeBar`); o cliente vai na URL como alvo e o servidor confere o acesso (404 igual para inexistente e não atribuído). Trocar de cliente recarrega a página inteira do servidor, sem estado do anterior.
- **Seletor nativo** (`NativeSelect`, 44px) nos formulários novos e nos filtros: teclado, leitor de tela e celular de graça; o `Select` do Radix fica para o que já existia.
- **Modais**: `FormDialog` (formulário com erro inline por campo e erro do formulário) e `ReasonDialog` (justificativa escrita, mínimo de 10 caracteres, para cancelar, pedir regravação, reabrir ciclo e pedir revisão). Ações irreversíveis ou que mudam o que o cliente vê usam `ConfirmAction` (foco inicial em Cancelar).
- **Progresso** (`ProgressCard`): fração em texto ("7 de 12 publicadas (58%)") mais barra `role=progressbar`; planejadas, produzidas, aprovadas e publicadas lado a lado; excedente e fora da cota em linha separada, nunca somados; sem cota mostra "Sem cota definida"; sem dado mostra N/D.
- **Status e selos** sempre com texto (`ContentStatusBadge`, `ScriptStatusBadge`, `VisibilityBadge`, selo "Atrasado" calculado). O cliente lê o status em linguagem própria ("Aguardando sua aprovação", "Em ajuste pela agência").
- **Calendário**: grade mensal (domingo a sábado) em telas largas e lista equivalente em telas estreitas ou por escolha; cada peça é link com formato e status em texto; reagendar é formulário de data (no modo lista), arrastar não existe.
- **Arquivos** (`FileUploader`): validação prévia de tipo e tamanho (a decisão é do servidor), barra de progresso, "Cancelar envio", mensagens em pt-BR para queda, 413, 415, 429 e 503. Download só por botão que pede link assinado curto (`DownloadButton`); nunca há link permanente nem prévia por URL pública. Links externos (`ExternalLink`) abrem em nova aba com `rel="noopener noreferrer nofollow"` e mostram o domínio.
- **Decisão de aprovação** (`DecisionPanel`): sempre ligada à versão exibida; versão antiga mostra aviso e nenhum botão; se o servidor responder versão desatualizada ou já decidida, os botões somem e aparece "Carregar a versão atual". O botão só existe para quem tem a permissão.
- Evidência: capturas em `specs/0002/evidencias/` (geradas por `app/e2e/fase2-visual.spec.ts`) e axe sem violações no mesmo teste.
