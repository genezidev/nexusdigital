# Runbook: preparar o banco de produção

Ordem fixa: **backup, migrate, provisionar**. Este documento só descreve; nada foi executado em produção. Cada passo que escreve no banco de produção é decisão da pessoa responsável, depois de ler `playbook/licoes-de-producao.md` e `playbook/seguranca.md`.

Os comandos rodam num terminal com acesso ao banco (por exemplo, na própria VPS ou por túnel SSH), com as variáveis lidas de um arquivo só do root/serviço, nunca digitadas na linha de comando e nunca no Git. O papel dono do banco (`nexo`, o das migrations) **ignora RLS** (superusuário ou `BYPASSRLS`) e o papel do app (`nexo_app`) **não**: o app em produção usa só `nexo_app`.

## 1. Backup (antes de qualquer mudança)

1. Gere o dump do banco e guarde fora da VPS (`pg_dump -Fc`, com a versão do cliente igual à do servidor).
2. Restaure numa cópia descartável e confira que sobe (backup que nunca foi restaurado não prova nada, `playbook/vps.md`).
3. Anote o nome do arquivo e a data no handoff. Reversão de migration em produção é restaurar este backup (as `.down.sql` de `app/prisma/rollback/` são só para dev e teste).

## 2. Migrate

Com `DATABASE_MIGRATE_URL` (papel dono) exportada no ambiente do terminal:

```bash
cd app
node node_modules/prisma/build/index.js migrate deploy
```

`migrate deploy` só aplica o que está pendente e não apaga dados. O `scripts/db-migrar.mjs` e o `prisma/seed.ts` **recusam** qualquer banco que não seja `nexo_dev` ou `nexo_test` em `127.0.0.1`/`localhost` (e o seed recusa `NODE_ENV=production`): em produção, use o comando acima. A migration cria o papel `nexo_app` **sem senha** (sem senha ele não conecta). O comentário dela cita `scripts/preparar-papel-app.mjs`, que não existe: o nome certo é `provisionar-producao.mjs` (o comentário não foi alterado porque mudar uma migration já aplicada muda o checksum).

## 3. Provisionar (papel do app e primeiro ADMIN)

Script: `app/scripts/provisionar-producao.mjs`. Ele define a senha do papel `nexo_app` (guardada como verificador SCRAM, o texto não vai para o log do servidor), cria o primeiro administrador com senha forte, grava `admin.provisioned` na auditoria e roda numa única transação.

Variáveis (só ambiente ou prompt; **nunca** argumento de linha de comando, que aparece em `ps` e no histórico):

| Variável | Para quê |
|---|---|
| `DATABASE_MIGRATE_URL` | URL do banco com o papel dono |
| `PROVISIONAR_HOST_PERMITIDO` | lista (vírgulas) de `host` ou `host:porta` autorizados; sem o host do destino, o script recusa |
| `APP_DB_PASSWORD` | nova senha do papel `nexo_app` (24+ caracteres, ASCII visível, sem espaços); gere com um gerenciador de senhas |
| `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` | primeiro administrador; senha de 12 a 128 caracteres (mínimo igual ao do app); o script rejeita as piores e padrões óbvios (palavras comuns, meses, teclado, `P@ssw0rd`, palavra + número, e-mail ou nome), **não garante senha forte**: gere com um gerenciador de senhas |

Variável ausente: o script pergunta no terminal (senha sem eco). O script **não** lê `.env`.

```bash
cd app
# ambiente exportado de um arquivo protegido, sem imprimir:  set -a; . /caminho/protegido/producao.env; set +a
node scripts/provisionar-producao.mjs --ambiente=producao --confirmo=producao
```

Regras que o script impõe:

- `--ambiente=dev|test|producao` é obrigatório; sem ele, nada roda. `--confirmo=<mesmo ambiente>` ou digitar a frase `PROVISIONAR PRODUCAO` confirma. Sem terminal e sem `--confirmo`, recusa.
- A URL do banco não pode ter query string além de `sslmode` (nada de `?host=`, `?port=`, `?hostaddr=`, `?options=`, que o driver usaria para trocar o destino) e é conferida pelo mesmo parse que a conexão usa.
- `--ambiente=dev|test` só vale em `127.0.0.1`/`localhost` com `nexo_dev` ou `nexo_test`. `--ambiente=producao` recusa bancos `nexo_dev`/`nexo_test` e hosts fora de `PROVISIONAR_HOST_PERMITIDO`.
- Já existe ADMIN: recusa com código 3 e não altera nada (nem a senha do papel). Para rotacionar só a senha do papel depois: acrescente `--somente-papel` (não pede dados de admin). Para um segundo administrador: `--permitir-outro-admin`.
- Banco sem migrations ou com migration inacabada: recusa com código 4.
- Nada é impresso além do destino, do e-mail mascarado e do id; senha nunca.

Depois de rodar:

1. Coloque a nova senha do papel na `DATABASE_URL` do app (`postgresql://nexo_app:...@host:porta/banco`), no cofre de segredos da publicação, e reinicie o serviço.
2. Entre com o administrador criado, troque a senha se foi temporária, e confira a tela de auditoria (`admin.provisioned`).
3. Registre no handoff: data, ambiente e que o script rodou (sem segredo).
4. O app só inicia em produção com `TRUST_PROXY` definido e proxy configurado como em `docs/proxy-e-ip.md`.

Falha comum: `42501` ao gravar a auditoria significa que o papel dono não ignora RLS. Use o dono do banco (superusuário ou `BYPASSRLS`); nada foi gravado.

## Testes do script

`app/tests/integration/provisionar.test.ts` roda o script contra bancos temporários (cópias criadas só para o teste, com as migrations reais): cria admin, é idempotente, não imprime senha, recusa senha fraca, recusa host não autorizado e recusa ambiente não declarado.

## Arquivos privados (fase 2)

Antes do primeiro envio em produção:

1. **`APP_URL` em https** (obrigatória: o app não inicia em produção sem ela, nem com `http://...`; a mensagem cita só o nome da variável). Vale também para o cookie `Secure` e para a origem confiável (CSRF).
2. **Volume dedicado** para `STORAGE_LOCAL_DIR` (caminho absoluto FORA da pasta do app, montado à parte do banco e dos logs; só o usuário do app escreve). **Alerta de disco** da VPS em 80% e 90% do volume (o 507 do app é o último recurso).
3. `STORAGE_SIGNING_SECRET` (32+ caracteres, só no servidor; o app não inicia em produção sem ele) e os limites `MAX_IMAGE_MB`, `MAX_PDF_MB`, `MAX_VIDEO_MB`.
4. **Dimensionar a capacidade** pelo volume real: `STORAGE_CLIENT_QUOTA_MB` (padrão 10240), `STORAGE_GLOBAL_QUOTA_MB` (padrão 102400; deve ficar abaixo do volume menos o livre mínimo) e `STORAGE_MIN_FREE_MB` (padrão 2048). Os padrões são ponto de partida, não medida da VPS.
5. Incluir a pasta (com `.trash/` e `.install-id`) no backup junto com o banco.
6. **Vincular a instalação uma única vez**, depois do primeiro `migrate deploy` e de conferir que o banco e a pasta são o par certo: `node scripts/limpar-arquivos.mjs --ambiente producao --vincular-instalacao` (cria `.install-id` na pasta, copiando o `installation_id` do banco; nunca sobrescreve). Sem isso a limpeza se recusa a rodar (código 3).
7. Agendar `node scripts/limpar-arquivos.mjs --ambiente producao` (uma vez por hora). O `--ambiente producao` só roda com o host do banco em `PROVISIONAR_HOST_PERMITIDO` e com banco que não seja `nexo_dev`/`nexo_test`. Órfãos vão para `.trash/` e ficam 30 dias (`STORAGE_TRASH_RETENTION_DAYS`); a limpeza aborta (código 3) se achar órfãos demais: **trate código 3 como alerta** (banco errado ou backup antigo?), não como ruído. Restaurar: `--restaurar clients/<cliente>/<uuid>`.
8. Proxy reverso: sem limite de corpo abaixo do vídeo máximo e sem bufferizar o corpo de `/api/files/upload/`.

A migration `20261125140000_endurecimento_revisao_fase2` cria o `installation_id` (tabela `app_settings`), as funções `client_storage_bytes` e `storage_bytes_total` (`SECURITY DEFINER`, mesma dependência de `cycle_progress_counts`: o dono do banco ignora RLS) e os gatilhos que barram o papel do app em decisão, membros e convites. Em produção ela segue o fluxo normal (backup, `migrate deploy`); a reversão em desenvolvimento e teste é `app/prisma/rollback/20261125140000_endurecimento_revisao_fase2.down.sql`. Tudo em `docs/armazenamento.md`; nada disso foi executado em produção.
