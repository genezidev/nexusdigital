# Perfil Python e API

Para APIs que outros sistemas ou apps consomem, automações, processamento de dados e integração com bibliotecas que só existem em Python (dados, ciência, documentos, visão computacional).

## Stack recomendada

| Peça | Escolha | Versão conferida em 2026-11-22 | Por quê |
|---|---|---|---|
| Python | 3.14 (suporte até 2030) ou 3.15 | 3.14.10 / 3.15.2 | A 3.15 saiu em 2026-10; use-a se todas as dependências já suportam |
| Ambiente e dependências | uv | 0.13.9 | Instala o Python, cria ambiente e trava versões num comando |
| API | FastAPI | 0.165.0 | Validação e documentação automáticas (`/docs`) |
| Banco | PostgreSQL + SQLModel, migrations com Alembic | SQLModel 0.0.50 | Mesmo modelo para banco e API |
| Testes | pytest | conferir na criação | Testes de regra e de rota HTTP |
| Tarefas demoradas | Fila com worker (ou cron simples) | | Fora da requisição HTTP |

Alternativas: **Django** quando o projeto precisa de painel administrativo pronto e muitas telas no servidor; **Full Stack FastAPI Template** (catálogo) para começar com FastAPI + React + Docker já montados; **biblioteca ou script** sem API quando é só automação local (veja [cli.md](cli.md)).

## Criar o projeto

```powershell
python scripts/conferir_versoes.py fastapi
uv python install 3.14
uv init api --python 3.14
cd api
uv add "fastapi[standard]==0.165.0" "sqlmodel==0.0.50"
uv add --dev pytest
```

Troque o `main.py` gerado por um que crie o `app = FastAPI()` com uma rota de saúde e rode `uv run fastapi dev main.py`; a documentação da API abre em `/docs`. O `uv.lock` vai para o Git; o ambiente `.venv` não.

## Estrutura e cuidados

- Uma pasta por funcionalidade com rotas, esquemas, regras e acesso a dados; regra de negócio sem depender do FastAPI.
- Configurações por variável de ambiente validadas na inicialização (pydantic-settings).
- Permissão conferida em cada rota, com teste de quem não pode.
- Em `quality/checks.json`, use `uv` como executável: `["uv", "run", "pytest", "-q"]` e o lint escolhido (Ruff).

## Publicar

Siga `scaff-publicar` e [vps.md](../vps.md). Em produção, rode atrás de proxy com HTTPS e com mais de um processo de servidor.

## Armadilhas

- Rodar tarefa longa dentro da requisição: a resposta expira e a tarefa some. Use fila.
- FastAPI e SQLModel ainda estão antes da versão 1: fixe as versões e leia as notas antes de atualizar.
- Instalar pacote fora do ambiente do projeto (`pip install` global): use `uv add`.

## Fontes

- FastAPI: https://fastapi.tiangolo.com · uv: https://docs.astral.sh/uv/
- SQLModel: https://sqlmodel.tiangolo.com · Python: https://devguide.python.org/versions/
