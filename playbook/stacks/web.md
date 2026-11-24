# Perfil web e SaaS

Para sistemas usados no navegador: painel administrativo, cadastro, agenda, portal de clientes, SaaS com assinatura. Funciona no celular pelo navegador, sem loja de apps.

## Stack recomendada

| Peça | Escolha | Versão conferida em 2026-11-22 | Por quê |
|---|---|---|---|
| Runtime | Node.js LTS | 26.13.1 | Suporte longo; exigido pelo Next.js |
| Framework | Next.js (App Router) + TypeScript | 16.4.6 | Telas e API no mesmo projeto, muita documentação |
| Interface | Tailwind CSS + shadcn/ui | Tailwind 4.3.5 | Componentes copiados para o projeto, fáceis de ajustar ([catálogo](../../catalogo/repositorios.md)) |
| Banco | PostgreSQL | 19.0 (lançada em 2026-11-19) ou 18.7 | Relacional, em toda hospedagem; use a 18 se a hospedagem ainda não oferecer a 19 |
| Acesso ao banco | Prisma | 7.10.1 (não a `8.0.0-rc` marcada como `latest` no npm) | Schema legível e migrations versionadas |
| Login e permissões | Better Auth | 1.7.27 | E-mail e senha, login social, 2FA e organizações (várias empresas) |
| Testes | Vitest para regras, Playwright para jornadas | conferir na criação | Ver [revisao.md](../revisao.md) |

Alternativas: **Drizzle** no lugar do Prisma para quem prefere escrever perto do SQL; **NestJS** separado quando API e telas tiverem clientes, ritmos ou equipes diferentes (por exemplo, a API também atende um app mobile grande); **Open SaaS** como template pronto (ver catálogo: usa Wasp e exige WSL no Windows).

## Criar o projeto

```powershell
python scripts/conferir_versoes.py next.js
npx create-next-app@16.4.6 app
```

Responda às perguntas do gerador com TypeScript, ESLint, Tailwind e App Router. Depois, fixe as versões estáveis das bibliotecas (exemplo para a data acima):

```powershell
npm install --save-exact @prisma/client@7.10.1 better-auth@1.7.27
npm install --save-exact --save-dev prisma@7.10.1
```

Leia o guia da versão instalada em `app/node_modules/next/dist/docs/` antes de seguir exemplos da internet: muita coisa mudou entre versões principais.

## Estrutura

- Uma pasta por funcionalidade, como em [saas/README.md](../saas/README.md), e o sentido das dependências de [perfis.md](../perfis.md#organização-em-módulos).
- Regras de negócio em funções testáveis, fora dos componentes e das rotas.
- Permissão sempre conferida no servidor (rota, ação de servidor ou consulta), nunca só escondendo botão.
- Variáveis de ambiente validadas na inicialização; `.env.example` só com os nomes.

## Checagens

Em `quality/checks.json`, configure lint, verificação de tipos, testes e build com os comandos reais do projeto. No Windows o runner não aceita `npm.cmd`: use `node` com o caminho do CLI local (o campo `bin` em `node_modules/<pacote>/package.json` diz qual é). Proteja a estrutura com o dependency-cruiser quando houver código.

## Publicar

Siga `scaff-publicar`. Os destinos (VPS com Coolify, Vercel + Supabase, Cloudflare na frente) e como escolher estão em [publicacao/README.md](../publicacao/README.md). Banco gerenciado ou na VPS é decisão de custo da pessoa.

## Armadilhas

- `npm install <pacote>` sem versão pode trazer pré-lançamento (Prisma em 2026-11). Use `--save-exact` com a versão conferida.
- Código que roda no navegador nunca recebe segredo: variável com prefixo `NEXT_PUBLIC_` é pública.
- Cache do Next.js mostrando dado de outra pessoa: dado por usuário sempre com a sessão conferida no servidor.
- Migration aplicada direto em produção sem passar por staging (ver [licoes-de-producao.md](../licoes-de-producao.md)).

## Fontes

- Next.js: https://nextjs.org/docs · releases https://github.com/vercel/next.js/releases
- Prisma: https://www.prisma.io/docs
- Better Auth: https://www.better-auth.com/docs (o README do Auth.js recomenda o Better Auth para projetos novos)
- Node.js: https://nodejs.org/dist/index.json · PostgreSQL: https://www.postgresql.org/support/versioning/
