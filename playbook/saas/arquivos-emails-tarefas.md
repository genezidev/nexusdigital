# Arquivos, e-mails, notificações e tarefas agendadas

## Upload de arquivos

Fluxo recomendado com armazenamento compatível com S3 (AWS S3, Cloudflare R2, Backblaze B2 ou MinIO na própria VPS):

1. O usuário escolhe o arquivo. A tela checa tipo e tamanho (só para ajudar).
2. O servidor valida tipo e nome, e gera uma **URL assinada de envio** com validade curta e **limite de tamanho** embutido.
3. O navegador envia o arquivo direto para o armazenamento (o servidor não carrega o arquivo na memória).
4. O app confirma no armazenamento que o arquivo existe e só então grava o registro no banco.

Regras:

- Lista de tipos permitidos e tamanho máximo definidos num único lugar, usados na tela e no servidor.
- Nome do arquivo no armazenamento gerado pelo servidor: `idDoUsuario/uuid.extensão`. Nunca use o nome enviado pelo usuário como caminho.
- Bucket **privado**. Download por URL assinada de validade curta, gerada só depois de checar que o arquivo é do usuário.
- Ao apagar: remova o registro e depois o arquivo. Se a remoção do arquivo falhar, registre no log para limpeza posterior.
- Configure CORS do bucket apenas para os domínios do app.

## E-mails transacionais

- Um contrato `enviarEmail(para, assunto, texto, html)` com implementações: **log** (desenvolvimento) e **Resend** (produção). SMTP genérico também serve.
- Configure o domínio de envio com SPF, DKIM e DMARC (o painel do provedor gera os registros; na Cloudflare, adicione-os no DNS). Sem isso, os e-mails caem no spam.
- O remetente precisa ser um endereço do domínio verificado.

### Resend (conferido em 2026-11-23; SDK Node `resend` 6.39.0, MIT)

- **Plano gratuito**: 3.000 e-mails por mês, no máximo 100 por dia, 3 domínios. O plano pago mais barato começa em US$ 20 por mês. Preços mudam: confira em resend.com/pricing e registre a data na decisão.
- **Domínio**: envie de um **subdomínio** (por exemplo `avisos.seudominio.com.br`), como a própria Resend recomenda, para proteger a reputação do domínio principal. Copie os registros DKIM e SPF exatamente como o painel mostra; na Cloudflare, deixe esses registros **sem proxy** (nuvem cinza). A verificação costuma levar até 15 minutos, às vezes até 72 horas.
- **DMARC**: recomendado. Comece com `v=DMARC1; p=none; rua=mailto:...` no `_dmarc` e suba para `quarantine` ou `reject` quando os envios passarem.
- **Limite da API**: 10 requisições por segundo por equipe, igual em todos os planos. Acima disso responde 429 com `retry-after`; passar da cota diária ou mensal também responde 429. Envie em lote (até 100 e-mails por requisição) e use fila para reenviar com espera.
- **Sem e-mail duplicado**: mande o header `Idempotency-Key` (até 256 caracteres, válido por 24 horas), por exemplo `boas-vindas/<id-do-usuario>`.
- **Webhooks** (entregue, devolvido, marcado como spam…): assinados no padrão Svix (headers `svix-id`, `svix-timestamp`, `svix-signature`). Valide com `resend.webhooks.verify` usando o **corpo bruto** da requisição. Em `email.bounced` e `email.complained`, pare de enviar para o endereço.
- A chave da API fica só no servidor, com permissão só de envio quando possível.
- E-mails mínimos de um SaaS: verificação de conta, redefinição de senha, pagamento aprovado, falha de pagamento, cancelamento.
- E-mail de marketing só com consentimento e link de descadastro.

## Notificações para o dono do sistema (Telegram)

Alertas operacionais chegam no Telegram do administrador: novo cadastro, nova assinatura, pagamento falhou, tarefa agendada falhou, erro grave.

- Crie um bot com o @BotFather e guarde o token em variável de ambiente do servidor. Quem tem o token controla o bot: se vazar, gere outro no @BotFather.
- Descubra o `chat_id`: mande uma mensagem ao bot (ou, num grupo, um comando como `/start@seu_bot`) e leia `message.chat.id` na resposta de `getUpdates`. Em grupo, o bot com modo de privacidade (padrão) só vê comandos e respostas dirigidos a ele, o que basta para só enviar alertas. O `getUpdates` não funciona enquanto houver webhook configurado.
- Envie com `sendMessage` (texto de 1 a 4096 caracteres). Com `parse_mode: "HTML"`, troque `<`, `>` e `&` do texto por `&lt;`, `&gt;` e `&amp;`, senão a mensagem é recusada.
- Limites do Telegram: cerca de 1 mensagem por segundo por conversa e 20 por minuto num grupo; acima disso vem erro 429. Agrupe alertas repetidos (um resumo a cada minuto) em vez de mandar um por evento.
- Se o bot também **recebe** mensagens por webhook, configure `secret_token` no `setWebhook` e confira o header `X-Telegram-Bot-Api-Secret-Token` em toda chamada.
- Um contrato `notificarAdmin(mensagem)` com implementação Telegram e uma de log para desenvolvimento.
- Notificação nunca derruba a operação principal: se o Telegram falhar, registre no log e siga.
- Nunca envie dados sensíveis (senha, documento, cartão, dados de saúde) na mensagem: o Telegram é um terceiro. Mande o ID do registro e veja o detalhe no painel.

## Tarefas agendadas e em segundo plano

- Use o agendador da stack ou uma fila persistente: pg-boss ou Graphile Worker (Node + PostgreSQL), BullMQ (Redis), Celery/RQ/APScheduler (Python), Hangfire/Quartz (.NET), ou cron do sistema chamando um comando do app.
- Cada tarefa: nome, frequência (cron), limite de tempo, log de início/fim/erro e alerta no Telegram em caso de falha.
- Tarefas precisam poder rodar duas vezes sem estragar dados (idempotentes).
- Com várias instâncias do app, garanta que a tarefa rode em uma só (fila com trava ou um único agendador).
- Exemplos comuns: calcular métricas diárias, lembretes, cobrança de inadimplentes, limpeza de arquivos órfãos, backup.
