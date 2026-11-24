# Instalar as ferramentas

Faça uma vez por computador. Conferido nas páginas oficiais em 2026-11-23; as versões mudam, então instale sempre a mais recente estável que o site oficial mostrar. Se algo der errado, copie a mensagem de erro inteira e cole para o agente.

## O que você vai precisar

| Ferramenta | Para quê | Obrigatória? |
|---|---|---|
| Uma assinatura do agente | Claude (Pro, Max ou superior; o plano gratuito não inclui o Claude Code) ou ChatGPT com Codex | Sim, pelo menos uma |
| Claude Code ou Codex | O agente que constrói o sistema | Sim, pelo menos um |
| Python 3.11 ou mais novo | Rodar os scripts da base (criar projeto, verificar) | Sim |
| Git | Guardar o histórico do projeto e voltar atrás | Sim |
| VS Code | Ver e abrir os arquivos com conforto | Recomendado |
| Node.js LTS | Projetos web, mobile com Expo e várias ferramentas | Quando o projeto pedir |
| GitHub CLI (`gh`) | Repositório no GitHub, pull requests | Quando for usar GitHub |

Requisitos mínimos do Claude Code: Windows 10 versão 1809 ou mais novo (ou macOS 13+), 4 GB de memória.

## Windows

Abra o **PowerShell** (menu Iniciar, digite "PowerShell"). O `winget` já vem no Windows 10 e 11 atualizados. Rode um comando por vez:

```powershell
winget install --id Git.Git -e --source winget
```

```powershell
winget install --id Microsoft.VisualStudioCode -e --source winget
```

```powershell
winget install --id OpenJS.NodeJS.LTS -e --source winget
```

```powershell
winget install --id GitHub.cli -e --source winget
```

**Python**: o caminho oficial agora é o "Python install manager". Instale-o e depois peça a versão estável mais recente:

```powershell
winget install 9NQ7512CXL7T -e --accept-package-agreements --disable-interactivity
```

```powershell
py install 3.15
```

**Claude Code** (instalador oficial, atualiza sozinho):

```powershell
irm https://claude.ai/install.ps1 | iex
```

**Codex**: baixe o app do ChatGPT para Windows na página oficial do Codex, ou instale a linha de comando (precisa do Node.js acima):

```powershell
npm install -g @openai/codex
```

Feche e abra o PowerShell de novo para os comandos novos aparecerem.

## Mac

Instale o Homebrew pelo site oficial (https://brew.sh) e depois, no Terminal:

```bash
brew install git node gh
brew install --cask visual-studio-code claude-code
```

Python: baixe o instalador "Python for macOS" mais recente em https://www.python.org/downloads/. Claude Code também pode ser instalado com `curl -fsSL https://claude.ai/install.sh | bash` (este atualiza sozinho; o do Homebrew atualiza com `brew upgrade`). Codex: app do ChatGPT para Mac ou `curl -fsSL https://chatgpt.com/codex/install.sh | sh`.

## Conferir se deu certo

Rode cada linha; todas devem mostrar um número de versão:

```powershell
git --version
```

```powershell
python --version
```

```powershell
node --version
```

```powershell
claude --version
```

Se o Claude Code der problema, `claude doctor` faz um diagnóstico sem mudar nada. Depois rode `claude` e faça o login com sua conta.

## Primeiros ajustes

- **Git**: diga seu nome e e-mail para o histórico: `git config --global user.name "Seu Nome"` e `git config --global user.email "seu@email"`.
- **VS Code**: instale a extensão **Claude Code** (`anthropic.claude-code`) ou **Codex** (`openai.chatgpt`) pela aba de extensões (`Ctrl+Shift+X`).
- **Codex**: para os 13 agentes da base aparecerem, a pasta do projeto precisa estar marcada como confiável (o Codex pergunta ao abrir).
- **Claude Code também no app**: o app Claude para Windows e Mac tem a aba Code, com a mesma função e sem terminal.

Próximo passo: volte ao [README](../README.md) e siga para o primeiro projeto. Os pedidos prontos para cada situação estão no [kit de prompts](prompts.md).

## Fontes

- Claude Code: https://code.claude.com/docs/en/setup · extensão do VS Code: https://code.claude.com/docs/en/vs-code
- Codex: https://developers.openai.com/codex/cli · Windows: https://developers.openai.com/codex/windows · extensão: https://developers.openai.com/codex/ide
- Python no Windows: https://docs.python.org/3/using/windows.html · no Mac: https://docs.python.org/3/using/mac.html
- Git: https://git-scm.com/install/windows · Node.js: https://nodejs.org/en/download · VS Code: https://code.visualstudio.com/docs/setup/windows · GitHub CLI: https://cli.github.com/ · winget: https://learn.microsoft.com/windows/package-manager/winget/
