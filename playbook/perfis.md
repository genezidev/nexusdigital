# Perfis de projeto

Escolha a stack pela ideia, não pela moda: onde a pessoa usa o sistema, que dados ele guarda, como chega a quem usa e quem vai manter. Cada perfil tem um começo recomendado para quem está aprendendo e alternativas para quando o briefing pedir outra coisa. A escolha final é uma decisão cara: registre em `contexto/DECISOES.md` (skill `scaff-arquitetura`).

## Escolher pela ideia

| A ideia é... | Perfil | Começo recomendado | Guia |
|---|---|---|---|
| Sistema que se usa no navegador: painel, cadastro, agenda, portal, SaaS com assinatura | `web` | Next.js + TypeScript + PostgreSQL + Prisma + Better Auth | [web.md](stacks/web.md) |
| App que precisa estar na loja, usar câmera, notificação, GPS ou funcionar sem internet | `mobile` | Expo (React Native) + TypeScript, com a API do perfil web | [mobile.md](stacks/mobile.md) |
| Programa instalado no computador, Windows e Mac, que mexe com arquivos ou funciona offline | `desktop` | Electron + TypeScript, criado com o Electron Forge | [desktop.md](stacks/desktop.md) |
| API para outros sistemas, automação, processamento de dados, integração com bibliotecas Python | `python` | FastAPI + SQLModel + PostgreSQL, com uv | [python.md](stacks/python.md) |
| Ferramenta de linha de comando ou rotina agendada | `cli` | Python + Typer, com uv | [cli.md](stacks/cli.md) |
| Produto em que a IA é parte central: chat, resumo, extração de dados, agente | `ia` | Perfil web + AI SDK, chave só no servidor | [ia.md](stacks/ia.md) |
| Loja virtual | `ecommerce` | Plataforma pronta; Medusa + Next.js quando precisar de regras próprias | [ecommerce.md](stacks/ecommerce.md) |

Em dúvida entre site e app: comece pelo **web** que funciona bem no celular. Ele chega a todo mundo por um link, não depende de aprovação de loja e é a base de API que o app vai usar depois. Vá para **mobile** quando a ideia precisar de algo que só o app faz bem (câmera contínua, notificação, uso sem internet, presença na loja).

Uma ideia pode juntar perfis: o mais comum é **web** (painel e API) + **mobile** (app de quem usa). Construa a API uma vez só e faça os clientes falarem com ela.

## Por que estes padrões para iniciantes

- **Uma linguagem para quase tudo.** TypeScript serve para web, mobile (Expo), desktop (Electron) e IA (AI SDK). Python fica para o que é naturalmente Python (dados, automação, bibliotecas científicas).
- **Documentação grande e estável**, com muitos exemplos: o agente erra menos e a pessoa acha ajuda.
- **PostgreSQL** como banco padrão: aguenta do primeiro cliente a muitos milhares, existe em toda hospedagem e tem extensão para busca por semelhança (IA).
- **Sem conta paga para começar.** Tudo roda localmente; custos aparecem só na publicação e são decisão da pessoa.

## Versões

Versões mudam toda semana. Cada guia traz as versões conferidas em 2026-11-22; antes de criar o projeto:

1. Rode `python scripts/conferir_versoes.py <nome>` para as ferramentas do catálogo.
2. Fixe a versão no gerador (`npx create-next-app@16.4.6`, não `@latest`) e nas dependências.
3. Para pacotes npm, confira `npm view <pacote> dist-tags`: a tag `latest` às vezes aponta para um pré-lançamento (aconteceu com o Prisma em 2026-11).
4. Runtime em versão com suporte longo: Node.js na LTS mais recente, Python numa versão com suporte, .NET na LTS.
5. Versão principal lançada há poucos dias (PostgreSQL 19, por exemplo) só se a hospedagem já oferece e as bibliotecas já suportam; senão, a anterior com suporte.

## Organização em módulos

As receitas de scaffolding são úteis quando o projeto tem a mesma estrutura. Fixe a versão do gerador e rode-o em diretório vazio. Repita builds e testes. No desenho modular, comece pelos limites e invariantes da feature, depois validação, caso de uso e adapter. Um repositório em memória é útil para um contrato compartilhado, assim como a implementação de produção exige teste de integração. Para CRUD simples, mantenha a estrutura enxuta. Organize o shared por contratos e regras efetivamente compartilhados.

O código flui num sentido só: partes compartilhadas → funcionalidades → aplicação (rotas e telas que juntam tudo). Uma funcionalidade não importa outra; quando duas precisam conversar, a composição acontece na camada de aplicação ou o trecho comum sobe para o compartilhado. Cada funcionalidade tem só as subpastas que usa. Chamadas à API ficam declaradas num lugar, com um cliente HTTP único e o formato da resposta validado. Em JS/TS, proteja essa regra com o dependency-cruiser ou a regra `import/no-restricted-paths` do ESLint.

Templates completos para estudar por perfil: Open SaaS (Web/SaaS), Full Stack FastAPI Template (Python/API com React) e Bulletproof React (organização de front-end React). Veja licença, versão e cuidados em `catalogo/repositorios.md` antes de copiar estrutura.
