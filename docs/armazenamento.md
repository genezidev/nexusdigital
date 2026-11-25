# Armazenamento privado de arquivos (R-5)

Como os arquivos dos clientes (artes, PDFs de roteiro, gravações) são guardados, enviados e baixados, o que já existe, o que ainda não existe e o que o driver S3 vai precisar cumprir. Decisões: `contexto/DECISOES.md` (D-0010, D-0015, D-0016, D-0020, D-0021). Regra e testes: `contexto/MODELO-DE-SEGURANCA.md` (R-5).

## O que existe hoje

- **Driver de disco local** (`app/src/server/storage/local-disk.ts`), atrás da interface `ObjectStorage` (`app/src/server/storage/types.ts`). É o único motor. Serve para desenvolvimento, teste e, se o dono decidir, uma VPS pequena. **Driver S3: não implementado** (a capacidade da VPS é desconhecida e não há S3 real para testar).
- **Chave do objeto**: `clients/<client_id>/<uuid aleatório>`, sem nome original e sem extensão. O banco confere o formato (`assets_values_check`). O nome do arquivo do usuário só serve para exibição.
- **Pasta**: variável `STORAGE_LOCAL_DIR`. O app **recusa** uma pasta dentro de `public/`, `src/`, `.next/` ou `node_modules/`. Convenção: `<raiz do repositório>/.storage-local/<ambiente>` (ignorada pelo Git); em produção, caminho absoluto fora da pasta do app, com permissão só para o usuário do app. Arquivos 0600 e diretórios 0700 (no Windows o modo é ignorado).
- **Sem pasta pública e sem URL permanente.** Todo byte passa por uma rota do app que reconfere a pessoa.

## Fluxo de envio (upload)

1. A pessoa pede o alvo: `POST /api/admin/clients/{id}/assets` (agência) ou `POST /api/portal/assets` (cliente) com `originalName`, `mimeType` e `bytes`. O servidor confere permissão (`asset:upload`), nome, extensão perigosa, tipo permitido, limite por tipo, cota do cliente e limite de pendentes, cria o registro `PENDENTE` (que guarda o que foi *declarado*) e devolve um **alvo assinado**: `PUT /api/files/upload/<token>`, válido por `UPLOAD_URL_TTL_SECONDS` (900 s).
2. O navegador envia os bytes: `PUT` com `Content-Type: application/octet-stream` (outros tipos: 415) e o cookie da sessão. O corpo é lido **em streaming** para um arquivo temporário (`.tmp/<uuid>.part`), com contagem de bytes e SHA-256 em tempo real; nada é carregado na memória. Acima do menor valor entre o limite do tipo e o tamanho declarado: 413 e o temporário é apagado.
3. O servidor confere o **tipo real pelos primeiros bytes** (`app/src/server/domain/file-type.ts`): JPEG, PNG, WebP, PDF, MP4 (marcas `isom`, `iso2` a `iso6`, `mp41`, `mp42`, `avc1`, `dash`, `M4V `, `MSNV`, `XAVC`), MOV (`qt  `) e WebM (EBML com DocType `webm`). Tipo declarado, extensão final e conteúdo precisam concordar; senão 422, o objeto é apagado e o registro vira `REJEITADO` (auditado). Executável, SVG, HTML, XML, Office/ZIP, Matroska, HEIC e qualquer outro formato não são reconhecidos.
4. Só então o registro vira `DISPONIVEL` (tipo, tamanho e SHA-256 **medidos pelo servidor**). Falha ao gravar no banco apaga o objeto: nunca fica `DISPONIVEL` sem objeto.
5. **Idempotência**: repetir o `PUT` de um arquivo já finalizado devolve 200 com o mesmo resultado (sem gravar de novo); dois envios simultâneos do mesmo alvo geram um só objeto (publicação por `link`, que falha se a chave já existe).

### Limite conhecido: envio em uma só requisição

O envio é **um único PUT em streaming**. Vale para imagens e PDFs (até 20 e 50 MB) sem problema. Para vídeo de até 2 GB em rede móvel instável, uma queda obriga a **recomeçar do zero** (o alvo continua valendo até vencer, mas não há retomada por parte). Um protocolo em partes (por exemplo partes de 8 a 64 MB, cada uma com checksum e limite, montadas no servidor) não foi implementado: não há como provar a montagem de 2 GB nesta máquina e a spec manda não inventar complexidade sem teste. **Decisão pendente do dono**: se os vídeos reais passarem de algumas centenas de MB com frequência, projetar o envio em partes (ou usar o multipart nativo do S3, com URLs pré-assinadas por parte) antes do uso real. O PUT de 12 MB foi provado (acima dos 10 MB que o Proxy do Next bufferiza por padrão: ver "O proxy do Next" abaixo); 2 GB reais **não** foram provados.

## Fluxo de download

1. `POST .../assets/{id}/download` (admin ou portal): confere `asset:read`, que o arquivo é do cliente da sessão, está `DISPONIVEL` e é visível para esta pessoa (RLS + repositório); devolve `{ path: "/api/files/download/<token>", expiresAt }`, válido por `DOWNLOAD_URL_TTL_SECONDS` (60 s). É `POST` de propósito: gasta limite por pessoa e não pode ser disparado por link.
2. `GET /api/files/download/<token>` reconfere **a cada requisição**: sessão válida, assinatura, `token.userId == sessão`, participação ativa no cliente do token (`resolveTenantContext`) e visibilidade do arquivo. Qualquer falha de vínculo responde **404** (sem pistas); só a pessoa certa, com acesso válido, vê **410** quando o link venceu.
3. Arquivo com `scan_status = QUARENTENA` **não se baixa**: tanto a emissão do link quanto a entrega respondem **423** (`ASSET_QUARANTINED`), mesmo para um link emitido antes da quarentena. Hoje nada marca quarentena sozinho (não há antivírus); só a agência muda o estado, por banco, até existir tela. A emissão do link grava `asset.download_link_issued` na auditoria (sem token e sem chave).
4. A resposta é **sempre anexo**: `Content-Disposition: attachment; filename="<ASCII>"; filename*=UTF-8''<nome>` (nome limpo de controle, barras, aspas e inversão de texto), `Content-Type` do tipo validado, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store`. Nada na querystring muda isso. Sem suporte a `Range`.
5. Objeto sumiu do disco: 404 honesto e uma linha no log (`arquivo ausente no armazenamento asset=<id>`), sem chave nem caminho.

O token é HMAC-SHA256 (`app/src/server/storage/signed-token.ts`) com `STORAGE_SIGNING_SECRET` (32+ caracteres; obrigatório em produção; fora dela deriva do `BETTER_AUTH_SECRET`). Carrega finalidade (envio ou download), arquivo, cliente, pessoa e vencimento. **Trocar o segredo invalida todos os links** (aceitável: duram minutos).

## O proxy do Next e o corpo do envio

O `app/src/proxy.ts` só cobre `/admin`, `/portal`, `/api/admin`, `/api/portal` e `/api/me`. Quando o Proxy do Next está ativo numa rota, ele **bufferiza o corpo até 10 MB** (`proxyClientMaxBodySize`) e entrega só o início ao handler, sem erro. Por isso as rotas de bytes ficam em `/api/files/...`, **fora** do matcher: a sessão e o token são conferidos no próprio handler. **Nunca** mova o PUT de envio para uma rota coberta pelo Proxy, nem inclua `/api/files` no matcher.

Se houver um proxy reverso na frente (Nginx, Caddy), ele precisa **não** limitar o corpo abaixo do tamanho máximo (Nginx: `client_max_body_size 2100m;` só em `/api/files/upload/`) e **não** bufferizar o corpo em disco (`proxy_request_buffering off;`), além do que já está em `docs/proxy-e-ip.md`. Não testado em servidor real.

## Limites, tentativas, cota e capacidade

| Variável | Padrão | O que limita |
|---|---|---|
| `MAX_IMAGE_MB` / `MAX_PDF_MB` / `MAX_VIDEO_MB` | 20 / 50 / 2048 | tamanho por tipo |
| `UPLOAD_RATE_MAX` | 60 | pedidos de alvo de envio, por pessoa, a cada 10 min (429 com `Retry-After`) |
| `UPLOAD_PUT_RATE_MAX` | 120 | envios dos bytes (`PUT /api/files/upload/...`), por pessoa, a cada 10 min (429) |
| `DOWNLOAD_RATE_MAX` | 300 | pedidos de link e entregas, por pessoa, a cada 10 min |
| `DECISION_RATE_MAX` / `COMMENT_RATE_MAX` / `RECORDING_RATE_MAX` / `CONTENT_CREATE_RATE_MAX` | 60 / 60 / 20 / 120 | decisões de aprovação, comentários (conteúdo e roteiro), gravações e criação de conteúdo, por pessoa, a cada 10 min (429) |
| `MAX_PENDING_UPLOADS_PER_USER` | 10 | envios `PENDENTE` simultâneos por pessoa (429), conferido **sob trava por cliente** |
| `STORAGE_CLIENT_QUOTA_MB` | 10240 (10 GB) | bytes do **cliente inteiro**: `DISPONIVEL` + pendentes declarados, de todas as pessoas e inclusive arquivos internos da agência (422 `STORAGE_QUOTA_EXCEEDED`); 0 desliga |
| `STORAGE_GLOBAL_QUOTA_MB` | 102400 (100 GB) | teto da soma de TODOS os clientes (507 `STORAGE_FULL`); 0 desliga |
| `STORAGE_MIN_FREE_MB` | 2048 (2 GB) | espaço livre que o volume precisa manter depois de aceitar o arquivo, medido por `fs.statfs` no pedido e de novo no PUT (507); 0 desliga |
| `UPLOAD_URL_TTL_SECONDS` / `DOWNLOAD_URL_TTL_SECONDS` | 900 / 60 | validade dos links |

Os contadores por pessoa ficam na tabela `rate_limits` (`app:upload-init:user:<id>`, `app:mut-<tipo>:user:<id>`, `app:download-link:user:<id>`, `app:download:user:<id>`); a poda existente (`pruneRateLimits`) os apaga depois de 1 hora. Os limites são **por pessoa**, nunca um balde global: uma pessoa que estoura o dela não bloqueia as outras.

**Como a cota e os pendentes são conferidos (M-B).** O pedido de envio e a finalização do PUT tomam uma **trava consultiva por cliente** (`pg_advisory_xact_lock`) antes de contar pendentes e bytes; sem ela, pedidos paralelos liam o mesmo "ainda cabe" e passavam do limite. A soma de bytes do cliente vem de `client_storage_bytes` e a do teto global de `storage_bytes_total` (funções `SECURITY DEFINER` que só devolvem um número; a primeira só responde pelo cliente da sessão, a segunda só em escopo de sistema): somar pela sessão do cliente contaria apenas o que a RLS deixa ele ver, e somar pela RLS linha a linha custava 180 ms por pedido com 3 400 arquivos. **Ao finalizar o PUT a cota é conferida de novo**: acima dela o objeto é apagado, o registro vira `REJEITADO` (auditado) e a resposta é 422. O teto global e o espaço livre respondem **507** com mensagem clara; no PUT o registro continua `PENDENTE` e o mesmo alvo vale quando houver espaço.

**Limite conhecido do teto global:** não há trava entre clientes diferentes (travar todos os pedidos num ponto só custa mais do que deixar passar um pouco): pedidos simultâneos de clientes distintos podem ultrapassar o teto global por até (pedidos simultâneos × tamanho declarado). A proteção final é o espaço livre medido de verdade a cada envio.

### Dimensionar e vigiar o volume (produção)

- **Volume dedicado** para `STORAGE_LOCAL_DIR` (disco, partição ou volume só dos arquivos, montado fora da pasta do app e fora do volume do banco e dos logs). Assim, disco cheio de arquivos não derruba o banco, e o espaço livre medido é o do volume certo.
- **Dimensione pelas variáveis**: `STORAGE_GLOBAL_QUOTA_MB` deve ficar abaixo do tamanho do volume menos `STORAGE_MIN_FREE_MB` (por exemplo, volume de 200 GB: global 150000 e livre mínimo 20480); `STORAGE_CLIENT_QUOTA_MB` é o teto por cliente (cota por cliente × número de clientes pode passar do volume; é o teto global que fecha a conta). Os padrões (10 GB, 100 GB, 2 GB livres) são ponto de partida e **valor do dono**, não medida da VPS real.
- **Alerta de disco**: configure no monitoramento da VPS (ou num cron simples) um aviso quando o volume passar de 80% e outro aos 90%; a recusa 507 do app é o último recurso, não o alerta. Registre o ponto de aviso no runbook (`docs/runbook-producao.md`). Nada disso foi configurado ou provado num servidor real.
- A pasta (inclusive `.trash/`, que ocupa espaço até a retenção acabar, e `.install-id`) entra no backup junto com o banco.

## Limpeza de pendentes, órfãos e temporários

Função `cleanupFiles` (`app/src/server/services/files.ts`), regras puras em `app/src/server/domain/cleanup-policy.ts` e comando:

```
node scripts/limpar-arquivos.mjs --ambiente dev|test|producao [--horas 24] [--retencao-dias 30]
     [--max-orfaos 20] [--max-proporcao 0.1] [--vincular-instalacao] [--restaurar <chave>]
```

Usa o papel do app (`DATABASE_URL`, sem BYPASSRLS) em escopo de manutenção. **Antes de qualquer coisa** confere:

1. **`--ambiente` é obrigatório e é conferido contra o banco real** (mesma regra do `provisionar-producao.mjs`): `dev` só em `127.0.0.1`/`localhost` com `nexo_dev`; `test` só com `nexo_test` (`TEST_DATABASE_URL`); `producao` recusa `nexo_dev`/`nexo_test` e exige o host em `PROVISIONAR_HOST_PERMITIDO`. Divergência: recusa, código 2.
2. **`--horas` tem mínimo de 1** (0 mataria envios em andamento). `--retencao-dias` mínimo de 1.
3. **Identificador da instalação**: o banco guarda um `installation_id` aleatório (tabela `app_settings`, criado pela migration) e a pasta de arquivos guarda o mesmo em `.install-id`. Se faltar um dos lados ou se forem diferentes, a limpeza **aborta (código 3) sem tocar em nada**. A divergência nunca se corrige por flag; a falta nunca é criada em silêncio: só `--vincular-instalacao` (pedido explícito, a usar uma vez, depois de conferir que banco e pasta são o par certo) grava o que falta, copiando o que existe, e nunca sobrescreve. Se o banco for recriado do zero, o identificador novo não combina com a pasta e a limpeza se recusa a rodar: é o comportamento desejado. Para reaproveitar a pasta com um banco novo, o dono do banco ajusta o valor de `app_settings` de forma deliberada.

Depois faz, nesta ordem: (1) `PENDENTE` com mais de N horas vira `EXCLUIDO` e o objeto sai (auditoria `asset.pending_purged`); (2) garante que o objeto de `EXCLUIDO`/`REJEITADO` recentes não existe; (3) apaga temporários `.tmp/*.part` e objetos de arquivo já `EXCLUIDO`/`REJEITADO` com mais de N horas, e **move para a lixeira (`.trash/`, dentro da raiz) os objetos sem registro ("órfãos")**; (4) apaga de verdade o que está na lixeira há mais que a retenção (`STORAGE_TRASH_RETENTION_DAYS`, padrão 30 dias). **Nunca toca arquivo `DISPONIVEL`.** Rodar duas vezes seguidas não muda nada na segunda.

**Tetos antes de mover órfãos** (a limpeza aborta com código 3 e não move nada): mais de `CLEANUP_MAX_ORPHANS` órfãos (padrão 20); mais de `CLEANUP_MAX_ORPHAN_RATIO` (10%) dos objetos da pasta, quando a pasta tem 10 objetos ou mais; ou o banco sem nenhum arquivo `DISPONIVEL` com 10 objetos ou mais na pasta (provável banco errado). Quem opera pode aceitar o número de forma explícita (`--max-orfaos`, `--max-proporcao`); mesmo assim o órfão só vai para a lixeira.

**Restaurar da lixeira** (dentro da retenção): `node scripts/limpar-arquivos.mjs --ambiente producao --restaurar clients/<cliente>/<uuid>`. Recusa se a chave já existe. A chave do objeto aparece no registro do banco; para um banco errado, liste `.trash/clients/` no servidor e restaure o que for preciso. Depois da retenção o objeto some de vez.

Saída: uma linha JSON só com contadores (`pendingExpired`, `deletedObjectsRemoved`, `orphanObjectsTrashed`, `trashPurged`, `tempRemoved`); abortos saem em JSON no erro padrão (`abortado`, `motivo`, sem caminho, sem identificador). Agendamento sugerido (a decidir na fase 5): uma vez por hora no cron da VPS ou timer do systemd. A exclusão de arquivo pelo usuário já remove o objeto na hora; se falhar, a limpeza refaz.

**Limite aceito:** um backup restaurado do MESMO banco (mesmo identificador) mas mais velho que os arquivos passa pela trava de identificador; quem protege é o teto de órfãos/proporção e a lixeira de 30 dias (os arquivos sem registro não são apagados, e dá tempo de perceber e restaurar). O app não distingue "órfão de verdade" de "registro perdido num backup velho".

Backup: a pasta de arquivos precisa entrar no backup junto com o banco (registro sem objeto = arquivo perdido). Não testado.

## Antivírus

Não há (decisão do dono na spec: fase 5). A defesa é lista estrita de tipos, tipo real pelos bytes, entrega sempre como anexo com `nosniff`, o servidor nunca executa nem interpreta o arquivo, e o campo `scan_status` (`NAO_VERIFICADO`) pronto para quarentena. Um PDF ou vídeo permitido com conteúdo malicioso ainda pode ser baixado por quem tem acesso.

## O que o driver S3 vai precisar cumprir (quando for implementado)

Implementar `ObjectStorage` (`put`, `open`, `delete`, `list`, identificador da instalação, lixeira e `freeBytes`; no S3 a lixeira vira um prefixo `.trash/` com regra de ciclo de vida e o espaço livre vira o limite do bucket ou da conta) mantendo **todos** os comportamentos que os testes de `app/src/server/storage/storage.test.ts` e de `app/tests/integration/fase2-arquivos.test.ts` provam hoje. Pontos específicos:

1. **Bucket privado**: sem leitura pública, sem listagem pública, sem ACL por objeto; credenciais só em variáveis de ambiente do servidor (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` já estão em `.env.example` sem valor), nunca no navegador.
2. **`put` em streaming**: multipart do S3 (por exemplo `@aws-sdk/lib-storage`) alimentado pelo `ReadableStream`, **contando bytes e calculando SHA-256 no caminho**, abortando o multipart (`AbortMultipartUpload`) ao passar de `maxBytes` ou se a origem falhar. Sem buffer do arquivo inteiro. Guardar os primeiros `HEAD_BYTES` (4096) para o tipo real. Não sobrescrever chave existente (`If-None-Match: *` em `PutObject`/`CompleteMultipartUpload` quando o serviço suportar; senão conferir antes).
3. **Chave** `clients/<client_id>/<uuid>`, a mesma do disco, sem nome nem extensão. O tipo do objeto no S3 deve ser `application/octet-stream`; o tipo validado vem do banco e é aplicado na resposta pelo app.
4. **`open`**: `GetObject` em streaming; objeto ausente (`NoSuchKey`) devolve `null`, não erro. Alternativa a avaliar: depois da reautorização, responder `302` para uma URL pré-assinada de **60 s** com `response-content-disposition=attachment` e `response-content-type` fixos (economiza banda da VPS, mas o link pré-assinado não fica ligado à pessoa: o risco de repasse dura esses 60 s).
5. **`delete` idempotente**; **`list`** com `LastModified` para a limpeza de órfãos; regra de ciclo de vida do bucket para abortar multiparts incompletos com mais de 1 dia (`AbortIncompleteMultipartUpload`).
6. **Falha do S3** (rede, 5xx, credencial): `StorageUnavailableError` (503) sem detalhe interno e sem sucesso falso; nunca `DISPONIVEL` sem objeto.
7. **Cifra em repouso** (SSE) e **versionamento desligado** (ou política de expiração das versões antigas, para a exclusão realmente apagar). Backup/replicação conforme o serviço escolhido.
8. Acrescentar `S3` a `STORAGE_DRIVER` em `env.ts`, escolher o motor em `storage/index.ts` e rodar a **mesma bateria de testes** contra um bucket de teste (MinIO local ou conta de teste). Só então declarar a regra R-5 pronta para S3.

Dependência nova (SDK da AWS ou cliente S3 leve): conferir versão e licença com `python scripts/conferir_versoes.py <nome>` e fixar a versão exata antes de instalar.

## O que não foi provado

- S3 real, proxy reverso real, vídeo de 2 GB real, disco cheio real (o 503 é provado com uma pasta impossível de criar; o 507 por espaço livre é provado com o espaço livre simulado, e `fs.statfs` real só é provado como número positivo), volume dedicado e alerta de disco num servidor real, backup e restauração da pasta, antivírus, retomada de envio interrompido por partes, limpeza agendada rodando em produção.
