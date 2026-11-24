# Perfil CLI e rotinas

Para ferramentas de linha de comando e rotinas que rodam sozinhas: importar planilha, gerar relatório, sincronizar sistemas, fazer backup, conferir algo todo dia.

## Stack recomendada

| Peça | Escolha | Versão conferida em 2026-11-22 | Por quê |
|---|---|---|---|
| Linguagem | Python | 3.14 ou 3.15 | Fácil de ler, muitas bibliotecas para planilha, PDF e APIs |
| Comandos | Typer | 0.29.2 | Ajuda (`--help`) e validação automáticas |
| Ambiente e instalação | uv | 0.13.9 | `uv tool install` instala a ferramenta para a pessoa usar |
| Agendamento | Agendador de Tarefas (Windows), cron ou timer do systemd (Linux) | | Já vem no sistema |

Alternativas: **Go** (1.27) quando distribuir um executável único, sem instalar Python, for o mais importante; **Node.js** quando o projeto já é todo em TypeScript; **Rust** só com equipe experiente.

## Criar o projeto

```powershell
uv init --package ferramenta --python 3.14
cd ferramenta
uv add "typer==0.29.2"
uv add --dev pytest
uv run ferramenta --help
```

## Cuidados

- Código de saída 0 para sucesso e diferente de 0 para falha: é assim que o agendador e o CI sabem que deu errado.
- Mensagens de erro claras, sem mostrar senha, token ou dado pessoal.
- Configuração por arquivo ou variável de ambiente, com exemplo sem valores reais.
- Limite de tempo e nova tentativa com espera crescente em chamadas de rede.
- Rotina agendada grava log com data e resultado e avisa quando falha (e-mail ou Telegram).
- Testes com arquivos de exemplo em `tests/`, cobrindo entrada vazia, inválida e grande.

## Publicar

Para uso interno, `uv tool install` a partir do repositório. Para o público, publique no PyPI com versão a cada mudança (`scaff-publicar`).

## Fontes

- Typer: https://typer.tiangolo.com · uv: https://docs.astral.sh/uv/guides/tools/
- Go: https://go.dev/dl/
