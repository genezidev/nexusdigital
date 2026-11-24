# Vercel + Supabase

Para web em Next.js sem administrar servidor: a Vercel roda o app, o Supabase fornece o PostgreSQL (e, se quiser, armazenamento de arquivos). Conferido nas páginas oficiais em 2026-11-23; preços em dólar, sem impostos.

## Planos: o gratuito não serve para produção que cobra

| | Gratuito | Pago |
|---|---|---|
| Vercel | Hobby: **só uso pessoal ou não comercial** (termos de uso, seção 4); uma região; cron no máximo uma vez por dia; volta só para a publicação anterior | Pro: US$ 20 por mês por pessoa que publica, com US$ 20 de crédito de uso; alerta de gasto em US$ 200 por padrão; volta para qualquer publicação anterior |
| Supabase | 2 projetos, 500 MB de banco, **pausa depois de 1 semana sem uso, sem backup** | Pro: a partir de US$ 25 por mês, backup diário guardado por 7 dias, limite de gasto ligado por padrão; PITR é extra (US$ 100 por mês para 7 dias) |

SaaS que vende precisa dos dois planos pagos, cerca de US$ 45 por mês para começar, mais uso. Configure o limite de gasto e alertas nos dois painéis.

## Região e conexão

- Crie o projeto Supabase em **São Paulo (`sa-east-1`)**; a região não muda depois.
- Na Vercel, coloque as funções na mesma região: `"regions": ["gru1"]` no `vercel.json` ou em Settings > Functions. O padrão é Washington (`iad1`), longe do banco.
- Na Vercel, conecte pelo **pooler em modo transação (porta 6543)**, feito para funções sem servidor. Ele não aceita *prepared statements*: use `pgbouncer=true` na URL do Prisma ou `prepare: false` no Drizzle/Postgres.js, com pool pequeno. Migrations rodam pela conexão direta ou pelo pooler em modo sessão (porta 5432).
- A conexão direta é só IPv6 sem o complemento pago de IPv4; os poolers aceitam IPv4.

## Segurança do Supabase

- Chaves: a **publicável** (`sb_publishable_...`) pode ir para o navegador e só alcança o que o RLS libera. A **secreta** (`sb_secret_...`) ignora o RLS e fica só no servidor. As antigas `anon` e `service_role` serão descontinuadas até o fim de 2026: projetos novos já usam as novas.
- O esquema `public` fica exposto pela API do Supabase. Tabela sem RLS ali pode ser lida e alterada por quem tem a chave publicável. **Ative o RLS em todas as tabelas**, mesmo quando o app usa só Prisma ou Drizzle pelo servidor: sem policy, a API não entrega nada com a chave publicável.
- Rode o **Security Advisor** (painel, ou `supabase db advisors` na CLI 3.2.0) antes de publicar e a cada migration; trate erros como "tabela pública sem RLS".
- Login: na stack web da base o login é do Better Auth ([saas/contas-e-acesso.md](../saas/contas-e-acesso.md)). Se usar o login do Supabase, configure SMTP próprio (o envio padrão é limitado), limite de tentativas e CAPTCHA no cadastro, login e recuperação de senha.
- Plano gratuito não permite baixar backup: exporte com `supabase db dump` e guarde fora.

## Vercel no dia a dia

- Variáveis por ambiente (Production, Preview, Development); marque chaves como secretas (não podem ser lidas depois de salvas). Staging e produção com projetos Supabase separados.
- Publicações de prévia expõem o app com o banco configurado para Preview: nunca aponte Preview para o banco de produção, e mantenha a proteção de prévias (login da Vercel) ligada.
- Funções têm tempo máximo de 300 s no Hobby e até 800 s no Pro: tarefas longas vão para fila ou tarefa agendada.
- Volta rápida: Instant Rollback no painel; migrations do banco precisam do próprio plano de volta.

## Fontes

- Vercel: preços https://vercel.com/pricing · termos (Hobby) https://vercel.com/legal/terms · Pro https://vercel.com/docs/plans/pro-plan · duração https://vercel.com/docs/functions/configuring-functions/duration · regiões https://vercel.com/docs/regions e https://vercel.com/docs/functions/configuring-functions/region · rollback https://vercel.com/docs/instant-rollback · cron https://vercel.com/docs/cron-jobs/usage-and-pricing · variáveis https://vercel.com/docs/environment-variables
- Supabase: preços https://supabase.com/pricing · backups https://supabase.com/docs/guides/platform/backups · chaves https://supabase.com/docs/guides/api/api-keys · RLS https://supabase.com/docs/guides/database/postgres/row-level-security · conexões https://supabase.com/docs/guides/database/connecting-to-postgres · regiões https://supabase.com/docs/guides/platform/regions · produção https://supabase.com/docs/guides/deployment/going-into-prod · advisors https://supabase.com/docs/guides/database/database-advisors
