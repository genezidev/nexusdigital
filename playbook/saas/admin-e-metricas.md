# Painel admin, métricas e analytics

## Painel administrativo

Telas mínimas:

| Tela | Conteúdo |
|---|---|
| Visão geral | Receita total, assinantes pagantes, cadastros, visitas (dia e variação), origens de tráfego, gráfico da semana |
| Usuários | Tabela paginada no servidor com busca por e-mail e filtros por status de assinatura e admin. Ação de promover/remover admin |
| Mensagens | Contatos e suporte enviados pelos usuários, com marcação de lido/respondido |
| Monitoramento | Status dos serviços, últimas falhas de tarefas e links para os painéis de erros e uptime |
| Configurações | Dados da empresa e parâmetros do sistema |

Regras:

- A tela de admin redireciona quem não é admin, **e** cada operação de admin checa o papel no servidor.
- Listas grandes usam paginação no servidor; a contagem total e a página vêm na mesma transação.
- Ações sensíveis (promover admin, excluir usuário, estornar) ficam registradas em um log de auditoria: quem, quando, o quê.

## Métricas do negócio

- Uma tarefa agendada (de hora em hora ou diária) calcula e grava um **registro por dia**: total de usuários, pagantes, variação desde ontem, receita (consultada no gateway), visitas e origens (consultadas no analytics).
- O painel lê esses registros prontos, em vez de calcular tudo a cada acesso.
- Guarde as falhas da tarefa numa tabela de logs e alerte no Telegram.

## Analytics do site

- Prefira ferramentas com foco em privacidade (Plausible, Umami, inclusive hospedados na própria VPS). Google Analytics exige consentimento de cookies.
- Com cookies de analytics: banner de consentimento **opt-in**, botões "Aceitar" e "Recusar" com o mesmo destaque, e o script de analytics carregado **só depois** do aceite. Links para política de privacidade e termos no banner.
- Eventos importantes do funil: visita à página de preços, início de cadastro, cadastro concluído, checkout iniciado, pagamento aprovado.

## Monitoramento técnico

Erros (Sentry), disponibilidade (Uptime Kuma ou serviço externo), logs e alertas no Telegram: [monitoramento.md](monitoramento.md). Métricas de servidor com Grafana + Prometheus quando o projeto crescer.
