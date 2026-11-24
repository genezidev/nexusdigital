# Entrevista para quem não programa

Quem tem a ideia raramente sabe dizer "stack", "multi-tenant" ou "webhook", e não precisa. O agente faz as perguntas em linguagem do dia a dia e traduz as respostas para a spec.

## Como conduzir

- Uma pergunta por vez, no máximo cinco por rodada. Comece pelo que já está no briefing e pergunte só o que falta e muda o projeto.
- Cada pergunta leva um exemplo concreto e uma linha de "por que importa". Nada de jargão; se precisar de um termo técnico, explique numa frase.
- "Não sei" é resposta válida: use a recomendação padrão da tabela, anote em "Suposições" da spec e siga.
- Ofereça opções quando der, com a recomendada primeiro.
- Nunca peça senha, chave, token ou dado real de cliente. Para exemplos, use dados inventados.
- No fim, devolva um resumo de cinco a dez linhas em linguagem simples e peça confirmação antes de escrever a spec.

## Banco de perguntas

| Tema | Pergunta em linguagem simples | Por que importa | Se a resposta for "não sei" |
|---|---|---|---|
| Problema | Que problema isso resolve, e para quem? Conte um caso real. | Define o objetivo e o que medir. | Escrever o objetivo a partir do briefing e confirmar no resumo. |
| Quem usa | Quem vai usar? Por exemplo: o cliente, a equipe, só você. Cada um pode ver e fazer coisas diferentes? | Define atores e permissões. | Dois papéis: quem administra e quem usa. |
| Tarefa principal | Qual é a coisa mais importante que a pessoa faz no sistema, do começo ao fim? | Vira a história P1, a primeira entrega. | A tarefa mais citada no briefing. |
| Onde usa | A pessoa usa no navegador do computador, no celular, num app instalado? Precisa funcionar sem internet? | Escolhe o perfil (web, mobile, desktop). | Site que funciona bem no celular (sem loja de apps). App de loja só se precisar de câmera, notificação, uso sem internet ou presença na loja. |
| Dados | Que informações o sistema guarda? Tem CPF, endereço, saúde, dados de crianças, documentos? | Dados pessoais pedem cuidados de LGPD e segurança. | Guardar só o mínimo para a tarefa principal. |
| Empresas | Várias empresas ou clientes vão usar, cada um vendo só os próprios dados? | Separação entre empresas muda o banco desde o início. | Uma empresa só; anotar como suposição, porque mudar depois custa caro. |
| Dinheiro | O sistema cobra alguém? Assinatura mensal, pagamento avulso, Pix? | Pagamento traz gateway, impostos e regras de cancelamento. | Primeira entrega sem cobrança; pagamento entra numa fatia própria. |
| Conexões | Precisa conversar com outro sistema? WhatsApp, e-mail, planilha, sistema que você já usa? | Cada integração é um risco e às vezes um custo. | Nenhuma na primeira entrega. |
| Tamanho | Quantas pessoas devem usar no primeiro mês? E daqui a um ano? | Dimensiona hospedagem e custos. | Poucas dezenas no início. |
| Prazo e orçamento | Tem data para estar no ar? Quanto pode gastar por mês com hospedagem e serviços? | Limita escolhas e mostra o que cabe na primeira entrega. | A opção mais barata que atende, com o custo mostrado antes de contratar. |
| Quem cuida | Depois de pronto, quem vai manter: você, alguém da equipe, ninguém técnico? | Favorece soluções mais simples de operar. | Você mesmo, com ajuda do agente: priorizar o simples. |
| Referências | Tem algum sistema ou app parecido de que você gosta ou não gosta? | Orienta o design e evita surpresas. | Definir a identidade na etapa de design, partindo dos exemplos de `design/DESIGN.md`. |

## Depois da entrevista

1. Preencha `contexto/PROJETO.md` e a spec (`specs/<id>/spec.md`) com histórias por prioridade e `[PRECISA ESCLARECER]` no que ainda faltar.
2. Se mais de uma pessoa precisar aprovar o produto (sócio, cliente, investidor), preencha também `contexto/PRD.md` a partir de [modelos/PRD.md](../modelos/PRD.md).
3. Com login, pagamento, dados pessoais ou várias empresas, preencha a exposição e os atores de `contexto/MODELO-DE-SEGURANCA.md`.
4. Siga para a arquitetura (`scaff-arquitetura`).
