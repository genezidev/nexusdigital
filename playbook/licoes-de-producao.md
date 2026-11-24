# Lições de produção

Regras que evitam os erros mais comuns em sistemas reais. Valem para qualquer stack. A IA deve consultar esta página em mudanças de banco, permissões, pagamentos, integrações e publicação.

## Banco de dados e permissões

- Antes de escrever uma consulta, leia o schema real: nomes de tabelas, colunas, tipos, chaves estrangeiras, permissões (GRANT) e políticas de acesso. Nunca suponha nomes.
- Em PostgreSQL/Supabase, RLS (política por linha) e GRANT (permissão por tabela) são camadas diferentes. Uma tabela nova precisa das duas. Esquecer o GRANT causa "permission denied" mesmo com a política correta.
- Sistemas com várias empresas ou contas (multi-tenant): toda tabela de negócio leva o identificador da conta. Filtre por ele na política do banco e também no código. Teste leitura e escrita com duas contas diferentes.
- Separe o acesso do usuário logado do acesso administrativo (chave de serviço). A chave de serviço ignora as políticas e só pode rodar no servidor, em operações específicas.
- Confira o retorno de cada chamada ao banco. Erros silenciosos costumam vir do cliente errado ou de permissão ausente.

## Migrations e dados

- Toda mudança de banco é um arquivo de migration versionado. Aplique primeiro em banco local ou de staging.
- Nunca aplique migration em produção sem confirmar o destino, ter backup testado e autorização explícita. Comandos que enviam o schema direto para o banco remoto (como `db push`) exigem essa conferência.
- Prefira mudanças progressivas: adicionar coluna, migrar dados, depois remover a antiga.
- Operações com várias escritas devem usar transação ou ter reconciliação para falhas parciais.

## Integrações, pagamentos e webhooks

- Valide a assinatura de todo webhook. Trate eventos repetidos e fora de ordem (idempotência) e teste com payloads do modo sandbox.
- Isole cada gateway (pagamento, e-mail, WhatsApp, SMS) atrás de uma interface própria. Trocar de fornecedor não deve mexer nas regras de negócio.
- Respeite limites de envio e as políticas oficiais de cada provedor.

## Segurança e qualidade

- Permissão é sempre verificada no servidor. O que o frontend esconde não protege nada.
- Sanitize HTML enviado por usuários, valide uploads (tipo, tamanho, destino) e nunca guarde segredos em texto puro no código ou no Git (ver "Segredos no servidor" em `playbook/vps.md`).
- Cache de PWA guarda apenas arquivos estáticos, nunca dados de negócio.
- Não generalize limitações de versões antigas de frameworks e plataformas. Valide na versão travada do projeto.

## Investigação de problemas

- Reproduza a falha antes de corrigir. Use logs filtrados, IDs de correlação e consultas de leitura.
- Retire logs temporários depois. Faça commits pequenos e coesos e registre a causa no handoff.
