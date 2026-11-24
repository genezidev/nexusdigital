# Perfil apps com IA

Para produtos em que a IA faz parte do trabalho: chat de atendimento, resumo de documentos, extração de dados de PDF ou foto, classificação, busca por significado, agente que executa tarefas.

## Stack recomendada

| Peça | Escolha | Versão conferida em 2026-11-22 | Por quê |
|---|---|---|---|
| Aplicação | [Perfil web](web.md) (Next.js + PostgreSQL) | | Telas, login e cobrança já resolvidos |
| Chamada aos modelos | AI SDK (`ai`) | 7.0.179 | Vários fornecedores com a mesma interface, streaming, ferramentas e saída estruturada |
| Busca por significado (RAG) | PostgreSQL com a extensão pgvector | conferir na hospedagem | Sem banco extra para manter |
| Python | SDK oficial do fornecedor dentro do [perfil Python](python.md) | | Quando o processamento já é Python |

Alternativa: SDK oficial de um fornecedor só (Anthropic, OpenAI e outros) quando o produto usa recursos específicos dele. Nomes de modelo, preços e limites mudam com frequência: confira na documentação do fornecedor no dia e registre a escolha com data em `contexto/DECISOES.md`.

## Criar o projeto

Crie o projeto do [perfil web](web.md) e acrescente o AI SDK com o pacote do fornecedor escolhido, com versão fixa:

```powershell
npm view ai dist-tags
npm install --save-exact ai@7.0.179
```

## Regras que não mudam

- **Chave só no servidor.** A chave do fornecedor fica em variável de ambiente da API. Nunca no navegador, no app mobile ou no desktop.
- **Custo sob controle.** Limite de uso por pessoa e por dia, tamanho máximo de resposta, alerta de gasto no painel do fornecedor e registro do consumo por conta. A pessoa decide o orçamento.
- **Saída da IA não é confiável.** Valide o formato (saída estruturada com esquema), nunca execute código ou SQL vindo do modelo e mostre a fonte quando responder com base em documentos.
- **Injeção de instruções.** Texto de documento, e-mail ou site lido pela IA pode trazer ordens escondidas. Ferramentas que o modelo chama têm permissão mínima, conferida no servidor, e ações que mudam dados, gastam dinheiro ou enviam mensagens pedem confirmação da pessoa.
- **Dados pessoais.** Mande ao modelo só o necessário, confira a política de retenção do fornecedor e cite o uso de IA na política de privacidade (LGPD).
- **Testes de qualidade.** Guarde de 20 a 50 exemplos reais (sem dados pessoais) com o resultado esperado e rode antes de trocar modelo, prompt ou fornecedor. Teste também o caso de erro: fornecedor fora do ar, limite atingido, resposta vazia.
- **Streaming** para respostas longas, com botão de parar.

## Publicar e operar

Siga `scaff-publicar` e `scaff-operar`. Acompanhe custo por dia e por cliente, taxa de erro e tempo de resposta. Plano pago com uso ilimitado de IA é risco de prejuízo: defina limites por plano.

## Fontes

- AI SDK: https://ai-sdk.dev/docs
- pgvector: https://github.com/pgvector/pgvector
- OWASP Top 10 para aplicações com LLM: https://genai.owasp.org/llm-top-10/
