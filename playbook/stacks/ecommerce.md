# Perfil e-commerce

Para vender produtos ou serviços pela internet. A primeira pergunta não é técnica: **a loja precisa de regras que as plataformas prontas não têm?**

## Escolher o caminho

| Situação | Caminho | Por quê |
|---|---|---|
| Vender produtos com catálogo, carrinho, frete e pagamento comuns | Plataforma pronta de loja virtual (brasileira ou internacional), configurada pela pessoa | Pagamento, frete, segurança e atualização já resolvidos; custo mensal ou por venda |
| Já tem site em WordPress | WooCommerce | Aproveita o site; exige manter WordPress e plugins atualizados |
| Regras próprias: marketplace com vários vendedores, assinatura com montagem de kit, preço por cliente, integração com sistema interno | Medusa + vitrine em Next.js | Back-end de loja aberto e programável |
| Vender um produto digital, curso ou assinatura simples | [Perfil web](web.md) com checkout do gateway | Não precisa de loja completa |

Recomendação para iniciante: plataforma pronta. Construir loja do zero só faz sentido quando a regra de negócio é o diferencial. Compare preços e taxas no site de cada plataforma, na data, e registre em `contexto/DECISOES.md`.

## Stack para loja própria

| Peça | Escolha | Versão conferida em 2026-11-22 |
|---|---|---|
| Back-end da loja | Medusa (Node.js, PostgreSQL) | 2.23.0 |
| Vitrine | Next.js, a partir do modelo de vitrine oficial do Medusa | 16.4.6 |
| Pagamento | Gateway de [saas/gateways/](../saas/gateways/) | |
| Loja em WordPress | WooCommerce | 11.3.1 |

```powershell
python scripts/conferir_versoes.py medusa
npx create-medusa-app@2.23.0 loja
```

**Licença:** o Medusa é MIT, exceto os recursos Enterprise (RBAC e SSO), que são proprietários. Não ative essas flags sem contrato (ver catálogo).

## Cuidados próprios de loja

- Preço e estoque conferidos no servidor no momento do pagamento, nunca o valor que veio do navegador.
- Pedido confirmado só pelo webhook do gateway validado e reconsultado ([saas/pagamentos.md](../saas/pagamentos.md)).
- Estoque reservado de forma atômica para duas pessoas não comprarem o último item.
- Frete, nota fiscal e impostos: normalmente vêm de serviços especializados; confirme as obrigações fiscais com um contador.
- Direito de arrependimento de 7 dias nas compras online (Código de Defesa do Consumidor), trocas e política de privacidade publicados ([saas/lancamento.md](../saas/lancamento.md)).
- Dados de cartão nunca passam pelo seu servidor: use o checkout ou os campos seguros do gateway.

## Fontes

- Medusa: https://docs.medusajs.com · licença Enterprise: https://github.com/medusajs/medusa/blob/develop/ENTERPRISE-LICENSE.md
- WooCommerce: https://woocommerce.com/documentation/
