---
name: scaff-vps
description: "Planeja staging, publicação e convivência de serviços em uma VPS. Use ao levantar o ambiente remoto ou planejar deploy e rollback."
---

Leia playbook/vps.md. Em VPS nova, proteja o acesso na ordem do guia (chave SSH testada antes de desligar senha, firewall) e lembre que porta publicada pelo Docker passa por cima do ufw. Use a saída do coletor, versões, processos, portas, proxy e recursos antes de definir rota de operação. Escolha nomes, redes, dados, usuário e domínio de staging que preservem serviços existentes. Registre backup, health e rollback. Mutações exigem escopo e acesso ao destino. O desenvolvimento direto na VPS funciona com isolamento e capacidade comprovados.