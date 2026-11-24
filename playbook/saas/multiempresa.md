# Várias empresas no mesmo sistema (multiempresa)

Quando várias empresas (clientes, clínicas, lojas, escritórios) usam o mesmo sistema, cada uma só pode ver e mexer nos próprios dados. Vazar um dado de uma empresa para outra é a falha mais grave de um SaaS: decida isso no começo, porque mudar depois exige migrar todo o banco.

## Modelo recomendado: um banco, uma coluna de empresa

| Modelo | Quando usar |
|---|---|
| **Banco compartilhado com `organizacao_id` em toda tabela de negócio** | Padrão para quase todo SaaS: simples de operar, um backup, uma migration |
| Um schema por empresa | Exigência contratual de separação, poucas empresas grandes |
| Um banco por empresa | Exigência legal ou de cliente grande; custo e operação bem maiores |

## Regras

1. **A empresa vem da sessão, nunca do pedido.** O servidor lê a empresa ativa da sessão do usuário e confere que ele é membro dela. Nunca aceite `organizacao_id` vindo do corpo, da URL ou de um campo escondido da tela.
2. **Toda tabela de negócio tem `organizacao_id` obrigatório**, com chave estrangeira e índice. Índices únicos incluem a empresa: o "código do produto" é único dentro da empresa, não no sistema todo.
3. **Toda consulta filtra pela empresa**, inclusive busca por ID: `where id = ? and organizacao_id = ?`. Centralize isso numa camada (repositório ou função de acesso) em vez de lembrar em cada consulta.
4. **Segunda camada no banco** quando houver dados sensíveis ou pagamento: política por linha (RLS) no PostgreSQL usando a empresa da conexão. Se o código esquecer o filtro, o banco recusa. Lembre que RLS e GRANT são camadas diferentes ([licoes-de-producao.md](../licoes-de-producao.md)).
5. **Tudo que sai do banco carrega a empresa**: caminho de arquivo (`organizacao_id/usuario_id/uuid.ext`), chave de cache, nome de fila e tarefa agendada, eventos de webhook, linhas de log e de auditoria.
6. **Dois papéis de admin diferentes**: o admin **da empresa** (gerencia membros e dados dela) e o admin **do sistema** (você, dono do SaaS). Operações do admin do sistema que olham dados de clientes ficam no log de auditoria.
7. **Cobrança por empresa**: o plano e a assinatura pertencem à empresa, não ao usuário. O gateway ativo pode ser por empresa ([gateways/](gateways/README.md)).
8. **Sair e apagar**: exportar os dados de uma empresa e apagar tudo dela (banco, arquivos, cache) são operações previstas desde o começo, com teste.

## Na stack web padrão: plugin `organization` do Better Auth

Conferido na documentação do Better Auth 1.7 em 2026-11-23.

- Cria as tabelas de organização, membro e convite, e guarda a **organização ativa** na sessão (`organization.setActive`). Ela começa vazia no login: escolha a empresa ao entrar ou guarde a última usada.
- Papéis padrão: `owner` (tudo), `admin` (tudo menos apagar a organização ou trocar o dono) e `member` (só leitura das ações da organização). Dá para criar permissões próprias.
- Convites por e-mail: ligue `requireEmailVerificationOnInvitation: true` quando a participação na empresa for sensível.
- **O plugin cuida de quem é membro, não dos seus dados.** As tabelas do seu produto continuam precisando de `organizacao_id` e do filtro em toda consulta (regras 2 e 3).

## Testes obrigatórios

- [ ] Usuário da empresa A não lê, não altera e não apaga dado da empresa B trocando o ID na URL ou no corpo
- [ ] Usuário que saiu da empresa perde o acesso na hora
- [ ] Arquivo da empresa A não abre com sessão da empresa B, nem com link assinado antigo depois de sair
- [ ] Busca, listagem, exportação e relatórios trazem só a empresa ativa
- [ ] Tarefa agendada e webhook gravam na empresa certa
- [ ] Admin da empresa não alcança operações do admin do sistema

Registre a escolha do modelo em `contexto/DECISOES.md` e as regras em `contexto/MODELO-DE-SEGURANCA.md`, citando o código e o teste que garantem cada uma.
