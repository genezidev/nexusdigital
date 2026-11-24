# Design e referência visual

Preencha `design/DESIGN.md` a partir de quem usa o produto, seu contexto e as jornadas. Se houver uma referência visual autorizada, registre a origem e a licença. A base usa layouts e componentes próprios ou componentes cuja licença permite o reuso pretendido.

## O arquivo DESIGN.md

`design/DESIGN.md` segue o formato aberto [DESIGN.md](https://github.com/google-labs-code/design.md): no topo, os valores exatos em YAML (cores, tipografia, cantos, espaços e componentes que apontam para eles, como `{colors.primary}`); abaixo, o texto que explica o porquê de cada escolha. O texto pesa mais que os números: uma intenção clara gera telas melhores que valores precisos sem contexto. Mantenha os títulos das seções em inglês e na ordem do modelo, porque são eles que as ferramentas reconhecem.

- Conferir o arquivo (referências quebradas, contraste WCAG, ordem das seções): `npx @google/design.md lint design/DESIGN.md`. No Windows/PowerShell, use sempre `npx -p @google/design.md designmd lint design/DESIGN.md`: a forma com `.md` no nome trava ou abre o editor de Markdown (testado em 2026-11-22). Saída esperada: `"errors": 0` e código de saída 0.
- Gerar o tema para o código: `export --format css-tailwind` (Tailwind v4), `--format json-tailwind` (Tailwind v3) ou `--format dtcg` (tokens W3C, para mobile e desktop).
- A ferramenta está em versão alfa (0.4.x). Confira a versão antes de fixá-la no `package.json`.

## Ordem que evita retrabalho

1. Mapeie navegação, hierarquia, atores e fluxo em celular e desktop.
2. Defina tipografia, cores semânticas, espaço, elevação, bordas e critérios de contraste no `DESIGN.md`. Parta do assunto do produto, não de um visual genérico: evite os padrões que denunciam tela feita por IA sem direção (fundo creme com serifa e destaque terracota, cards iguais com a mesma sombra em tudo, gradiente roxo, rótulo em caixa-alta acima de cada título, emoji no lugar de ícone). Valide um fluxo representativo antes de ampliar o catálogo.
3. Implemente shell, navegação lateral e topo de acordo com o produto. Componha primitivos e estados interativos, depois formulários, filtros, tabelas e gráficos. Implemente telas com dados representativos. Use o componente pronto da biblioteca antes de criar um novo e as cores por função (`primary`, `muted`), nunca o código da cor direto.
4. Confira os estados e a acessibilidade com a lista abaixo e compare capturas em tamanhos úteis.
5. Registre decisões visuais e componentes adotados. Use o stack existente quando adequado. Escolha a biblioteca por componente, custo, licença, acessibilidade e manutenção (opções e cuidados em `catalogo/repositorios.md`).

## Lista antes de entregar uma tela

- [ ] Estados: carregando, vazio, erro, sucesso, validação, desabilitado, permissão negada e offline quando aplicável.
- [ ] Contraste de texto de 4,5:1 (3:1 para texto grande) nos temas claro e escuro.
- [ ] Foco visível e navegação completa pelo teclado; botão só com ícone tem rótulo acessível.
- [ ] Área de toque de pelo menos 44×44px e espaço entre alvos no mobile.
- [ ] Rótulo visível em todo campo (placeholder não é rótulo) e erro escrito perto do campo.
- [ ] Ícones em SVG de uma biblioteca, nunca emoji.
- [ ] Animação respeita a preferência de movimento reduzido do sistema.
- [ ] Sem rolagem horizontal e sem texto cortado em 375, 768, 1024 e 1440px, e com zoom de 200%.

## Ferramentas

- **Revisão automática (web)**: a skill `web-design-guidelines` da Vercel revisa os arquivos contra mais de cem regras de acessibilidade, formulários, foco e desempenho. A skill UI UX Pro Max sugere estilo, paleta e fontes pelo tipo de produto e tem uma lista de verificação antes da entrega.
- **Capturas e fluxo no navegador**: o agente pode abrir o app com Playwright (CLI ou MCP) para tirar capturas nos tamanhos da lista e percorrer o fluxo. Use perfil isolado (`--isolated`), nunca o navegador pessoal com contas logadas, e não exponha o servidor MCP na rede.
- **Componentes React**: shadcn/ui copia o código do componente para o projeto. Antes de instalar componente de registro de terceiros, inspecione com `npx shadcn@latest add <componente> --view` ou `--dry-run`. Componentes animados do React Bits podem ser usados no app do aluno, mas a licença (MIT + Commons Clause) proíbe redistribuir ou vender os componentes em si: nunca copie componentes do React Bits para dentro desta base, de templates ou de material do curso.

Detalhes, versões e riscos de cada ferramenta: `catalogo/repositorios.md`.
