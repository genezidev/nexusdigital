# Monitoramento: erros, disponibilidade e logs

Saber que algo quebrou antes do cliente reclamar. Três peças, mais os alertas no Telegram. O dia a dia de operação fica em `contexto/OPERACAO.md` (skill `scaff-operar`).

## Erros: Sentry

Conferido em 2026-11-23 (`@sentry/nextjs` 11.16.0).

- Instale com o assistente oficial: `npx @sentry/wizard@<versão> -i nextjs` (exige Next.js 14 ou mais novo e Node.js 20.19 ou mais novo). Fixe a versão do pacote depois.
- **Dados pessoais**: por padrão o SDK manda IP, identificação do usuário, corpo das requisições e parâmetros da URL. Desligue o que não precisa na opção `dataCollection` (que substitui o antigo `sendDefaultPii`) e limpe o resto no `beforeSend` (por exemplo, apague `event.user.email`). O SDK já troca por `[Filtered]` campos com nomes como `password` e `auth`, mas CPF, telefone e endereço não.
- **Amostragem**: `tracesSampleRate` é a fração das requisições rastreadas (de 0 a 1). Comece baixo em produção (por exemplo 0,1) e suba se precisar. Gravação de sessão (`replaysSessionSampleRate`, `replaysOnErrorSampleRate`) grava a tela do usuário: só com a privacidade revisada e mascaramento de campos.
- **Source maps**: o envio usa o `SENTRY_AUTH_TOKEN`, que é credencial: fica no CI e no servidor de build, nunca no repositório.
- **Bloqueadores de anúncio**: a opção `tunnel` faz os eventos passarem pelo seu próprio domínio.
- Plano gratuito (Developer) em 2026-11-23: 1 usuário, 5 mil erros e 30 dias de histórico. Alternativa auto-hospedada compatível com o SDK: GlitchTip.

## Disponibilidade: Uptime Kuma ou serviço externo

- Uma rota `/health` que confere o app e uma consulta simples ao banco, sem dados e sem detalhes de erro na resposta.
- **Uptime Kuma** (MIT, 2.5.12 em 2026-11-17): `docker run -d --restart=always -p 127.0.0.1:3001:3001 -v uptime-kuma:/app/data --name uptime-kuma louislam/uptime-kuma:2`. O `127.0.0.1` impede que o painel fique aberto na internet; acesse por túnel SSH ou atrás do proxy com HTTPS e senha forte. O volume não pode ficar em NFS. Notifica no Telegram, e-mail e mais de 90 serviços.
- **Monitore de fora**: um Uptime Kuma na mesma VPS cai junto com ela. Use também um serviço externo (o próprio Sentry tem 1 monitor no plano gratuito, ou BetterStack, UptimeRobot) ou um Uptime Kuma em outra máquina.

## Logs

- Logs estruturados em JSON com nível, data, ID da requisição, ID do usuário e da empresa. No Node.js, o `pino` (MIT, 10.4.0) é o padrão; use a opção `redact` para esconder `authorization`, `cookie`, senha, token e documentos.
- Nunca registre senha, token, número de cartão, chave de API ou corpo inteiro de requisição com dados pessoais.
- Guarde logs pelo tempo da política de privacidade (por exemplo 30 a 90 dias) e com acesso restrito.

## Alertas

| Situação | Para onde |
|---|---|
| Site ou API fora do ar | Telegram, na hora |
| Erro novo ou pico de erros | Telegram (pelo Sentry ou pela sua rotina) |
| Tarefa agendada falhou, webhook de pagamento rejeitado | Telegram |
| Backup não rodou | Telegram |
| Custo acima do esperado (servidor, IA, e-mail) | E-mail ou Telegram, conforme o painel do fornecedor |

Agrupe alertas repetidos para respeitar o limite do Telegram ([arquivos-emails-tarefas.md](arquivos-emails-tarefas.md#notificações-para-o-dono-do-sistema-telegram)).

## Fontes

- Sentry para Next.js: https://docs.sentry.io/platforms/javascript/guides/nextjs/ · dados sensíveis: https://docs.sentry.io/platforms/javascript/guides/nextjs/data-management/sensitive-data/
- Uptime Kuma: https://github.com/louislam/uptime-kuma
- pino: https://github.com/pinojs/pino
