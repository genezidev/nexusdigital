# Pagamentos, planos e créditos

## Escolha do gateway

| Situação | Opções comuns | Observação |
|---|---|---|
| Clientes no Brasil, Pix, boleto e cartão | Asaas, Mercado Pago, Stripe (conta brasileira), Pagar.me, Iugu | Confirme na documentação atual: assinatura recorrente, Pix Automático, taxas, split |
| Clientes no exterior, cartão | Stripe, Paddle, Lemon Squeezy, Polar | Paddle, Lemon Squeezy e Polar atuam como revendedores e cuidam de impostos internacionais |
| Produto digital vendido por plataforma | Hotmart, Kiwify, Greenn | Normalmente só webhook; o painel de assinatura fica na plataforma |

Registre a escolha em `contexto/DECISOES.md`. Comece sempre no **sandbox** do gateway.

Para Greenn, Asaas, Stripe, Pagar.me, Mercado Pago e Efí já existe um módulo pronto com tela de configuração, campos, webhooks e dados de teste: [gateways/README.md](gateways/README.md).

## Arquitetura: uma interface, um adaptador por gateway

O app define o próprio contrato de pagamento. Cada gateway implementa esse contrato numa pasta própria (`payment/asaas/`, `payment/stripe/`…). Só um fica ativo.

Contrato mínimo:

| Operação | O que faz |
|---|---|
| Criar checkout | Recebe usuário e plano, devolve link de pagamento ou dados para checkout na própria página |
| Portal do cliente | Devolve link para o cliente trocar cartão, ver faturas ou cancelar (ou `null` se o gateway não tiver) |
| Buscar estado da assinatura | Consulta o gateway e devolve status, plano, fim do período e se cancela no fim do período |
| Receber webhook | Valida a assinatura do evento e aplica os efeitos |
| Receita total | Para o painel admin |

## Planos no código

- Os planos são definidos **no app**, cada um com um efeito: `assinatura` ou `créditos` (com a quantidade).
- O ID do produto/preço em cada gateway fica em variável de ambiente (sandbox e produção têm IDs diferentes). Uma função converte o ID do gateway no plano do app e vice-versa.
- Status de assinatura padronizados: `ativa`, `em teste`, `atrasada`, `pausada`, `cancelada`. Cada adaptador traduz os status do seu gateway para esses.
- O usuário guarda uma **cópia** do estado: ID do cliente no gateway, status, plano, fim do período, cancelamento agendado, data do último pagamento, créditos.

## Webhooks: as regras que evitam prejuízo

1. **Valide a assinatura** do webhook com o segredo do gateway. Muitos gateways exigem o corpo bruto da requisição para isso: desative o parser de JSON só nessa rota.
2. **O gateway é a fonte da verdade da assinatura.** Eventos chegam atrasados, repetidos ou fora de ordem. Então, a cada evento que mexe em assinatura, **busque o estado atual no gateway e sobrescreva a cópia** do usuário, em vez de montar o estado a partir do evento.
3. **Pagamentos e créditos são processados uma única vez.** Guarde o ID de cada evento de pagamento numa tabela com índice único **antes** de aplicar o efeito. Se o ID já existe, ignore. Se o processamento falhar, apague o registro e devolva erro para o gateway tentar de novo.
4. **Evento que o app não trata responde 2xx** (com log). Responder erro faz o gateway reenviar para sempre.
5. **Ao voltar do checkout**, sincronize a assinatura imediatamente. O usuário costuma chegar antes do webhook.
6. Cadastre no painel do gateway **exatamente os eventos** que o código trata, apontando para a URL de produção (`https://seu-dominio/.../webhook`).
7. Teste com a ferramenta do gateway (por exemplo, `stripe listen` e `stripe trigger`, ou o simulador do sandbox): pagamento aprovado, recusado, renovação, cancelamento, evento repetido.

## Créditos e recursos caros (IA, SMS, processamento)

- Para quem não tem plano, cobre um crédito por uso.
- **Reserve o crédito antes** de chamar o serviço caro, com uma atualização condicional atômica ("diminua 1 onde créditos > 0"). Se nada foi atualizado, responda 402. Isso impede que requisições simultâneas gastem créditos que não existem.
- Se a chamada falhar depois, devolva o crédito.

## Antes de ir para produção

- [ ] Chaves e IDs de produção configurados no servidor (não os de sandbox)
- [ ] Versão da API do gateway igual à da biblioteca usada
- [ ] Webhook de produção criado, com os eventos certos e o segredo no servidor
- [ ] Compra real de valor baixo feita e estornada
- [ ] E-mails de pagamento aprovado, falha e cancelamento funcionando
