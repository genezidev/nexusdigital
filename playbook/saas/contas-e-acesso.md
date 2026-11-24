# Contas, permissões e configuração

## Configuração e segredos

- Separe variáveis do **servidor** (segredos) das variáveis do **cliente** (públicas, com prefixo próprio da stack, como `NEXT_PUBLIC_`, `VITE_` ou `REACT_APP_`). Nada secreto vai para o cliente.
- Valide as variáveis **na inicialização** com um schema. Cada funcionalidade declara as suas; o app junta todas. Variável obrigatória ausente impede o app de subir, com mensagem que diz qual falta.
- O código lê a configuração validada, nunca o ambiente cru espalhado pelo código.
- `.env.example` lista cada variável com comentário: para que serve, onde gerar (link do painel do fornecedor) e valor de teste. O `.env` real nunca entra no Git.
- Ao remover uma funcionalidade, remova também as variáveis e o schema dela.

## Cadastro e login

Fluxo mínimo de um SaaS:

| Tela ou etapa | Comportamento esperado |
|---|---|
| Cadastro | E-mail e senha de 8 ou mais caracteres (15 recomendado), sem exigir maiúscula, número ou símbolo, recusando senhas comuns e permitindo colar. Conta só fica ativa após verificar o e-mail |
| Verificação de e-mail | Link com token de uso único e validade curta |
| Login | Mensagem de erro genérica (não revela se o e-mail existe). Limite de tentativas |
| Esqueci a senha | Sempre responde "se o e-mail existir, enviamos o link". Token único e com validade |
| Login social (Google, GitHub…) | Opcional. Exige e-mail verificado pelo provedor. Cadastre as URLs de retorno de cada ambiente |
| Sair | Invalida a sessão no servidor |

- Sessão em cookie `Secure`, `HttpOnly` e `SameSite`, não em `localStorage`. Checklist completo antes de publicar: [../seguranca.md](../seguranca.md).
- Segredos de exemplo (`changethis`, `troque-isto`) fazem o app recusar subir fora do ambiente local.
- Use a autenticação da própria stack ou uma biblioteca mantida (Better Auth no [perfil web](../stacks/web.md), Supabase Auth, Clerk, ASP.NET Identity, FastAPI Users…). Nunca crie criptografia de senha própria. O Auth.js recomenda o Better Auth para projetos novos.
- Em desenvolvimento, os e-mails de verificação podem ser impressos no log do servidor. Em produção, use um provedor real (veja [arquivos-emails-tarefas.md](arquivos-emails-tarefas.md)).
- Se houver pagamento, o usuário precisa ter e-mail: o gateway exige.
- Crie um **seed** com usuários fictícios (comum, assinante, admin) para testar sem cadastrar na mão.

## Na stack web padrão: Better Auth

Conferido na documentação do Better Auth 1.7 em 2026-11-23. Confira de novo na versão instalada.

| Item da tabela acima | Como fazer no Better Auth |
|---|---|
| Conta ativa só após verificar o e-mail | `emailAndPassword.requireEmailVerification: true`. Com isso o cadastro responde igual para e-mail novo ou já usado (sem revelar quem tem conta); na configuração padrão ele responde erro 422 para e-mail existente |
| Senha | Mínimo padrão de 8 e máximo de 128 (`minPasswordLength`, `maxPasswordLength`). Senhas guardadas com `scrypt` |
| Recusar senhas vazadas | Plugin `haveIBeenPwned`: envia só os 5 primeiros caracteres do hash SHA-1 da senha ao serviço, nunca a senha |
| Limite de tentativas | Ligado por padrão só em produção: 100 requisições a cada 10 segundos por IP, e 3 a cada 10 segundos no login por e-mail e no 2FA. Guarda os contadores **em memória**: com mais de uma instância ou em serverless, use `rateLimit.storage: "database"` (e rode a migration) |
| IP correto atrás de proxy | Por padrão lê o `X-Forwarded-For`, que o cliente pode forjar. Atrás da Cloudflare, configure `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]`; atrás de proxy próprio, `trustedProxies` com os endereços exatos. O servidor só pode ser alcançado pelo proxy |
| 2FA | Plugin `twoFactor` (código por aplicativo autenticador e códigos de recuperação) |
| Admin | Plugin `admin`: papéis, banir, encerrar sessões. Primeiros admins por `adminUserIds`. **Personificação** (`impersonate-user`) dura 1 hora por padrão e não alcança outros admins; registre cada uso no log de auditoria e avise o usuário quando a política do produto exigir |
| Várias empresas | Plugin `organization`: veja [multiempresa.md](multiempresa.md) |

Chamadas feitas no servidor com `auth.api` não passam pelo limite de tentativas: não exponha uma rota própria que repasse login sem limite.

## Permissões

Três perguntas, sempre no servidor, no topo de cada operação:

1. **Está logado?** Se não, responde 401.
2. **Tem o papel ou plano necessário?** Admin, plano ativo, créditos. Se não, responde 403 (ou 402 quando faltam créditos ou pagamento).
3. **O dado é dele?** Toda consulta filtra pelo dono (`userId`) ou pela conta/empresa (`tenantId`). Buscar por ID sem checar o dono é falha grave: qualquer pessoa troca o ID e lê dados alheios.

Regras práticas:

- Telas protegidas redirecionam para o login, mas isso é só conforto. A operação do servidor repete a checagem.
- Admin: defina os primeiros administradores por variável de ambiente (`ADMIN_EMAILS`), aplicada **somente a e-mails verificados**. Depois, um admin pode promover outros pelo painel, numa operação que checa se quem pede é admin.
- Plano ativo: considere `ativo` e `em período de teste` como acesso liberado. `Pagamento atrasado` mostra aviso para atualizar o cartão.
- Para sistemas com várias empresas (multi-tenant), siga [multiempresa.md](multiempresa.md) e [licoes-de-producao.md](../licoes-de-producao.md).
- Escreva teste para cada fronteira: usuário sem login, usuário sem plano, usuário A tentando ler dado do usuário B, não-admin chamando operação de admin.

## Lições observadas no Open SaaS

- Bom exemplo: toda operação valida a entrada com schema e checa `user` e `isAdmin` no servidor.
- Cuidado: a operação que gera link de download de arquivo não confere o dono do arquivo. Em qualquer stack, **gerar link de arquivo exige checar se o arquivo pertence ao usuário**.
