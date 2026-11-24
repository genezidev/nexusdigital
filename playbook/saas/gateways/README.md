# Módulo de gateways de pagamento

Módulo pronto para o admin configurar **Greenn, Asaas, Stripe, Pagar.me, Mercado Pago e Efí** sem mexer no código: credenciais, modo teste, teste de conexão, webhook e taxas. Vale para qualquer stack.

- Campos, prefixos, URLs, eventos e dados de teste de cada gateway: [gateways.json](gateways.json). Gere a tela, a validação e o `.env.example` a partir dele.
- Princípios gerais de pagamento: [../pagamentos.md](../pagamentos.md).
- Pesquisa feita na documentação oficial em 2026-11-22. Itens marcados como "a confirmar" no JSON precisam de checagem antes de produção. A Greenn foi reconferida em 2026-11-23 na documentação OpenAPI.

## Como a IA deve implementar

1. **Tabela `payment_gateways`**: `id` (greenn, asaas…), `ativo` (só um por vez, garantido por índice único parcial ou transação), `sandbox`, `credenciais` (criptografadas), `taxas` (json), `atualizado_por`, `atualizado_em`. Em sistema multi-tenant, acrescente `tenant_id` e o índice vira "um ativo por tenant".
2. **Criptografia**: credenciais secretas cifradas com AES-256-GCM (chave em variável de ambiente `PAYMENT_CREDENTIALS_KEY`, fora do banco) ou `pgcrypto`. Nunca devolva segredo para a tela: a API responde só "credenciais salvas" e os 4 últimos caracteres.
3. **Contrato único** (`PaymentGateway`): `testarConexao()`, `criarCheckout(usuario, plano)`, `buscarCobranca(id)`, `buscarAssinatura(id)`, `cancelarAssinatura(id)`, `validarWebhook(req)`, `interpretarWebhook(req)` e `urlPortalCliente()` quando houver. Um adaptador por gateway, como em [../pagamentos.md](../pagamentos.md).
4. **Fábrica**: lê o gateway ativo do banco (com cache curto) e devolve o adaptador. Variáveis de ambiente servem de valor inicial: o botão "Importar do ambiente" copia `GATEWAY_*` para o banco cifrado.
5. **Uma rota de webhook por gateway**: `/api/webhooks/{id}`. Cada rota valida a origem do jeito do gateway, **reconsulta a cobrança/assinatura na API** e só então aplica o efeito com idempotência (tabela de eventos processados). Webhook de gateway inativo responde 2xx e só registra.
6. **Permissões e auditoria**: só admin acessa. Salvar, ativar e testar ficam no log de auditoria (quem, quando, qual gateway, sem os segredos).
7. **Segredo na URL** (Pagar.me e o `hmac` da Efí): o OWASP ASVS (V14.2.1) proíbe segredo em URL porque ele vai parar em logs. Use só porque esses gateways não oferecem assinatura no cabeçalho, e compense: segredo aleatório de 32 bytes ou mais, comparação em tempo constante, query string removida dos logs do proxy e do app, troca do segredo se ele aparecer em algum log, e reconsulta na API sempre (passo 5).

## Tela de configuração

**Grade de cards**, um por gateway: sigla, nome, descrição curta, selos de métodos (Pix, Cartão, Boleto) e status:
- `Não configurado`: sem credenciais.
- `Configurado`: credenciais salvas, gateway inativo.
- `Ativo · Conectado`: gateway ativo e último teste de conexão aprovado (mostre a data do teste).
- `Ativo · Falha`: gateway ativo, mas o último teste falhou.

**Modal "Configurar"**, gerado a partir dos `campos` do JSON:
- Campos secretos como senha, com o placeholder do prefixo esperado (`sk_test_…`). Valide o prefixo ao salvar.
- **Modo sandbox**: quando `detectar_pela_chave` for `true`, o modo é deduzido do prefixo, e a tela avisa se a chave não bate com o modo escolhido. Quando for `false` (Mercado Pago, Efí), o admin marca manualmente.
- Bloco **Webhook** só de leitura: URL pronta para copiar (com o `{URL_PUBLICA}` real do ambiente), onde cadastrar e a lista de eventos a marcar. Botão para gerar o segredo quando `gerado_pelo_app` for `true`.
- **Taxas** (Pix %, Cartão %, Cartão valor fixo, Boleto %, Boleto valor fixo): usadas só para relatórios de valor líquido. Mostre apenas os campos dos métodos que o gateway oferece.
- Botões **Testar conexão** (chama `testarConexao()` e mostra o ambiente detectado), **Salvar** e **Ativar este gateway** (pede confirmação e desativa o anterior).
- Banner "Detectamos `X` no ambiente" com **Importar do ambiente**, quando houver variável correspondente.

## Conferência das telas enviadas (2026-11-22)

| Gateway | O que está certo | O que corrigir |
|---|---|---|
| Greenn | Token de API (Bearer, prefixo `grn_live_`), métodos Cartão e Pix | **Sem sandbox** na API pública v1: troque o checkbox por um aviso de "teste com compra real de valor baixo e reembolso". **Webhook**: em 2026-11-23 a documentação OpenAPI passou a dizer que todo webhook leva o header `X-Webhook-Token` com o Webhook Token do vendedor: valide-o (comparação em tempo constante) e reconsulte a venda em `GET /sales/{id}`. Acrescente **Boleto**. **Seller ID** é opcional. Falta o **link de checkout por plano**: a API pública não cria cobranças (criar venda por API exige a API Pagamento v2, com onboarding) |
| Asaas | API Key, sandbox, métodos e taxas | Falta o **Token do webhook** (32 a 255 caracteres, enviado no header `asaas-access-token`). O modo sandbox deve bater com o prefixo `$aact_hmlg_` / `$aact_prod_` |
| Stripe | Secret, Publishable e Webhook Secret | Acrescente **Boleto** (suportado em conta brasileira). A lista de eventos só com `payment_intent.*` é insuficiente para Checkout e assinaturas: use a lista do JSON. Sandbox deduzido do prefixo `sk_test_` / `sk_live_` |
| Pagar.me | Secret Key, Public Key, métodos, eventos `charge.paid`, `charge.payment_failed`, `charge.refunded` | **`charge.canceled` não existe** na lista oficial: use `charge.partial_canceled`, `charge.chargedback` e os eventos `order.*`, `invoice.*` e `subscription.*`. Falta proteção do webhook: segredo na URL e reconsulta da cobrança. Sandbox deduzido do prefixo `sk_test_` |
| Mercado Pago | Access Token, Public Key, Webhook Secret, checkbox de sandbox (necessário: teste e produção usam `APP_USR-`) | Explique que a assinatura secreta não cobre QR e assinaturas configurados em Suas integrações; nesses casos, reconsulte o pagamento |
| Efí | Client ID, Client Secret, Chave Pix, certificado .p12, credenciais separadas por ambiente | **Payee Code não é opcional quando houver cartão** (é o "Identificador de conta"). O cadastro automático do webhook Pix é algo que **o app faz** chamando `PUT /v2/webhook/{chave}`; o servidor precisa de mTLS ou, sem ele, segredo HMAC na URL, lista de IPs e reconsulta. Certificado exigido só na API Pix |
| Todas | — | As telas mostram o domínio de um projeto real. Na base, use sempre `{URL_PUBLICA}/api/webhooks/{gateway}` |

## Testes obrigatórios de cada adaptador

- [ ] Testar conexão com credencial válida e inválida (mensagem clara, sem expor a chave)
- [ ] Checkout no sandbox: pagamento aprovado, recusado e pendente (dados de teste no JSON)
- [ ] Webhook com origem inválida responde 401 e não altera nada
- [ ] Webhook repetido não duplica créditos nem pagamentos
- [ ] Trocar o gateway ativo não afeta assinaturas já existentes no gateway anterior (os webhooks dele continuam sendo processados)
- [ ] Credenciais aparecem cifradas no banco e mascaradas na tela

## Fontes oficiais

- Greenn: [Documentação OpenAPI](https://apiadm.greenn.com.br/docs/api) (conferida em 2026-11-23), [API](https://greenn.com.br/ajuda/vendo/api/), [Webhook](https://greenn.com.br/ajuda/vendo/webhook/), [Webhook 2.0](https://greenn.com.br/ajuda/vendo/como-integrar-com-webhook-20/)
- Asaas: [Autenticação](https://docs.asaas.com/docs/autentica%C3%A7%C3%A3o-1), [Sandbox](https://docs.asaas.com/docs/sandbox), [Webhooks](https://docs.asaas.com/docs/about-webhooks), [Criar webhook](https://docs.asaas.com/reference/create-new-webhook), [Cartões de teste](https://docs.asaas.com/docs/testando-pagamento-com-cart%C3%A3o-de-cr%C3%A9dito)
- Stripe: [Pix](https://docs.stripe.com/payments/pix), [Boleto](https://docs.stripe.com/payments/boleto), [Chaves](https://docs.stripe.com/keys), [Webhooks](https://docs.stripe.com/webhooks), [Eventos de assinatura](https://docs.stripe.com/billing/subscriptions/webhooks), [Fulfillment](https://docs.stripe.com/checkout/fulfillment)
- Pagar.me: [Autenticação](https://docs.pagar.me/reference/autentica%C3%A7%C3%A3o-2), [Eventos de webhook](https://docs.pagar.me/reference/eventos-de-webhook-1), [Simulador de cartão](https://docs.pagar.me/docs/simulador-de-cart%C3%A3o-de-cr%C3%A9dito), [Simulador Pix](https://docs.pagar.me/docs/simulador-pix)
- Mercado Pago: [Credenciais](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials), [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks), [Testes](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/test), [Pix](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix)
- Efí: [Credenciais Pix](https://dev.efipay.com.br/docs/api-pix/credenciais), [Webhooks Pix](https://dev.efipay.com.br/docs/api-pix/webhooks), [Credenciais Cobranças](https://dev.efipay.com.br/docs/api-cobrancas/credenciais), [Cartão](https://dev.efipay.com.br/docs/api-cobrancas/cartao), [Notificações](https://dev.efipay.com.br/docs/api-cobrancas/notificacoes), [Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas)
