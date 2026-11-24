# Armazenamento privado de arquivos (R-5)

Como os arquivos dos clientes (artes, PDFs de roteiro, gravações) são guardados, enviados e baixados, o que já existe, o que ainda não existe e o que o driver S3 vai precisar cumprir. Decisões: `contexto/DECISOES.md` (D-0010, D-0015, D-0016). Regra e testes: `contexto/MODELO-DE-SEGURANCA.md` (R-5).

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
3. A resposta é **sempre anexo**: `Content-Disposition: attachment; filename="<ASCII>"; filename*=UTF-8''<nome>` (nome limpo de controle, barras, aspas e inversão de texto), `Content-Type` do tipo validado, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store`. Nada na querystring muda isso. Sem suporte a `Range`.
4. Objeto sumiu do disco: 404 honesto e uma linha no log (`arquivo ausente no armazenamento asset=<id>`), sem chave nem caminho.

O token é HMAC-SHA256 (`app/src/server/storage/signed-token.ts`) com `STORAGE_SIGNING_SECRET` (32+ caracteres; obrigatório em produção; fora dela deriva do `BETTER_AUTH_SECRET`). Carrega finalidade (envio ou download), arquivo, cliente, pessoa e vencimento. **Trocar o segredo invalida todos os links** (aceitável: duram minutos).

## O proxy do Next e o corpo do envio

O `app/src/proxy.ts` só cobre `/admin`, `/portal`, `/api/admin`, `/api/portal` e `/api/me`. Quando o Proxy do Next está ativo numa rota, ele **bufferiza o corpo até 10 MB** (`proxyClientMaxBodySize`) e entrega só o início ao handler, sem erro. Por isso as rotas de bytes ficam em `/api/files/...`, **fora** do matcher: a sessão e o token são conferidos no próprio handler. **Nunca** mova o PUT de envio para uma rota coberta pelo Proxy, nem inclua `/api/files` no matcher.

Se houver um proxy reverso na frente (Nginx, Caddy), ele precisa **não** limitar o corpo abaixo do tamanho máximo (Nginx: `client_max_body_size 2100m;` só em `/api/files/upload/`) e **não** bufferizar o corpo em disco (`proxy_request_buffering off;`), além do que já está em `docs/proxy-e-ip.md`. Não testado em servidor real.

## Limites, tentativas e cota (por pessoa, nunca globais)

| Variável | Padrão | O que limita |
|---|---|---|
| `MAX_IMAGE_MB` / `MAX_PDF_MB` / `MAX_VIDEO_MB` | 20 / 50 / 2048 | tamanho por tipo |
| `UPLOAD_RATE_MAX` | 60 | pedidos de alvo de envio, por pessoa, a cada 10 min (429 com `Retry-After`) |
| `DOWNLOAD_RATE_MAX` | 300 | pedidos de link e entregas, por pessoa, a cada 10 min |
| `MAX_PENDING_UPLOADS_PER_USER` | 10 | envios `PENDENTE` simultâneos por pessoa (429) |
| `STORAGE_CLIENT_QUOTA_MB` | 51200 | `DISPONIVEL` + pendentes declarados do cliente (422); 0 desliga |
| `UPLOAD_URL_TTL_SECONDS` / `DOWNLOAD_URL_TTL_SECONDS` | 900 / 60 | validade dos links |

Os contadores ficam na tabela `rate_limits` (`app:upload-init:user:<id>`, `app:download-link:user:<id>`, `app:download:user:<id>`); a poda existente (`pruneRateLimits`) os apaga depois de 1 hora.

## Limpeza de pendentes, órfãos e temporários

Função `cleanupFiles` (`app/src/server/services/files.ts`) e comando:

```
node scripts/limpar-arquivos.mjs [--ambiente dev|test|producao] [--horas 24]
```

Usa o papel do app (`DATABASE_URL`, sem BYPASSRLS) em escopo de manutenção. Faz, nesta ordem: (1) `PENDENTE` com mais de 24 h vira `EXCLUIDO` e o objeto sai (auditoria `asset.pending_purged`); (2) garante que o objeto de `EXCLUIDO`/`REJEITADO` recentes não existe; (3) remove objetos sem registro (ou só com registro encerrado) e temporários `.tmp/*.part` com mais de 24 h. **Nunca toca arquivo `DISPONIVEL`.** Rodar duas vezes seguidas não muda nada na segunda. Saída: uma linha JSON só com contadores. Agendamento sugerido (a decidir na fase 5): uma vez por hora no cron da VPS ou timer do systemd. A exclusão de arquivo pelo usuário já remove o objeto na hora; se falhar, a limpeza refaz.

Backup: a pasta de arquivos precisa entrar no backup junto com o banco (registro sem objeto = arquivo perdido). Não testado.

## Antivírus

Não há (decisão do dono na spec: fase 5). A defesa é lista estrita de tipos, tipo real pelos bytes, entrega sempre como anexo com `nosniff`, o servidor nunca executa nem interpreta o arquivo, e o campo `scan_status` (`NAO_VERIFICADO`) pronto para quarentena. Um PDF ou vídeo permitido com conteúdo malicioso ainda pode ser baixado por quem tem acesso.

## O que o driver S3 vai precisar cumprir (quando for implementado)

Implementar `ObjectStorage` (`put`, `open`, `delete`, `list`) mantendo **todos** os comportamentos que os testes de `app/src/server/storage/storage.test.ts` e de `app/tests/integration/fase2-arquivos.test.ts` provam hoje. Pontos específicos:

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

- S3 real, proxy reverso real, vídeo de 2 GB real, disco cheio real (o 503 é provado com uma pasta impossível de criar), backup e restauração da pasta, antivírus, retomada de envio interrompido por partes.
