# Plugins e MCPs para quem está começando

A base já funciona sem nada disto. Cada extra dá uma capacidade nova ao agente, mas custa: ocupa contexto, pode gastar mais da sua cota e é código de terceiros rodando no seu computador. Instale **um de cada vez, só quando sentir a falta**, e desligue o que não usar. Conferido em 2026-11-23.

## A lista curta

| O que | Para quê | Custo e riscos | Como ativar |
|---|---|---|---|
| Estilo **Learning** ou **Explanatory** (já vem no Claude Code) | O agente explica as escolhas (Explanatory) ou pede que você escreva trechos marcados com `TODO(human)` (Learning). Ótimo para aprender | Respostas maiores, mais uso da cota | `/output-style explanatory` ou `/output-style learning`; volte com `/output-style default` |
| **Verificador de tipos** (`typescript-lsp`, `pyright-lsp`) | O agente vê erros de tipo enquanto edita, antes de rodar | Exige instalar o servidor de linguagem; pouco custo de contexto | Ver abaixo |
| **Playwright** (testes e navegador) | O agente abre o app no navegador, clica e confere a tela | Baixa navegadores (bastante disco); o MCP gasta mais contexto que a CLI | Ver abaixo |
| **Context7** (documentação atual) | Consulta a documentação da versão certa de uma biblioteca | Serviço externo: nunca mande segredo, dado pessoal ou código privado na pergunta | Opcional; a base já manda ler a documentação da versão instalada primeiro |

Com o Claude Code, a forma mais simples é o marketplace oficial: digite `/plugin`, aba **Discover**, ou `/plugin install <nome>@claude-plugins-official`. Para listar e desligar: `/plugin`, aba **Installed**. Instale com escopo **local** ou **user** enquanto testa; o escopo **project** grava no repositório e passa a valer para todos que abrirem o projeto.

No Codex, plugins ficam em `/plugins` (só na linha de comando e no app, não na extensão do VS Code) e MCPs entram com `codex mcp add <nome> -- <comando>`.

## Verificador de tipos

- **TypeScript** (projetos web, Expo, Electron): o plugin `typescript-lsp` precisa de `typescript-language-server` e `typescript` instalados no computador. **Atenção**: o TypeScript 7 (versão `latest` do npm desde novembro de 2026) não traz mais o `tsserver`, que esse servidor usa. Instale a última 6.x até o plugin se adaptar:
  ```powershell
  npm install -g typescript-language-server@6.1.0 typescript@6.0.3
  ```
- **Python**: o plugin `pyright-lsp` precisa do Pyright: `npm install -g pyright@1.1.414` (ou `uv tool install pyright`).
- Depois: `/plugin install typescript-lsp@claude-plugins-official` ou `pyright-lsp@claude-plugins-official`.

## Playwright

- **Preferido**: a CLI do Playwright para agentes (`@playwright/cli`, 0.1.25), que gasta menos contexto que o MCP, segundo a própria Microsoft.
- **MCP** quando quiser que o agente explore telas por bastante tempo. O plugin `playwright` do marketplace roda `@playwright/mcp@latest` sem versão fixa e com perfil de navegador persistente. Prefira adicionar à mão com versão fixa e perfil isolado:
  ```powershell
  claude mcp add playwright -- npx @playwright/mcp@0.0.86 --isolated
  ```
  No Codex: `codex mcp add playwright -- npx @playwright/mcp@0.0.86 --isolated`.
- Nunca conecte o Playwright ao seu navegador pessoal com contas logadas. Mais cuidados no [catálogo](../catalogo/repositorios.md).

## Antes de instalar qualquer outro

- Siga a checklist de [playbook/varreduras.md](../playbook/varreduras.md): quem publicou, licença, o que o plugin roda e que acesso pede.
- Plugins de terceiros não são verificados pela Anthropic nem pela OpenAI.
- Desconfie de plugin que roda algo a cada mensagem ou a cada commit: ele consome cota o tempo todo.
- Processos completos de terceiros (Spec Kit, BMAD, Superpowers, `feature-dev`) disputam as mesmas etapas das skills `scaff-*`: não use os dois na mesma etapa.
- Para ver o custo: `/context` mostra quanto cada MCP e plugin ocupa; `/mcp` liga e desliga servidores. Ferramentas de MCP no Claude Code só entram inteiras no contexto quando são usadas, mas nomes e instruções de cada servidor ficam sempre lá.

## Fontes

- Plugins do Claude Code: https://code.claude.com/docs/en/discover-plugins · MCP: https://code.claude.com/docs/en/mcp · estilos: https://code.claude.com/docs/en/output-styles · custos: https://code.claude.com/docs/en/costs
- Marketplace oficial (revisão `73c8cf3`): https://github.com/anthropics/claude-plugins-official
- Codex: plugins https://developers.openai.com/codex/plugins · MCP https://developers.openai.com/codex/mcp
