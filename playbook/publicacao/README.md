# Publicação: para onde mandar o sistema

Escolha o destino pela fase e pelo tipo do projeto. O roteiro de cada publicação (checklist, staging, autorização, plano de volta) é sempre o da skill `scaff-publicar` com [modelos/RELEASE.md](../../modelos/RELEASE.md).

| Destino | Quando usar | Custo e cuidados | Guia |
|---|---|---|---|
| Local (seu computador) | Desenvolvimento e demonstração | Sem custo; não serve para clientes usarem | Abaixo |
| VPS com Coolify | SaaS, API, várias aplicações num servidor, banco junto, custo fixo previsível | Mensalidade da VPS; você cuida de segurança, atualizações e backup | [../vps.md](../vps.md) |
| Vercel + Supabase | Web em Next.js sem administrar servidor | Plano gratuito da Vercel só para uso pessoal e não comercial; Supabase gratuito pausa e não tem backup | [vercel-supabase.md](vercel-supabase.md) |
| Cloudflare na frente | Domínio, DNS, HTTPS e proteção, com VPS ou outro destino | Plano gratuito atende o começo; limite de envio de 100 MB por requisição | [cloudflare.md](cloudflare.md) |
| Lojas de aplicativos | App mobile ou desktop | Contas, taxas, revisão e regras de cobrança de cada loja | [lojas.md](lojas.md) |

Recomendação para iniciante com um SaaS que vai cobrar: **VPS com Coolify e Cloudflare**, custo fixo e tudo num lugar. Quem prefere não cuidar de servidor e aceita pagar por uso: **Vercel Pro + Supabase Pro**. Registre a escolha em `contexto/DECISOES.md`.

## Local

- Rode com o comando de desenvolvimento da stack ([stacks/](../stacks/)) e dados fictícios do seed.
- Para mostrar a alguém fora da sua rede por pouco tempo, use um túnel (por exemplo, Cloudflare Tunnel) e desligue depois. Nunca com dados reais nem chaves de produção.
- Docker Compose local espelha a produção (mesma versão do banco) e evita "na minha máquina funciona".

## Antes de qualquer destino

- Domínio próprio comprado pela pessoa (Registro.br para `.com.br`), com acesso guardado por ela.
- Ambientes separados: staging e produção com bancos, chaves e domínios próprios (`staging.seudominio.com.br`).
- Checklists de [../seguranca.md](../seguranca.md) e [../saas/lancamento.md](../saas/lancamento.md), monitoramento de [../saas/monitoramento.md](../saas/monitoramento.md) e backup com restauração testada.
- Preços e limites mudam: os valores destes guias foram conferidos em 2026-11-23 e devem ser conferidos de novo na data da contratação.
