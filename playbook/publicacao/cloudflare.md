# Cloudflare: domínio, DNS e HTTPS

Conferido na documentação oficial em 2026-11-23. A Cloudflare fica entre o visitante e o servidor: responde o DNS, entrega o HTTPS e filtra ataques. O plano gratuito atende o começo.

## Colocar o domínio na Cloudflare

1. Crie a conta (a pessoa cria e guarda o acesso, com segundo fator) e adicione o domínio.
2. Se o domínio usa DNSSEC no registrador, **desligue antes** de trocar os servidores de nomes.
3. Confira se os registros importados batem com os atuais, principalmente os de e-mail.
4. No registrador (Registro.br para `.br`), troque os servidores de nomes pelos dois que a Cloudflare indicou, exatamente como aparecem, e remova os antigos. A troca pode levar até 24 horas.
5. Depois de ativo, religue o DNSSEC pela Cloudflare, se quiser.

## Nuvem laranja ou cinza

- **Com proxy (laranja)**: só registros A, AAAA e CNAME do site e da API. O visitante vê o IP da Cloudflare, não o do servidor.
- **Só DNS (cinza)**: registros de e-mail (MX, SPF, DKIM, DMARC do Resend), verificação de domínio, serviços de terceiros e tudo que não é HTTP, como SSH. MX e TXT nunca passam pelo proxy.
- Acesse a VPS por SSH pelo IP ou por um nome cinza; com o proxy, o SSH não funciona.

## HTTPS do jeito certo

- Modo SSL/TLS: **Full (strict)**. A Cloudflare confere o certificado do servidor; exige certificado válido para o nome (Let's Encrypt emitido pelo Coolify ou certificado de origem da Cloudflare) e porta 443 aberta no servidor. Sem isso aparece o erro 526.
- **Nunca Flexible**: nele o trecho entre a Cloudflare e o servidor viaja sem criptografia, e o site parece seguro sem estar.
- **Certificado de origem** (Origin CA): grátis, só vale entre a Cloudflare e o servidor (com o proxy desligado, o navegador acusa erro). A chave privada aparece **uma única vez**: salve direto no servidor. A Cloudflare não avisa quando ele vence; anote a data em `contexto/OPERACAO.md`.
- **Always Use HTTPS**: ligue e não faça outro redirecionamento de HTTP para HTTPS no servidor, para evitar laço de redirecionamento.
- **HSTS**: só depois que tudo funcionar em HTTPS, incluindo subdomínios. Com HSTS ativo, desligar o proxy, sair da Cloudflare ou voltar para HTTP deixa o site inacessível até o prazo do cabeçalho vencer. Comece com prazo curto, sem `includeSubDomains` e sem preload, e aumente depois.

## Limites e túnel

- Envio de arquivo: até **100 MB por requisição** no plano gratuito e no Pro (erro 413 acima disso). Upload grande vai direto para o armazenamento com URL assinada ([saas/arquivos-emails-tarefas.md](../saas/arquivos-emails-tarefas.md)).
- **Cloudflare Tunnel** (`cloudflared`, Apache-2.0, 2026.11.1): o servidor abre a conexão de saída e não precisa de porta de entrada aberta. Disponível em todos os planos. Bom para servidor em casa ou rede sem IP público. Atenção: o túnel ignora o firewall do servidor; tudo que ele publica precisa de login próprio ou do Cloudflare Access.
- Com o proxy ativo, o IP do visitante chega no cabeçalho `CF-Connecting-IP`: configure o app para ler daí, como pede o nível 2 de [seguranca.md](../seguranca.md).

## Fontes

- Modos SSL: https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/ · Full (strict): https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/
- Certificado de origem: https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/
- Proxy: https://developers.cloudflare.com/dns/proxy-status/ · Troca de servidores de nomes: https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/
- Always Use HTTPS: https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/ · HSTS: https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/
- Limites de requisição: https://developers.cloudflare.com/workers/platform/limits/#request-limits · Tunnel: https://developers.cloudflare.com/tunnel
