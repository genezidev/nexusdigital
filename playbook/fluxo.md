# Spec, harness e continuidade

O repositório é a memória operacional. O Codex e o Claude Code têm históricos próprios. Para transferir o trabalho, abra a mesma revisão e entregue `contexto/HANDOFF.md` com a spec ativa e a evidência das verificações. Informações locais de IDE ficam fora do Git.

## Do pedido à primeira entrega

1. Leia o briefing, extraia atores, jornada, entidades, dados sensíveis, integrações, destino e as lacunas que mudam o projeto. Pergunte só o que muda arquitetura, dados, permissões, testes ou publicação, no máximo cinco perguntas por rodada, uma por vez. Cada pergunta é uma frase completa em linguagem simples, com uma linha de "por que importa", a opção recomendada primeiro e de duas a cinco alternativas (ou resposta curta). Grave cada resposta na spec. Use suposições reversíveis para o restante e anote-as em "Suposições".
2. Preencha a spec com escopo, interface, contrato, estados, dados, critérios Given/When/Then ou equivalentes e condições de publicação. Registre decisão de arquitetura com contexto, alternativas consideradas e consequências quando ela for cara de reverter, no modelo de `contexto/DECISOES.md`.
3. Defina a menor fatia que passa da interface ao dado ou integração. Registre dependências e arquivos esperados. Configure os comandos reais de lint, testes e build em `quality/checks.json`. Para mudança pequena, use uma spec curta com um critério.
4. Execute um ciclo implementar → executar → ler falha → corrigir → verificar. Reproduza falhas antes de refatorar. Falhas repetidas com a mesma causa pedem evidência nova ou uma alternativa. Atualize o handoff em cada marco recuperável.
5. Antes de dar a entrega por concluída, releia a spec item por item (histórias, critérios, casos-limite, decisões) e compare com o código atual. O que faltar vira tarefa nova no handoff; não reescreva a spec para caber no que foi feito. Detalhes em [revisao.md](revisao.md).
6. Valide critérios em ambiente com dados de teste. Mostre a mudança, o que foi verificado e o que depende de acesso, dispositivo ou serviço externo. Faça PR quando o fluxo do projeto pedir. A decisão de publicação segue a autorização e o plano do ambiente.

## Contexto e automação

- Hierarquia de leitura: regras curtas → handoff → spec → diretórios afetados → referência especializada. Links e inventários são consultados por busca, conforme a tarefa. Evite listas repetidas de regras em cada projeto.
- Documentação de biblioteca, nesta ordem: a que vem com a versão instalada (como `node_modules/next/dist/docs/`), a documentação oficial da versão travada no projeto e, por último, um serviço de busca como o Context7 (ver `catalogo/repositorios.md`). Nunca coloque segredo, dado pessoal ou código privado na pergunta enviada a serviço externo, e confira na fonte oficial o que vier de documentação mantida pela comunidade.
- Tamanho do planejamento: mudança pequena e clara vai direto para a implementação com um critério. Spec completa quando a entrega tem várias telas ou dados novos. PRD separado só quando mais de uma pessoa precisa aprovar o produto, a partir de [modelos/PRD.md](../modelos/PRD.md).
- `AGENTS.md` guarda só o que o agente não descobre lendo o projeto: regras que o código não expressa (pastas proibidas, segredos, publicação), convenções que fogem do padrão da stack, comandos cujo jeito óbvio está errado e erros que já aconteceram. Não copie árvore de pastas, lista de stack ou scripts do `package.json`: ficam velhos. Se uma regra pode virar checagem automática, prefira a checagem. Em monorepo, um `AGENTS.md` dentro de cada parte (`app/`, `api/`, `mobile/`) vale para os arquivos dela; o mais próximo do arquivo editado vence, e o pedido no chat vence todos.
- O harness é o conjunto de regras, ferramentas, testes, permissões e persistência que fecha o ciclo. Scripts determinísticos resolvem inicialização, inventário e verificação. Agentes resolvem decisões de design, integração e interpretação de falhas.
- Um implementador por conjunto de arquivos. Se houver delegação autorizada, use revisões independentes ou tarefas com fronteiras sem sobreposição. Integre e rode as checagens na mesma revisão.
- Trabalho longo fica dividido por critério e checkpoint. Um turno novo lê o último estado, verifica o que mudou desde o commit registrado, repete apenas checagens que ficaram inválidas e prossegue.
- Decisões de estrutura viram checagem quando a stack tiver ferramenta: sem importação circular, domínio sem depender de interface ou infraestrutura, código de produção sem usar dependência de desenvolvimento. Em JavaScript/TypeScript, use o dependency-cruiser (ver `catalogo/repositorios.md`) e coloque o comando em `quality/checks.json`. Ative a regra quando houver código para proteger, não no projeto vazio.
- Rotinas de CI e scripts devem ter um limite de tempo, sinalizar falha por status de saída e funcionar a partir de ambiente reproduzível. O runner local usa comandos em listas de argumentos e não chama shell por padrão.
- GitHub Actions começa validando o próprio kit. Depois do bootstrap, acrescente o job de build/teste próprio da stack, sem acesso a segredos no PR. Fixe ações externas por SHA de commit revisado, nunca por tag ou `latest`: tags podem ser redirecionadas para código malicioso, como aconteceu com a `trivy-action` em março de 2026. Agente de IA no CI segue [varreduras.md](varreduras.md). Ative entrega em produção após validar staging e restauração.

## Configurar o runner

Em `quality/checks.json`, liste somente comandos que fazem sentido para a stack. Cada check tem `nome`, `args`, `diretorio` opcional e `timeout` em segundos. Exemplo de um projeto com testes Python instalados no ambiente ativo:

```json
{"checks":[{"nome":"Testes de domínio","args":["python","-m","pytest","-q"],"diretorio":".","timeout":90}]}
```

Use `python scripts/verificar.py` para conferir a configuração ou `python scripts/verificar.py --executar` para rodar as checagens. Disponibilize as dependências da stack no CI antes de rodar essa etapa. Em Windows, use executáveis diretos, como `python`, `dotnet` ou `node` com a CLI local, e mantenha a configuração multiplataforma quando o projeto precisar rodar no Linux.

## Fontes de configuração

- [Instruções AGENTS.md no Codex](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Skills no Codex](https://learn.chatgpt.com/docs/build-skills)
- [Skills no Claude Code](https://code.claude.com/docs/en/skills)
- [CLAUDE.md e imports](https://code.claude.com/docs/en/memory)
- [Formato AGENTS.md](https://agents.md)
- [Permissões e dependências no GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use)
