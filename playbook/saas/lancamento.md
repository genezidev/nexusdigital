# Página de vendas, SEO, privacidade e lançamento

## Página de vendas (landing page)

Seções que convertem, nesta ordem: destaque com a promessa e botão de ação, logos ou números de prova, funcionalidades, demonstração, depoimentos, preços, perguntas frequentes, rodapé com contato, termos e privacidade.

- Textos em arquivo de conteúdo separado dos componentes, para trocar sem mexer no layout.
- Página de preços lê os planos definidos em [pagamentos.md](pagamentos.md).

## SEO e descoberta por buscadores e IAs

- [ ] Título, descrição e tags Open Graph/Twitter com imagem de compartilhamento (1200×630)
- [ ] Páginas públicas **pré-renderizadas** (HTML pronto no build ou SSR), para buscadores e IAs lerem sem executar JavaScript
- [ ] Dados estruturados JSON-LD (`SoftwareApplication`, `Organization`, `FAQPage`)
- [ ] `robots.txt` e `sitemap.xml` com o domínio de produção, só com páginas públicas (nunca páginas que exigem login)
- [ ] `llms.txt` resumindo o produto e as páginas principais
- [ ] Favicon, ícones e tempo de carregamento bom no PageSpeed Insights
- [ ] Domínio cadastrado no Google Search Console

## Privacidade e LGPD

- [ ] Política de privacidade: dados coletados, finalidade, base legal, serviços terceiros (pagamento, e-mail, analytics, hospedagem), tempo de guarda, direitos do titular e contato do encarregado
- [ ] Termos de uso: regras, cobrança, cancelamento e reembolso (o Código de Defesa do Consumidor garante arrependimento em 7 dias nas compras online)
- [ ] Banner de cookies opt-in quando houver cookies não essenciais
- [ ] O usuário consegue baixar seus dados e excluir a conta
- [ ] Senhas, tokens e documentos nunca aparecem em logs

Modelos de política servem de ponto de partida; para produto com dados sensíveis, valide com um profissional.

## Testes antes de lançar

- Testes de ponta a ponta com Playwright cobrindo: página inicial carrega, telas protegidas redirecionam para o login, página de preços, cadastro e login, a funcionalidade principal, checkout em sandbox.
- No CI, os testes rodam com variáveis fictícias; as que precisam de valor real ficam nos *secrets* do GitHub. Ações externas do CI fixadas por SHA.

## Checklist de lançamento

- [ ] Variáveis de produção configuradas no servidor (banco, segredo de sessão, URL pública do app e da API, chaves de produção)
- [ ] URLs de retorno do login social cadastradas para o domínio de produção
- [ ] Gateway em modo produção, webhook de produção criado e testado
- [ ] Domínio de e-mail verificado (SPF, DKIM, DMARC) e envio real testado
- [ ] Bucket de arquivos privado e CORS restrito ao domínio
- [ ] HTTPS ativo, cabeçalhos de segurança e limite de requisições nas rotas de login e cadastro
- [ ] Backup automático do banco e **restauração testada**
- [ ] Monitoramento de erros e uptime com alertas no Telegram
- [ ] SEO, política de privacidade e termos publicados
- [ ] Funcionalidades e variáveis não usadas removidas
- [ ] Plano de volta (rollback) anotado no handoff

O passo a passo de publicação por destino (local, VPS, Cloudflare, Vercel + Supabase, lojas de aplicativos) está em [../publicacao/README.md](../publicacao/README.md).
