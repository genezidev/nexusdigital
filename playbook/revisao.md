# Verificação, revisão e depuração

Use antes de dizer que algo está pronto, ao revisar uma mudança e ao investigar uma falha.

## Evidência antes de afirmar

Só diga "passou", "corrigido" ou "pronto" depois de rodar agora o comando que prova e ler a saída inteira (código de saída e número de falhas).

| Afirmação | Prova necessária | Não basta |
|---|---|---|
| Testes passam | Saída do teste com 0 falhas, nesta revisão | Execução antiga, "deve passar" |
| Build funciona | Comando de build com saída 0 | Lint passando |
| Bug corrigido | O sintoma original reproduzido antes e ausente depois | Código alterado |
| Requisito atendido | Conferência item por item com a spec | Testes verdes |
| Subagente ou outra sessão concluiu | O diff e as checagens conferidos por você | O relatório dele |
| Publicado | A URL ou o app respondendo como esperado | O comando de deploy terminou |

Se não deu para verificar (falta acesso, dispositivo ou credencial), diga exatamente o que ficou sem prova.

## Revisar uma mudança

Faça três passadas, nesta ordem:

1. **Casos não tratados**: percorra cada caminho que a mudança cria ou altera (condições, laços, erros, retornos antecipados, valores vazios, limites, chamadas concorrentes) e liste só os que ficaram sem tratamento. Se a mudança trata um valor de um conjunto (status, tipo, papel), confira os outros valores do conjunto.
2. **Lacuna de teste**: para cada comportamento alterado, nomeie a regressão mais provável (condição invertida, campo omitido, erro antigo devolvido) e confira se algum teste falharia. Se nenhum falharia, peça um teste específico. Teste desativado, instável ou que não confere o resultado não conta.
3. **Promessas do plano**: só agora leia a spec ou o plano e confira se o código faz o que eles dizem. O plano é o que a mudança diz de si mesma, não prova.

Se a mudança apagou código, pergunte o que aquele código garantia e se isso continua garantido.

## Testes de ponta a ponta na web

Use Playwright Test (`npm init playwright@latest`) para provar as jornadas da spec no navegador.

- Encontre elementos como o usuário vê: `getByRole('button', { name: 'Salvar' })`, `getByLabel('E-mail')`. Evite seletores de CSS que quebram com qualquer mudança visual.
- Nada de esperas fixas (`waitForTimeout`): o Playwright espera o elemento ficar pronto e repete as asserções sozinho.
- Login reaproveitado entre testes fica em `playwright/.auth/`, que está no `.gitignore`: o arquivo guarda cookies de sessão.
- Ative `trace: 'on-first-retry'` e abra a falha com `npx playwright show-trace` antes de mudar o teste.
- Os agentes do Playwright (`npx playwright init-agents --loop=claude` ou `--loop=codex`) planejam, geram e consertam testes. O "healer" pode mudar a asserção ou marcar o teste como pulado quando acha que a funcionalidade está quebrada: revise o diff dele, e teste pulado conta como critério não comprovado.

## Depurar

1. Reproduza a falha e leia a mensagem inteira antes de mudar qualquer coisa.
2. Encontre a causa: o que mudou, onde o dado errado nasce, que exemplo parecido funciona.
3. Teste uma hipótese por vez, com a menor mudança possível.
4. Corrija a causa, não o sintoma, e prove com um teste que falhava antes.
5. Três correções seguidas sem resolver: pare e questione a abordagem ou a arquitetura com o usuário antes da quarta.

Registre a causa e a prova no handoff.

## Fontes

Princípios reescritos a partir de [Superpowers](https://github.com/obra/superpowers) (MIT), [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) (MIT) e [Spec Kit](https://github.com/github/spec-kit) (MIT). Testes web: [documentação do Playwright](https://playwright.dev) (Apache-2.0). Detalhes em `catalogo/repositorios.md`.
