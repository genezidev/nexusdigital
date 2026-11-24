# VPS e publicação

## Coletar estado

Copie `scripts/inventario-vps.sh` para sua VPS Linux e rode:

```bash
bash inventario-vps.sh
```

Opcionalmente salve a saída com `bash inventario-vps.sh > inventario-vps.txt`. O script lista recursos, runtimes, unidades em execução, portas e nomes dos containers locais quando o socket já for acessível. Ele não imprime endereços, credenciais, ambientes, logs ou configuração de apps. Nomes de serviços e containers podem ser editados antes de enviar. Acrescente domínio desejado, quais serviços precisam coexistir e se pretende usar staging, servidor separado ou o host existente.

## Escolha de ambiente

- Desenvolvimento local é a configuração padrão para ciclo rápido e uso de dispositivos. Para trabalhar direto remoto, use VS Code Remote SSH ou CLI na **VPS de desenvolvimento**, com um usuário próprio, checkout em pasta isolada e dados fictícios.
- Na mesma máquina que já hospeda projetos, faça a análise de CPU, memória, disco, portas, proxy e backup antes da primeira mudança. Planeje nomes exclusivos de projeto/serviço, rede, volumes, banco/usuário e domínio de staging. Preserve o proxy e o gerenciador já em uso, seja Nginx, Caddy, Traefik, Coolify ou outro.
- Staging ensaia o mesmo artefato de produção. Rode validação de saúde, recuperação, TLS, middleware, rotas públicas, filas/cron, e-mail e alertas conforme o projeto. Garbage collection, volume compartilhado e mudanças globais precisam de escopo próprio.

## Tamanho da VPS

Conferido em 2026-11-23. O Coolify pede no mínimo 2 núcleos, 2 GB de memória e 10 GB livres de disco (amd64 ou arm64). Para um primeiro SaaS com app, PostgreSQL e Coolify na mesma máquina, a base recomenda **começar com 2 núcleos e 4 GB**, porque o build do app consome memória enquanto o resto roda; suba de plano quando o monitoramento mostrar memória ou disco perto do limite. Sistema: **Ubuntu 26.04 LTS** (abril de 2026, suporte padrão até maio de 2031) ou 24.04 LTS (até maio de 2029). Versões não LTS saem de suporte em meses.

Contratar a VPS, escolher o plano e pagar são decisões da pessoa. Prefira data center no Brasil quando o público for brasileiro.

## Proteger a VPS no primeiro acesso

Faça nesta ordem, sem fechar a sessão atual até testar a próxima:

1. Atualize o sistema: `sudo apt update && sudo apt full-upgrade`. As atualizações automáticas de segurança (`unattended-upgrades`) já vêm ligadas no Ubuntu; o reinício automático vem desligado (`Unattended-Upgrade::Automatic-Reboot` em `/etc/apt/apt.conf.d/50unattended-upgrades`). Combine uma janela para reiniciar quando o sistema pedir.
2. Crie um usuário próprio com `sudo` e entre por **chave SSH**: no seu computador, `ssh-keygen -t ed25519` e `ssh-copy-id usuario@ip-da-vps`.
3. Abra **outra** sessão com a chave e confirme que entra. Só então desligue senha e login do root num arquivo próprio, `/etc/ssh/sshd_config.d/10-seguranca.conf`:
   ```
   PasswordAuthentication no
   PermitRootLogin no
   ```
   Confira com `sudo sshd -t` e aplique com `sudo systemctl restart ssh.service`. Teste de novo numa sessão nova antes de sair. Se o provedor injeta configuração com senha (arquivos `50-cloud-init.conf` e parecidos na mesma pasta), confira qual vence: os arquivos são lidos em ordem e vale o primeiro valor.
4. Firewall: `sudo ufw default deny incoming`, `sudo ufw allow ssh`, `sudo ufw allow 80,443/tcp`, `sudo ufw enable`, e confira com `sudo ufw status verbose`. Use também o firewall do painel do provedor, se houver: ele fica fora da VPS.
5. Opcional: `fail2ban` (GPL-2.0, pelo `apt`) bloqueia IPs que erram o login repetidamente. Com senha desligada, ele reduz ruído no log, não é a proteção principal.

## Docker

- Instale pelo **repositório `apt` oficial** da Docker (Docker Engine 29.10.0 e Compose 5.8.0 em 2026-11-23). O script `get.docker.com` é só para teste e desenvolvimento. O instalador do Coolify já instala o Docker quando o sistema é suportado.
- **O Docker passa por cima do `ufw`**: porta publicada de container (`-p 5432:5432`) fica aberta na internet mesmo com o firewall negando. Banco, Redis e painéis nunca publicam porta para fora: deixe sem `ports` (o proxy e o app falam pela rede interna do Docker) ou publique só em `127.0.0.1` (`"127.0.0.1:5432:5432"`). Confira de fora com um teste de porta depois do deploy.
- Quem controla o Docker tem, na prática, poder de root na máquina: só usuários de confiança no grupo `docker`.
- Fixe a versão das imagens (`postgres:18.7`, não `latest`) e limite o tamanho dos logs dos containers para o disco não lotar.

## Coolify: painel para publicar na VPS

Coolify (Apache-2.0, 4.7.6 em 2026-11-23) é um painel auto-hospedado que publica apps a partir do Git, com HTTPS automático, bancos, variáveis e backups. É o caminho recomendado para quem não quer montar proxy e deploy à mão.

- Instalação oficial: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash` (como root ou com `sudo`). Leia o script antes, como em [varreduras.md](varreduras.md).
- **Crie a conta de admin logo depois de instalar**: quem abrir a página de cadastro primeiro vira dono do painel, com acesso de root ao servidor. O cadastro inicial fica aberto só nos primeiros 10 minutos.
- Portas: 22, 80 e 443 sempre; 8000 (painel por IP), 6001 e 6002 (tempo real e terminal) só até o painel funcionar pelo domínio com HTTPS. Depois feche as três no firewall do provedor (lembre que o `ufw` não segura portas do Docker).
- Guarde fora do servidor uma cópia de `/data/coolify/source/.env`: o `APP_KEY` dele cifra os segredos do painel, e sem ele não há como restaurar o Coolify.
- Backups dos bancos: agende no próprio Coolify com envio para um armazenamento S3 compatível fora da VPS. Backup que rodou só prova que o arquivo existe: **teste a restauração**.
- Atualizações: o Coolify vem com atualização automática diária no canal estável. Em produção, prefira desligar (`AUTOUPDATE=false` no `.env` acima) e atualizar com backup e notas da versão lidas, como manda a regra de versões da base. Para atualizar use `upgrade.sh`, nunca o `install.sh`.
- Coolify e apps na mesma VPS funcionam para começar; acompanhe o uso de memória durante os builds.
- Atrás da Cloudflare, siga [publicacao/cloudflare.md](publicacao/cloudflare.md). O túnel da Cloudflare passa por cima das regras de firewall: proteja cada rota publicada por ele.

## Banco, auth e storage

O novo sistema pode começar com PostgreSQL e auth/storage próprios. A decisão depende do PDF e dos critérios de entrega. O inventário da VPS revela a capacidade de trabalhar diretamente nela e o que já pode ser reutilizado.

## Segredos no servidor

- Padrão: `.env` fora do Git e variáveis cadastradas no painel da plataforma (Coolify, Vercel, GitHub Actions) ou num arquivo no servidor com permissão só para o usuário do serviço. Um `.env` por ambiente; staging e produção nunca compartilham chaves.
- Quando os segredos precisarem ser versionados junto do projeto (várias máquinas, VPS sem painel, histórico de mudança), cifre o arquivo com SOPS + age (ver `catalogo/repositorios.md`). O arquivo cifrado pode ir ao Git; a chave privada do age nunca vai, e precisa de cópia de segurança fora do computador. Sem a chave, os segredos não voltam.
- Trocou de pessoa, máquina ou suspeitou de vazamento: gere chaves novas no fornecedor (gateway, banco, e-mail), todas de uma vez, e revogue as antigas antes de limpar o histórico do Git. Cifrar de novo não invalida uma chave que já vazou. Passo a passo em [varreduras.md](varreduras.md).

## Antes do corte

Guarde revisão e artefato anterior, backup testado, estado de volumes e esquema. Planeje rollback de aplicativo e dados separadamente. Defina a ordem de migração e limites de indisponibilidade, confirme observabilidade e preserve um caminho de volta. Só habilite tarefas, notificações ou webhooks reais após validar isoladamente.

Destinos sem VPS (Vercel + Supabase) e lojas de aplicativos: [publicacao/README.md](publicacao/README.md).

## Fontes

Lidas em 2026-11-23: Coolify, instalação https://coolify.io/docs/get-started/installation, firewall https://coolify.io/docs/core/infrastructure/servers/firewall, backups https://coolify.io/docs/databases/backups e atualização https://coolify.io/docs/core/instance-management/update · Docker no Ubuntu https://docs.docker.com/engine/install/ubuntu/ e firewall https://docs.docker.com/engine/network/packet-filtering-firewalls/ · Ubuntu, ciclo de versões https://ubuntu.com/about/release-cycle, atualizações automáticas https://ubuntu.com/server/docs/how-to/software/automatic-updates/, OpenSSH https://ubuntu.com/server/docs/how-to/security/openssh-server/ e firewall https://ubuntu.com/server/docs/how-to/security/firewalls/
