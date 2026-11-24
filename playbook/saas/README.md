# Camadas de um SaaS

Use estes guias quando o produto tiver usuários com conta, planos pagos ou painel administrativo. Eles valem para qualquer stack. Os princípios vêm do Open SaaS (MIT, revisão `1793ce9`, nov/2026) e das lições de produção da base, adaptados para o Brasil.

## As camadas e a ordem de construção

| Ordem | Camada | Guia | Pronto quando |
|---|---|---|---|
| 1 | Configuração e segredos | [contas-e-acesso.md](contas-e-acesso.md#configuração-e-segredos) | O app não sobe com variável obrigatória faltando |
| 2 | Contas: cadastro, login, e-mail verificado, recuperação de senha | [contas-e-acesso.md](contas-e-acesso.md) | Fluxo completo testado de ponta a ponta |
| 3 | Permissões: usuário, plano e admin; várias empresas, se houver | [contas-e-acesso.md](contas-e-acesso.md#permissões) e [multiempresa.md](multiempresa.md) | Toda operação do servidor recusa quem não tem acesso (401/403) e uma empresa nunca vê dado de outra |
| 4 | Funcionalidade principal do produto | spec do projeto | Critérios de aceite da primeira entrega passam |
| 5 | Pagamentos, planos e créditos | [pagamentos.md](pagamentos.md) e [gateways/](gateways/README.md) | Compra, renovação, cancelamento e falha testados no sandbox |
| 6 | E-mails, arquivos e tarefas agendadas | [arquivos-emails-tarefas.md](arquivos-emails-tarefas.md) | Envio real em staging, upload limitado, tarefa com log |
| 7 | Painel admin, métricas e analytics | [admin-e-metricas.md](admin-e-metricas.md) | Admin vê usuários, receita e cadastros sem acessar o banco |
| 8 | Monitoramento: erros, disponibilidade, logs e alertas | [monitoramento.md](monitoramento.md) | Erro de teste e queda simulada chegam no Telegram |
| 9 | Página de vendas, SEO, privacidade, LGPD e lançamento | [lancamento.md](lancamento.md) e [lgpd.md](lgpd.md) | Checklist de lançamento completo e direitos do titular testados |

Construa uma camada por vez e verifique antes de seguir. A camada 4 vem antes do pagamento: primeiro prove que o produto funciona. Na stack web padrão ([stacks/web.md](../stacks/web.md)), contas, admin e várias empresas usam o Better Auth, como detalhado em cada guia.

## Organização do código: uma pasta por funcionalidade

Cada funcionalidade fica na própria pasta, com tudo que é dela: rotas, telas, operações do servidor, validação e as variáveis de ambiente que usa.

```
src/
  auth/        login, cadastro, e-mails de verificação
  payment/     planos, checkout, webhook, um subpasta por gateway
  file-upload/ upload, validação, armazenamento
  organization/ empresas, membros e convites (se houver várias empresas)
  admin/       painel, usuários, métricas
  user/        conta do usuário
  analytics/   coleta de métricas e tarefa diária
  landing-page/
  shared/      apenas o que é usado por duas ou mais funcionalidades
```

Vantagens: a IA encontra tudo de um assunto num lugar só, e remover uma funcionalidade é apagar a pasta e suas referências. Comece com todas as camadas planejadas e **remova o que o produto não usa** antes de lançar: código, variáveis e dependências.

## Regras que valem para todas as camadas

1. **Servidor decide, tela só ajuda.** Esconder botão é experiência; a proteção real é a checagem no servidor.
2. **Valide toda entrada** no servidor com um schema (Zod, Pydantic, FluentValidation…). Entrada inválida responde 400 com mensagem clara e log com detalhe.
3. **Cada gateway atrás de uma interface.** Pagamento, e-mail, armazenamento, analytics e IA têm um contrato do app e uma implementação por fornecedor. Trocar de fornecedor não mexe na regra de negócio.
4. **Desenvolvimento sem serviços pagos.** Cada integração tem modo local: e-mail impresso no log, pagamento em sandbox, armazenamento local ou MinIO, dados fictícios por seed.
5. **Documente cada variável** no `.env.example`: o que é, onde obter e se é obrigatória.

## Atalho para SaaS web: o próprio Open SaaS

Para quem quer um SaaS web em React/Node rapidamente, o template Open SaaS já entrega essas camadas prontas. Avalie antes de adotar:

- Depende do framework Wasp (versão 0.x, ainda evoluindo). Mudar de framework depois custa caro.
- No Windows, exige WSL. Gateways nativos são Stripe, Lemon Squeezy, Polar e Paddle; Pix e gateways brasileiros exigem uma implementação própria seguindo [pagamentos.md](pagamentos.md).
- E-mail nativo: SendGrid, Mailgun ou SMTP. Resend funciona via SMTP.

Registre a escolha em `contexto/DECISOES.md`. Detalhes e links em [catalogo/repositorios.md](../../catalogo/repositorios.md).
