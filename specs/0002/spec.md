# Segunda entrega: planos, ciclos, conteúdos, aprovação, arquivos privados e roteiros (fase 2)

Estado: em andamento (aprovada pelo dono em 2026-11-24, com as recomendações das decisões pendentes: interface de storage com disco local em dev e S3-compatível em produção a decidir após o inventário da VPS; limites 20 MB/50 MB/2 GB; sem antivírus na fase 2; e-mail e notificações na fase 4; aprovação só pelo cliente; cota cheia no primeiro ciclo, ajustável) · Data: 2026-11-24

Fonte do produto completo: contexto/ESPECIFICACAO-MESTRE.md (seções 5, 5.2, 5.3, 8, 9, 10, 11 fase 2 e 12). Esta spec cobre só a fase 2 do roadmap: "Planos, ciclos, conteúdos, versões, aprovação, roteiros e arquivos". Critério de aceite do roadmap: fluxo completo persistido, aprovação por versão, upload privado e progresso correto. Parte da base da fase 1 (specs/0001/spec.md, revisada): login por convite, isolamento por `client_id` com RLS, auditoria imutável.

## Objetivo e atores

Fazer a agência planejar o mês de cada cliente (plano, assinatura, ciclo com cota), produzir conteúdos com versões, levá-los à aprovação do cliente no portal, receber arquivos e gravações em armazenamento privado, e mostrar ao cliente o progresso real do que foi entregue, sem vazar rascunho, nota interna nem dado de outro cliente.

Atores (os mesmos da fase 1): ADMIN (dono da agência), STAFF (equipe, só clientes atribuídos), CLIENT_OWNER e CLIENT_COLLABORATOR (pessoas do cliente).

## Ordem das histórias e ajustes em relação à sugestão

Mantive a ordem sugerida P1 a P5, com dois ajustes:

1. **P1 inclui um cadastro mínimo de conteúdo** (título, formato, data prevista, "conta na cota"), só para que a cota e o contador "planejadas" tenham o que contar e a P1 seja útil sozinha. Versões, fluxo completo de status e calendário ficam na P2. O cálculo de progresso é testado por inteiro com dados de teste desde a P1 (função pura); as telas mostram "planejadas" e, conforme os status avançam nas histórias seguintes, os demais contadores.
2. **A aprovação (P3) vem antes dos arquivos (P4)**, como sugerido. Justificativa: a legenda e o texto de CTA são entrega contratada por si (copy/legendas) e a aprovação por versão é a regra mais delicada do produto, melhor provada antes de misturar upload. O modelo de dados da P2 já prevê o vínculo de arquivos à versão, então a P4 só preenche esse vínculo sem mudar as regras de aprovação. O critério da P4 repete o teste "editar arquivo aprovado invalida a aprovação". Se o dono preferir aprovar arte e vídeo já na primeira demonstração, a P4 pode passar à frente da P3 sem mudar o resto.

## Histórias por prioridade

### P1: Plano, assinatura e ciclo mensal com cota e progresso

- Jornada: o admin cria um plano de serviço (nome, valor, cota de publicações por mês, revisões por peça, prazo de aprovação, escopo e exclusões), cria a assinatura do cliente (vigência, dia de cobrança, valor e escopo "congelados" a partir do plano), abre o ciclo editorial de um mês (cota do mês copiada da assinatura) e planeja as peças do mês. O cliente abre `/portal/plan` e vê o plano contratado, a vigência, o escopo e o progresso do mês.
- Por que vem primeiro: sem plano e ciclo não há o que produzir nem o que medir; é a base do "valor demonstrado" ao cliente.
- Teste independente: criar plano, assinatura e ciclo para o Cliente A; cadastrar 12 peças planejadas; o portal do Cliente A mostra 12 planejadas, 0 publicadas e a cota 12; o Cliente B não vê nada disso. A função de progresso passa em testes unitários com todos os cenários da seção "Cálculo de progresso".
- Dado um admin autenticado, quando cria assinatura e ciclo de um mês, então a cota do ciclo fica gravada e não muda se o plano for alterado depois.
- Dado um ciclo já criado para a mesma assinatura e mês, quando o admin tenta criar outro, então recebe conflito (409) e nada duplica.
- Dado um ciclo encerrado, quando o plano ou a assinatura mudam, então o ciclo mantém cota, escopo e contadores do fechamento.

### P2: Conteúdos com versões, fluxo de status completo e calendário

- Jornada: o admin ou o STAFF atribuído completa o conteúdo (canal, objetivo, pilar, legenda, CTA, hashtags, briefing, responsável, data), cria versões (rascunho, depois "enviada para aprovação"), move o status pelo fluxo permitido, cancela com justificativa, registra a publicação (URL HTTPS ou evidência, mais data) e vê tudo no calendário mensal por formato, com reagendamento validado.
- Por que vem em segundo: transforma o plano em produção real e alimenta os contadores de progresso.
- Teste independente: percorrer PLANEJADO até ANALISADO com um conteúdo; transições inválidas recusadas (422) com a lista do que é permitido; cancelar sem justificativa recusado; publicar sem URL nem evidência recusado; calendário mostra a peça no dia certo e o reagendamento fora das regras é recusado.
- Dado um conteúdo em EM_PRODUCAO com versão pronta, quando é enviado para aprovação, então a versão fica imutável e o status vira AGUARDANDO_APROVACAO.
- Dado um conteúdo PUBLICADO, quando alguém tenta editar o material, então a edição é recusada.

### P3: Aprovação pelo cliente no portal, vinculada à versão

- Jornada: a pessoa autorizada do cliente abre `/portal/approvals`, vê a fila de peças aguardando, abre uma, lê a prévia (legenda, CTA, hashtags e, depois da P4, os arquivos), comenta, aprova ou pede revisão com comentário. A decisão grava versão, autor e horário. O admin vê o resultado no conteúdo.
- Por que vem em terceiro: é o coração do processo e a regra mais sensível (silêncio não aprova, edição invalida, concorrência).
- Teste independente: aprovar e pedir revisão por HTTP real e navegador; segunda decisão sobre a mesma versão recusada; nova versão devolve à fila; usuário do Cliente B não alcança nada.
- Dado uma versão AGUARDANDO_APROVACAO, quando um CLIENT_OWNER aprova, então o conteúdo vira APROVADO e a aprovação guarda `version_id`, autor e horário.
- Dado um conteúdo APROVADO, quando o material é editado, então nasce uma nova versão, a aprovação anterior fica invalidada (com o motivo) e o conteúdo volta a AGUARDANDO_APROVACAO.
- Dado um conteúdo aguardando aprovação, quando o prazo passa sem resposta, então o status não muda e o item aparece como "atrasado" para a agência (silêncio não aprova).
- Dado um comentário interno, quando o cliente abre o conteúdo, então o comentário e qualquer rascunho não aparecem em tela, API nem exportação.

### P4: Arquivos privados (assets) com upload e download por URL assinada

- Jornada: o admin ou STAFF anexa prévias a uma versão (arte, páginas de carrossel em ordem, vídeo) e o PDF de um roteiro; o cliente envia arquivos permitidos (gravações, na P5); quem tem permissão baixa ou visualiza por URL assinada de poucos segundos, gerada só depois da autorização.
- Por que vem em quarto: dá o corpo visual às versões e é a base das gravações; é onde mora o maior risco de segurança novo (R-5).
- Teste independente: enviar imagem, PDF e vídeo pequeno; baixar com a URL assinada dentro do prazo; a mesma URL falha depois do prazo; arquivo executável, HTML e tipo disfarçado são recusados; usuário do Cliente B recebe 404 ao pedir arquivo do A, inclusive com a URL assinada de outra pessoa; não existe arquivo servido de pasta pública.
- Dado um arquivo permitido, quando o envio termina, então o servidor confere tamanho, tipo real (pelo conteúdo, não pelo nome) e só então o marca como disponível.
- Dado um arquivo vinculado a uma versão já enviada, quando alguém tenta trocar ou remover o vínculo, então a operação é recusada e a saída é criar nova versão.

### P5: Roteiros por cenas e gravações

- Jornada: o admin ou STAFF cria o roteiro (opcionalmente ligado a um conteúdo) com cenas ordenadas, instruções, prazo e responsável, anexa o PDF e o envia ao cliente. O cliente lê o roteiro em `/portal/scripts`, baixa o PDF, envia a gravação (arquivo ou link HTTPS autorizado) e marca como enviada. O admin confirma o recebimento, ou pede regravação com justificativa; o roteiro segue o fluxo de status até a publicação.
- Por que vem em quinto: depende de arquivos (P4) e de conteúdos (P2), e é o fluxo mais longo; a agência já opera sem ele nas primeiras semanas.
- Teste independente: criar roteiro, enviar, gravar como cliente, confirmar como admin, pedir regravação e repetir; link `http://` ou de rede interna recusado; cliente do B não vê o roteiro do A.
- Dado um roteiro em RASCUNHO, quando o cliente lista seus roteiros, então ele não aparece.
- Dado uma gravação enviada pelo cliente, quando o admin confirma, então o roteiro vai a GRAVACAO_RECEBIDA e a confirmação fica auditada com autor e horário.

## Casos-limite e erros

- **Ciclo duplicado**: mesma assinatura e mesmo mês/ano retorna 409; também protegido por unicidade no banco (duas requisições simultâneas criam um só). Ciclo fora da vigência da assinatura é recusado (422).
- **Assinatura sobreposta**: um cliente não pode ter duas assinaturas ATIVAS com vigências que se cruzam (409).
- **Cota igual a zero ou ausente**: o progresso mostra "sem cota definida", nunca divide por zero.
- **Upload grande ou interrompido**: acima do limite configurável, o alvo assinado recusa o envio (limite embutido na URL) e o servidor confere de novo ao finalizar (413 na API própria); envio interrompido pode ser retomado enquanto o alvo vale; registro `PENDENTE` nunca aparece nem baixa; pendentes e órfãos com mais de 24 horas são limpos por tarefa idempotente; arquivo de zero byte é recusado; "finalizar" repetido devolve o mesmo resultado, sem duplicar.
- **Arquivo malicioso**: executáveis (exe, msi, dll, bat, cmd, sh, ps1, jar, apk, com, scr), scripts, HTML, SVG (pode ter script), XML e documentos de Office com macro (docm, xlsm, pptm) são recusados. Tipo real conferido pelos primeiros bytes (assinatura do arquivo): se o conteúdo não bate com a extensão ou com o tipo declarado, 422 e o objeto é apagado. Dupla extensão (`foto.jpg.exe`) e extensão em maiúsculas são tratadas. Nome original só serve para exibição (sem caracteres de controle nem de inversão de texto, até 255 caracteres), nunca como caminho. Arquivo é servido com `Content-Disposition: attachment` (inline só para imagem e vídeo validados), `X-Content-Type-Options: nosniff` e `Content-Type` do tipo validado.
- **Aprovação concorrente de duas pessoas**: a primeira decisão vence (transação com trava do conteúdo e unicidade de decisão ativa por versão); a segunda recebe 409 com "já decidida por [nome] em [data]". Se a mesma pessoa repete a mesma decisão (duplo clique), a resposta é a mesma da primeira, sem nova linha. Aprovar enquanto outra pessoa pede revisão: vence quem chegou primeiro, o outro recebe 409.
- **Decisão sobre versão antiga**: se uma nova versão foi enviada enquanto o cliente olhava a anterior, a decisão sobre a antiga recebe 409 "versão desatualizada" e a tela recarrega a atual.
- **Edição depois da aprovação**: ver P3. O que muda o "material" (legenda, CTA, hashtags, arquivos e ordem das páginas, formato, canal) exige nova versão e invalida a aprovação. O que é só planejamento (data prevista, responsável, pilar, notas internas) pode mudar sem invalidar. Conteúdo PUBLICADO ou ANALISADO não tem o material editado; correção entra como comentário.
- **Cliente A tentando versão ou arquivo do cliente B**: por URL, por API, por URL assinada reaproveitada, por `?clientId=` ou por id no corpo, a resposta é 404 (mesmo para id inexistente), sem diferença que revele se existe. O banco impede também a ligação cruzada (chaves estrangeiras compostas com `client_id`): vincular arquivo do A a conteúdo do B falha mesmo por consulta direta.
- **Staff não atribuído**: 404 em conteúdo, versão, roteiro, arquivo e calendário do cliente não atribuído, como na fase 1.
- **Aprovação por quem não pode**: STAFF e ADMIN não aprovam em nome do cliente (403); CLIENT_COLLABORATOR sem permissão `content:approve` vê a peça e comenta, mas o botão de aprovar não existe e a API responde 403.
- **Links não HTTPS e SSRF**: só `https://`, sem usuário e senha na URL, sem IP literal, `localhost`, nomes internos (`.local`, `.internal`) nem intervalos privados (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, `::1`, `fc00::/7`), porta ausente ou 443, até 2048 caracteres, sem espaço nem caractere de controle; domínios de gravação precisam estar na lista autorizada. O servidor nunca busca nem pré-visualiza o endereço (sem unfurl), nada é seguido por redirecionamento, e na tela o link abre em nova aba com `rel="noopener noreferrer nofollow"` e o domínio visível. `javascript:`, `data:`, `file:`, `http:` e `//host` são recusados (422).
- **Cancelar**: justificativa obrigatória (pelo menos 10 caracteres); sem ela, 422. CANCELADO é terminal.
- **Publicar** sem URL HTTPS nem evidência (arquivo) ou sem data: 422.
- **Reagendar** para dia fora do mês do ciclo sem mover de ciclo, para o passado de peça já publicada, ou peça cancelada: 422 com motivo.
- **Cota alterada no meio do mês**: só ADMIN, com justificativa; guarda valor anterior e auditoria; ciclo encerrado não aceita.
- **Armazenamento indisponível** (disco cheio, S3 fora): upload falha com mensagem clara (503); nenhum registro `DISPONIVEL` sem objeto; nunca sucesso falso. Download: se o objeto sumiu, 404 honesto e registro no log.
- **Sem permissão**: acesso negado sem stack trace, igual à fase 1.
- **Exclusão de arquivo**: só quem enviou ou ADMIN, e nunca de arquivo ligado a versão enviada; o registro vira EXCLUIDO e o objeto é removido por tarefa idempotente; falha na remoção do objeto fica no log para limpeza.

## Fluxo, telas e estados

### Rotas da fase

Admin: `/admin/plans` (catálogo, nova versão), `/admin/subscriptions` (por cliente, estado, ciclos), `/admin/calendar` (mês, filtro por cliente, formato e status), `/admin/contents` e `/admin/contents/[id]` (versões, arquivos, comentários, aprovações, publicação), `/admin/scripts` e `/admin/scripts/[id]` (cenas, gravações, status).
Portal: `/portal/plan`, `/portal/calendar`, `/portal/contents` e `/portal/contents/[id]`, `/portal/approvals`, `/portal/scripts` e `/portal/scripts/[id]`. O `/portal` ganha o cartão "Ações necessárias" (aprovações e gravações pendentes), sem notificação por e-mail.
API: handlers próprios no mesmo molde da fase 1 (`src/server/http/`: CSRF, limite, erros uniformes, DTO com lista explícita de campos). Arquivos: criação de alvo de envio, finalização, e emissão de URL de download; nenhum caminho serve arquivo sem passar pela autorização.
Cada tela com estados vazio, carregando, erro e acesso negado; 360, 768 e 1440 px; tema claro e escuro; teclado e axe como na fase 1. Calendário: visão mensal e visão em lista (equivalente acessível); reagendar por formulário de data é obrigatório, arrastar é conveniência.

### Fluxo de status do conteúdo

PLANEJADO → EM_PRODUCAO → AGUARDANDO_APROVACAO → APROVADO → AGENDADO → PUBLICADO → ANALISADO.

- Pedido de revisão do cliente: AGUARDANDO_APROVACAO → EM_REVISAO; nova versão enviada: EM_REVISAO → AGUARDANDO_APROVACAO.
- AGENDADO é registro manual da agência (não confirma nada na Meta). É opcional: APROVADO pode ir direto a PUBLICADO.
- CANCELADO: de qualquer estado até AGENDADO, com justificativa; é terminal. PUBLICADO e ANALISADO não cancelam.
- ANALISADO é o último estado normal. Não há retrocesso, exceto a invalidação de aprovação (APROVADO ou AGENDADO → AGUARDANDO_APROVACAO, só por nova versão).
- PUBLICADO exige URL HTTPS ou arquivo de evidência e a data de publicação; nada é publicado automaticamente.
- Uma única função de transição (máquina de estados) decide o que é permitido; telas e API só a chamam.
- **Atraso** é calculado (data prevista passou sem PUBLICADO, ANALISADO ou CANCELADO), mostrado como selo, e não substitui o status. "Aguardando o cliente há N dias úteis" também é só selo (dias úteis = segunda a sexta; feriados fora do cálculo).
- **Revisões excedentes**: ao registrar um pedido de revisão acima de `revisões por peça` do plano, o conteúdo é sinalizado "revisão acima do combinado" para a agência combinar com o cliente; nada é cobrado nem bloqueado.

### Cálculo de progresso (regra única, uma função testada)

Considera só conteúdos do ciclo com `conta na cota = verdadeiro` e status diferente de CANCELADO.

- **Planejadas**: todos os conteúdos que contam, de qualquer status (menos CANCELADO).
- **Produzidas**: os que já tiveram uma versão enviada para aprovação: AGUARDANDO_APROVACAO, EM_REVISAO, APROVADO, AGENDADO, PUBLICADO, ANALISADO.
- **Aprovadas**: APROVADO, AGENDADO, PUBLICADO, ANALISADO (aprovação válida e não invalidada).
- **Publicadas**: PUBLICADO e ANALISADO. Este é o numerador do progresso.
- **Progresso** = publicadas que contam ÷ cota do ciclo, exibido em porcentagem inteira arredondada para baixo (99,6% aparece 99%; só chega a 100% com publicadas ≥ cota), junto da fração (ex.: 7 de 12).
- **Excedente** = max(publicadas que contam − cota, 0), mostrado à parte; o progresso trava em 100%.
- **Fora da cota**, mostrado à parte e nunca somado: Stories (padrão `conta = falso` ao criar), bônus (`bônus = verdadeiro`) e qualquer outro marcado como não contável. A classificação (conta / bônus) só é alterada pelo ADMIN, com registro na auditoria; o STAFF vê e não altera. Cancelados nunca contam em nenhum contador.
- **Ciclo encerrado**: ao encerrar, os contadores finais e o escopo vigente são gravados num retrato do ciclo e as telas passam a ler o retrato; mudar plano, assinatura ou classificação depois não altera o histórico. O ADMIN pode reabrir com justificativa (auditado). Peças não concluídas ficam no ciclo encerrado, marcadas "não concluída no ciclo"; mudar de ciclo é ação explícita do ADMIN, com justificativa.
- Exemplo de verificação (dados fictícios, cota 12): 5 PUBLICADO + 2 ANALISADO + 1 APROVADO + 1 AGENDADO + 1 AGUARDANDO_APROVACAO + 1 EM_REVISAO + 1 EM_PRODUCAO, todos contando; mais 1 Story PUBLICADO, 1 bônus PUBLICADO e 2 CANCELADO. Resultado esperado: planejadas 12, produzidas 11, aprovadas 9, publicadas 7, progresso 7 de 12 (58%), excedente 0, fora da cota 2 publicados. Segundo cenário: 14 publicadas que contam, cota 12 dá 100% e excedente 2.

### Aprovação e visibilidade

- Versões: `RASCUNHO` (só a agência vê, editável) e `ENVIADA` (imutável, vê o cliente se o conteúdo for compartilhado). Enviar cria a fila do cliente; a última versão enviada é a "atual".
- Decisão do cliente: `APROVADO` ou `REVISAO_SOLICITADA` (comentário obrigatório). A decisão sempre aponta para uma versão, nunca para o conteúdo em geral. Autor e horário vêm da sessão e do servidor, nunca do corpo da requisição.
- Aprovação é válida enquanto a versão é a atual e `invalidated_at` está vazio. Nova versão invalida a anterior com motivo ("nova versão"), mantendo a linha como histórico.
- Conteúdo `INTERNO` (padrão) ou `COMPARTILHADO`. O cliente vê só conteúdos compartilhados, e só as versões ENVIADAS. Campos expostos ao cliente por lista explícita: título, formato, canal, data prevista, status em linguagem do cliente, legenda, CTA, hashtags, arquivos da versão atual e das anteriores enviadas, decisões, comentários compartilhados, URL de publicação. Nunca: briefing interno, notas internas, objetivo e pilar estratégicos, rascunhos, comentários internos, quem da equipe é o responsável (só o nome da pessoa se a agência marcar como visível), classificação de cota.
- Comentários: `INTERNO` (só agência) e `COMPARTILHADO` (agência e cliente). Cliente só cria compartilhados. Comentário não é editável nem apagável nesta fase (histórico).

### Fluxo de status do roteiro

RASCUNHO → ENVIADO → AGUARDANDO_GRAVACAO → GRAVACAO_RECEBIDA → EM_EDICAO → AGUARDANDO_APROVACAO → FINALIZADO → PUBLICADO.

- Cliente vê o roteiro a partir de ENVIADO; RASCUNHO é interno.
- Gravação do cliente: arquivo ou link; marcar como enviada cria `recordings` com status `ENVIADA`; admin/staff confirma (`RECEBIDA`, roteiro vai a GRAVACAO_RECEBIDA) ou pede regravação com justificativa obrigatória (`REGRAVACAO_SOLICITADA`, a justificativa fica visível ao cliente e o roteiro volta a AGUARDANDO_GRAVACAO). Envios anteriores continuam no histórico.
- Antes do primeiro envio de gravação com pessoas, o cliente marca "tenho autorização das pessoas que aparecem"; a marca e o horário ficam gravados.
- Se o roteiro está ligado a um conteúdo, AGUARDANDO_APROVACAO exige o conteúdo em AGUARDANDO_APROVACAO, FINALIZADO exige APROVADO ou adiante, PUBLICADO exige PUBLICADO. A aprovação do vídeo editado é a do conteúdo (versão com o arquivo final); não existe aprovação separada do roteiro. Sem ligação, o status é manual. O sistema não edita vídeo.
- Campos do roteiro: título, objetivo, duração prevista, responsável, prazo, local, equipamento, formato vertical 9:16, instruções de áudio, luz e enquadramento, referências (links HTTPS ou arquivos), checklist (lista simples em JSON), PDF anexado e cenas (ordem, fala, ação e duração).

### Armazenamento (R-5)

- Uma **interface de storage** (`src/server/storage`) com dois motores: **disco local** para desenvolvimento e teste, e **compatível com S3** para produção. A tela, a API e os testes não conhecem o motor. Escolha do serviço S3 fica nas decisões pendentes.
- Disco local: pasta fora de `public/` e fora de `app/`, configurada por variável de ambiente; download por token assinado (HMAC, validade, objeto e pessoa) validado pela rota própria, que reconfere a permissão a cada requisição.
- Chave do objeto aleatória (`clients/<client_id>/<uuid>`), sem nome original, sem extensão confiada ao usuário. Bucket sem leitura pública, sem listagem.
- Tempo de validade (configurável): alvo de envio até 15 minutos (vídeo grande), download até 60 segundos. Gerados só depois de `assertCan` e da checagem de que o arquivo é do cliente da sessão e da entidade ligada.
- Envio em partes (multipart) para arquivos grandes, com progresso na tela e possibilidade de retomar.
- Sem pasta pública, sem URL permanente, sem arquivo do cliente dentro de `public/`.

## Dados, contratos e permissões

Tabelas desta fase: `service_plans`, `subscriptions`, `editorial_cycles`, `contents`, `content_versions`, `approvals`, `comments`, `scripts`, `script_scenes`, `recordings`, `assets`, `asset_links`. Esta fase não cria projetos/campanhas nem contas sociais: `campanha` fica de fora e `canal` é uma lista fixa (Instagram como padrão), a revisar quando essas tabelas existirem.

- `client_id` obrigatório e RLS forçada com GRANT na mesma migration em todas as tabelas acima, exceto `service_plans`. `service_plans` é catálogo da agência, sem `client_id`; só o escopo de staff (ADMIN e STAFF) lê, nunca o portal. O portal lê plano e preço só do retrato guardado na assinatura. Todos os repositórios aceitam apenas contexto resolvido da sessão (nunca `clientId` do navegador).
- Chaves estrangeiras compostas `(client_id, id)` entre tabelas de cliente (conteúdo → ciclo, versão → conteúdo, aprovação → versão, gravação → roteiro, vínculo → arquivo e destino), para o banco recusar associação entre clientes.
- `service_plans`: nome, versão, valor em centavos, cota mensal, revisões por peça, prazo de aprovação em dias úteis, escopo, exclusões, ativo. Plano publicado não é editado: mudança cria nova versão; assinaturas existentes continuam com o retrato.
- `subscriptions`: cliente, plano e versão, retrato de escopo, valor, cota, revisões e prazo, início, fim, dia de cobrança (só guardado; cobrança é a fase 3), estado (ATIVA, PAUSADA, ENCERRADA).
- `editorial_cycles`: assinatura, ano, mês, cota do ciclo e valor anterior se ajustada, estado (ABERTO, ENCERRADO), retrato de fechamento; único por assinatura, ano e mês.
- `contents`: ciclo, título, descrição, formato (arte, carrossel, Reel animado, Reel humanizado, Story, outro), canal, objetivo, pilar, data prevista (data local do cliente), publicado em, URL, responsável, status, visibilidade, `conta na cota`, bônus, versão atual, justificativa de cancelamento.
- `content_versions`: conteúdo, número (sequencial por conteúdo), legenda, CTA, hashtags, briefing, estado (RASCUNHO, ENVIADA), autor, enviada em. Versão ENVIADA não muda (gatilho no banco e teste).
- `approvals`: versão, decisão, comentário, autor, horário, invalidada em e motivo; no máximo uma decisão ativa por versão (índice único parcial); sem UPDATE exceto invalidação, sem DELETE (gatilho, no molde da auditoria).
- `comments`: conteúdo ou roteiro (exatamente um), versão opcional, autor, corpo (até 2000 caracteres), visibilidade.
- `scripts`, `script_scenes`, `recordings` (arquivo ou link, enviada por, estado, justificativa, autorização de imagem, confirmação por e horário).
- `assets`: chave de armazenamento, tipo validado, bytes, checksum SHA-256, nome original, quem enviou, estado (PENDENTE, DISPONIVEL, REJEITADO, EXCLUIDO), `scan_status` (NAO_VERIFICADO, LIMPO, QUARENTENA; fica NAO_VERIFICADO até a decisão sobre antivírus), visibilidade. `asset_links`: um arquivo, um destino tipado (versão, roteiro, gravação ou evidência de publicação, por colunas próprias com chave composta e `CHECK` de exatamente um destino), função (PREVIA, FINAL, REFERENCIA, PDF_ROTEIRO, GRAVACAO, EVIDENCIA) e posição (ordem das páginas do carrossel).
- Auditoria (fase 1, imutável) recebe: plano e assinatura criados ou alterados, ciclo criado, encerrado, reaberto, cota ajustada, mudança de status, versão enviada, decisões de aprovação e invalidação, mudança de classificação, cancelamento, publicação, upload finalizado ou rejeitado, exclusão de arquivo, confirmação de gravação e pedido de regravação. Sem texto de comentário nem conteúdo de arquivo no diff.

### Papéis e permissões (deny-by-default, em `permissions.ts`)

| Ação | ADMIN | STAFF atribuído | STAFF não atribuído | CLIENT_OWNER | CLIENT_COLLABORATOR |
|---|---|---|---|---|---|
| Plano, assinatura, abrir/encerrar/reabrir ciclo, ajustar cota, mudar classificação de cota | sim | só ler | 404 | só ler o próprio plano e progresso | só ler o próprio plano e progresso |
| Criar e editar conteúdo, versões, calendário, publicar, cancelar | sim | sim (permissão `content:write`, padrão) | 404 | não | não |
| Ver conteúdos | todos | os atribuídos | 404 | só compartilhados | só compartilhados |
| Comentar | interno e compartilhado | interno e compartilhado | 404 | só compartilhado | só compartilhado |
| Aprovar ou pedir revisão | não | não | não | sim | só com `content:approve` |
| Roteiros: criar, editar, enviar, confirmar gravação, pedir regravação | sim | sim (`script:write`) | 404 | não | não |
| Ver roteiros | todos | atribuídos | 404 | a partir de ENVIADO | a partir de ENVIADO |
| Enviar gravação, arquivo ou link | sim | sim | 404 | sim | sim |
| Anexar arquivos a versões e roteiros, baixar o que vê | sim | sim | 404 | só baixar o que vê | só baixar o que vê |

As permissões `content:approve`, `content:write` e `script:write` usam o campo `permissions` de `client_members` que a fase 1 já criou. Telas de gestão dessas permissões não entram nesta fase; o ADMIN as define por tela mínima em `/admin/clients/[id]` ou, se não couber, por seed (a decidir na implementação, registrar no handoff).

### Requisitos para o modelo de segurança (contexto/MODELO-DE-SEGURANCA.md)

- **R-5 (a preencher nesta fase)**: arquivos em storage privado, URL assinada curta só depois de autorização, chave aleatória, validação de tipo real, tamanho e extensão, bloqueio de executáveis e HTML ativo. Dono no código: a definir na implementação (`src/server/storage` e o serviço de download). Testes obrigatórios listados em "Critérios".
- Novas regras a registrar com número fixo: integridade da aprovação (versão, autor e horário vindos do servidor; unicidade; invalidação), validação de link externo (HTTPS, sem SSRF, sem fetch no servidor) e visibilidade ao cliente (lista explícita de campos, nada interno).
- Exposição nova: upload de arquivo de usuário e download. Dados pessoais: imagem e voz de pessoas nas gravações (autorização marcada, minimização, retenção a definir na fase 5).
- Limite de tentativas (fase 1, `consumeRateLimit`) estendido a criação de alvo de upload e a emissão de URL de download, por usuário.

## Critérios de sucesso mensuráveis

- Admin cria plano, assinatura, ciclo e 12 peças planejadas para um cliente de teste em menos de 10 minutos; o cliente vê o plano e "0 de 12" no portal.
- O cálculo de progresso passa nos testes unitários: o exemplo da seção "Cálculo de progresso" (7 de 12, 58%, excedente 0, 2 fora da cota), o cenário com excedente 2, cota zero, cancelados fora de todos os contadores, Story e bônus fora, ciclo encerrado preservando números depois de mudar plano e classificação.
- 100% dos testes de isolamento passam para todas as rotas e tabelas novas: usuário do A não lê, lista, altera, baixa nem exporta nada do B (conteúdo, versão, aprovação, comentário, roteiro, gravação, arquivo e URL assinada), e STAFF não atribuído recebe 404. Consulta direta ao banco, sem filtro, na conexão do app só devolve linhas do contexto (RLS por tabela, como `rls.test.ts`).
- Transições: 100% das transições inválidas do conteúdo e do roteiro recusadas por teste de tabela completa (estado de origem × destino).
- Aprovação: duas pessoas aprovando ao mesmo tempo (requisições paralelas, 20 repetições) geram uma única decisão e um 409; editar o material de um conteúdo APROVADO gera versão nova, invalida a aprovação e devolve à fila; decisão sobre versão antiga dá 409; silêncio por 30 dias de teste (relógio simulado) não muda o status.
- Visibilidade: nenhum rascunho, nota ou comentário interno aparece em resposta, tela ou arquivo do cliente (teste automático varre as respostas do portal procurando marcas plantadas).
- Upload e download: arquivo permitido sobe, finaliza e baixa; URL de download expira (teste com relógio); URL de outra pessoa ou de outro cliente falha; executável, HTML, SVG, extensão trocada, dupla extensão e tipo declarado diferente do real são recusados; arquivo acima do limite recusado; envio interrompido não deixa `DISPONIVEL`; pendente antigo é limpo.
- Links: lista de casos (`http://`, `javascript:`, `data:`, `https://127.0.0.1`, `https://[::1]`, `https://169.254.169.254`, `https://usuario:senha@host`, `https://host:8443`, `https://x.internal`, domínio fora da lista) todos recusados; nenhuma chamada de rede de saída feita pelo servidor ao validar (teste com cliente HTTP instrumentado).
- E2E (Playwright): admin cadastra A e B com dados fictícios; admin planeja, cria versão e envia; cliente do A aprova uma peça e pede revisão de outra; admin registra publicação com URL; admin cria roteiro, cliente envia gravação, admin confirma e depois pede regravação; cliente do A tenta ids e arquivos do B por URL e API e é bloqueado; telas em 360, 768 e 1440 px, claro e escuro, axe sem violações.
- A busca por o nome, o @ e o dominio do cliente real em seed, testes e fixtures não encontra nada (dados de exemplo são fictícios).
- Lint, typecheck, testes e build passam com os comandos reais de `quality/checks.json` (`python scripts/verificar.py --executar`), sem reduzir os testes da fase 1.
- Migrations novas com GRANT e RLS no mesmo arquivo, reversão ensaiada em `nexo_test` e `migrate diff` sem diferença em `nexo_dev` (como D-0006 e D-0007).

## Suposições

- Ciclo = mês-calendário (competência), conforme a especificação (`year`, `month`). A vigência do primeiro cliente de exemplo começa no dia 10; o primeiro ciclo é parcial. Suposição: o ADMIN ajusta a cota do primeiro ciclo ao criá-lo (padrão: cota cheia da assinatura), com justificativa registrada. O dono deve confirmar se a cota do mês parcial é proporcional.
- Um cliente tem no máximo uma assinatura ATIVA por vez. Renovação cria nova assinatura que começa depois da anterior.
- Quem aprova: CLIENT_OWNER sempre; CLIENT_COLLABORATOR somente com a permissão `content:approve` dada pelo ADMIN. ADMIN e STAFF não aprovam em nome do cliente (aprovação combinada por WhatsApp continua fora do sistema até o dono decidir o contrário; ver decisões pendentes). CLIENT_COLLABORATOR pode comentar e enviar gravação e arquivo; CLIENT_OWNER também.
- Ação de plano, assinatura, ciclo e classificação de cota é só do ADMIN. STAFF atribuído opera conteúdos, roteiros e arquivos.
- "Produzidas" significa "já teve versão enviada para aprovação"; "aprovadas" e "publicadas" seguem a tabela de progresso. As quatro contagens são cumulativas pelo funil (toda publicada também é aprovada e produzida).
- Stories entram com `conta na cota = falso`. Bônus é marcado à mão.
- AGENDADO é opcional. Dias úteis = segunda a sexta, sem calendário de feriados.
- Pedido de revisão exige comentário; aprovação pode ter comentário opcional. Comentários não são editáveis.
- Limites e tipos padrão provisórios (configuráveis, valores finais nas decisões pendentes): imagem até 20 MB (JPEG, PNG, WebP), PDF até 50 MB, vídeo até 2 GB (MP4, MOV, WebM), cota de armazenamento por cliente configurável.
- Lista inicial de domínios autorizados para link de gravação: Google Drive, Dropbox, WeTransfer, iCloud, YouTube e Vimeo (não listado). O ADMIN altera a lista.
- Link de publicação de Instagram precisa ser de `instagram.com`; outros canais seguem a regra geral de HTTPS.
- Sem antivírus nesta fase; a defesa é lista de tipos permitidos, tipo real pelo conteúdo, serviço como anexo, arquivo nunca executado nem interpretado pelo servidor, e o estado `scan_status` pronto para quarentena.
- Sem e-mail nem notificação nesta fase: o cliente é avisado pela agência fora do sistema; dentro do sistema há o cartão "Ações necessárias" e a fila de aprovações.
- Dados do primeiro cliente (Cliente Modelo, Essencial, 12 publicações, distribuição 3 artes, 4 carrosséis, 3 vídeos animados e 2 humanizados) viram só fixture fictícia: plano "Essencial (exemplo)" com valor fictício, "Cliente A" e "Cliente B" da fase 1. Nada de nome, logo, contrato, valor real ou link real no seed público; o cadastro real é feito pela interface em produção, com autorização.
- Reuso da fase 1: Better Auth, `withTenant`, `consumeRateLimit`, auditoria imutável, padrão de handlers e de testes (`tests/integration`, `tests/http`, `e2e`).

## Referências e armadilhas

- contexto/ESPECIFICACAO-MESTRE.md (seções 5.2, 5.3, 8, 9, 10, 11 e 12), contexto/MODELO-DE-SEGURANCA.md (R-1, R-2, R-4 a R-6, R-10), contexto/DECISOES.md (D-0003, D-0004, D-0007), playbook/saas/arquivos-emails-tarefas.md (upload em S3, URL assinada, chave no servidor, tarefas idempotentes), playbook/saas/multiempresa.md, playbook/seguranca.md, playbook/licoes-de-producao.md (GRANT e RLS são camadas diferentes; tabela nova precisa dos dois).
- Ler o guia do Next.js da versão instalada em `node_modules/next/dist/docs/` antes de seguir exemplos externos (rota de download com streaming, Cache Components e dados por usuário).
- Armadilhas: confiar no `Content-Type` e na extensão enviados; usar o nome original como caminho; deixar a URL assinada de download viver por minutos ou horas; servir arquivo de `public/`; aceitar `id` de arquivo ou versão sem conferir o cliente; esquecer GRANT na tabela nova (RLS passa, app falha); aprovar sem trava de linha (corrida); contar Story, bônus ou cancelado no progresso; mostrar ao cliente o campo errado do DTO; cache do Next mostrando arquivo ou conteúdo de outro usuário; hospedar arquivo na mesma origem com tipo ativo (HTML, SVG).

## Fora do escopo, dependências e riscos

- Fora desta fase: contratos e documentos contratuais (fase 3), relatórios (fase 3), financeiro e cobrança (fase 3), pagamento (nunca nesta base), indicadores e métricas, central de links, melhorias e reuniões (fase 4), notificações in-app e e-mail (fase 4, ver decisão pendente), integrações Meta ou Postiz e publicação automática (fase 6), edição de vídeo, geração automática de PDF de roteiro, projetos e campanhas, contas sociais, importação do calendário aprovado por CSV, MFA (fase 5), deploy (fase 5). Aprovação em nome do cliente também fica fora.
- Dependências: PostgreSQL local (já existe), storage local em disco para dev e teste. Para produção: S3 compatível ou MinIO, depende da capacidade da VPS (ainda desconhecida; ver decisão pendente). Nenhuma biblioteca nova deve entrar sem `python scripts/conferir_versoes.py <nome>` e versão fixa (detecção de tipo real por assinatura de arquivo e SDK S3 são os candidatos).
- Riscos: arquivo de vídeo grande esgotar o disco da VPS; tipo real mal detectado; corrida na aprovação; vazamento de campo interno no DTO do portal; custo de armazenamento e banda desconhecido; sem antivírus, um PDF ou vídeo malicioso baixado por outra pessoa; regras de cota do primeiro ciclo parcial ainda sem decisão do dono.

## Decisões pendentes (para o dono)

Cada uma vira registro em contexto/DECISOES.md (D-0010 em diante) quando o dono decidir. Nenhuma bloqueia começar a P1 e a P2; a P4 e a P5 precisam das duas primeiras.

1. **Onde guardar os arquivos** [PRECISA ESCLARECER]
   - Recomendação: criar uma interface de storage com driver de disco local para desenvolvimento e teste e driver compatível com S3 para produção. Escolher MinIO na própria VPS ou serviço S3 (Cloudflare R2, Backblaze B2) depois de rodar `scripts/inventario-vps.sh` na VPS e olhar disco livre, RAM e backup.
   - Por que: a capacidade da VPS é desconhecida e vídeo pesa muito; com a interface, a escolha não muda o código das telas e dá para decidir com números. Armazenamento externo evita lotar o disco, mas tem custo recorrente e leva vídeo de cliente para um terceiro (LGPD).
2. **Tamanho máximo de vídeo e tipos aceitos** [PRECISA ESCLARECER]
   - Recomendação: valores iniciais configuráveis: imagem 20 MB, PDF 50 MB, vídeo 2 GB; tipos JPEG, PNG, WebP, PDF, MP4, MOV e WebM; revisar com os arquivos reais do primeiro mês.
   - Por que: o limite define disco, banda e tempo de envio do cliente; um vídeo vertical de celular costuma ficar entre 100 MB e 1 GB. Limite alto demais enche o disco; baixo demais volta o cliente ao WhatsApp. DOCX, áudio e outros tipos entram só se houver necessidade real.
3. **Antivírus e quarentena** [PRECISA ESCLARECER]
   - Recomendação: nesta fase, sem antivírus, com lista estrita de tipos, tipo real pelo conteúdo, arquivo servido como anexo e estado `scan_status` pronto. Decidir ClamAV (no servidor ou em contêiner) na fase 5, depois do inventário da VPS, que mostra se há memória para ele (costuma pedir cerca de 1 GB de RAM).
   - Por que: antivírus consome memória, exige atualização de assinaturas e pode travar vídeo grande; a lista estrita já elimina os formatos mais perigosos. O risco que sobra é um arquivo permitido (PDF, vídeo) com conteúdo malicioso.
4. **E-mail e notificações entram na fase 2?** [PRECISA ESCLARECER]
   - Recomendação: não. Ficam na fase 4 (central de notificações, SMTP e lembretes sem duplicidade). Na fase 2 a agência avisa o cliente por fora do sistema e o portal mostra "Ações necessárias".
   - Por que: SMTP ainda não existe (a fase 1 já mostra "indisponível" no reset de senha), exige domínio com SPF, DKIM e DMARC e tarefas agendadas idempotentes; misturar isso atrasa a prova de aprovação e arquivos. O custo é a agência lembrar o cliente à mão por um tempo.
5. **Aprovação em nome do cliente** (decisão menor)
   - Recomendação: não permitir nesta fase; se o cliente aprova por WhatsApp, a agência envia o link do portal e o cliente clica. Se o dono quiser registrar aprovação combinada fora do sistema, criar depois uma decisão com tipo "registrada pela agência" e prova anexada, nunca confundida com a aprovação do portal.
   - Por que: mistura de aprovação real e aprovação declarada enfraquece a prova de que o cliente aprovou aquela versão.
6. **Cota do primeiro ciclo parcial** (decisão menor)
   - Recomendação: cota cheia da assinatura, ajustável pelo ADMIN com justificativa, até o dono dizer qual é a regra do contrato (ex.: proporcional aos dias, ou ciclo de 10 a 09).
   - Por que: muda o número que o cliente vê como meta do primeiro mês.

## Execução e evidências

A preencher na implementação, por história e critério, como na spec 0001: comandos reais de `quality/checks.json` (`python scripts/verificar.py --executar`), testes de integração, HTTP e E2E, mutações feitas (código quebrado e restaurado) e o que não foi provado (por exemplo: storage S3 real, antivírus, upload de vídeo de tamanho real na VPS, proxy real). Migrations desta fase: uma por conjunto coerente, com GRANT, RLS e reversão ensaiada.

### Evidencias da camada de dados (2026-11-25, agente de dados)

Escopo desta entrega: tabelas, regras no banco, repositorios, servicos, permissoes, seed e testes de integracao. Sem HTTP, telas, backend de arquivos nem E2E (nao provados).

| Criterio da spec | Estado | Evidencia |
|---|---|---|
| Plano, assinatura e ciclo com cota; ciclo duplicado 409; ciclo fora da vigencia 422; cota congelada | provado em dados | `tests/integration/fase2-planejamento-arquivos.test.ts` (plano, assinatura, ciclo) |
| Uma assinatura ATIVA por cliente | provado (indice parcial e servico, 409 e corrida) | idem; mutacao: indice removido derrubou o teste |
| Progresso: exemplo 7 de 12 = 58%, excedente 2, cota zero, cancelados, Story e bonus fora, ciclo encerrado preservado | provado (unitario e a partir do banco) | `src/server/domain/progress.test.ts`; teste de progresso em `fase2-planejamento-arquivos.test.ts` |
| Transicoes: tabela completa origem x destino do conteudo e do roteiro | provado (unitario) | `content-state.test.ts` (3 gatilhos x 81 pares), `script-state.test.ts` |
| Aprovacao por versao, invalidacao, versao antiga 409, concorrencia 20 repeticoes | provado em dados (servico e banco) | `fase2-visibility-approval.test.ts` |
| Isolamento A x B em todas as tabelas novas, nas duas conexoes; FK composta; STAFF nao atribuido 404 | provado em dados | `fase2-isolation.test.ts` |
| Visibilidade: nenhuma marca interna na resposta do cliente | provado nas funcoes de dados e na RLS (nao em HTTP/tela/exportacao) | `fase2-visibility-approval.test.ts` |
| Upload, URL de download, expiracao, tipo real, limpeza de pendentes | NAO feito (backend de arquivos) | so registro, politica de tipo e tamanho, estados e gatilhos |
| Links: casos da spec recusados, sem rede | provado (unitario, `fetch` proibido) | `external-link.test.ts` |
| Busca por nome, @ e dominio do cliente real | zero ocorrencias | `grep -ri` em `app/prisma`, `app/src`, `app/tests`, `app/e2e`, `app/scripts` |
| Migration com GRANT e RLS no mesmo arquivo, reversao ensaiada, `migrate diff` vazio | provado em `nexo_test` e `nexo_dev` | ver HANDOFF |
| E2E, telas 360/768/1440, axe | NAO feito | fora desta entrega |

Mutacoes e decisoes: `contexto/HANDOFF.md` (secao Fase 2) e `contexto/DECISOES.md` (D-0010 a D-0014).


### Evidencias do backend (2026-11-25, agente de servidor)

Escopo desta entrega: armazenamento privado (driver de disco), handlers HTTP de admin e portal, testes HTTP reais contra o app compilado. **Sem telas, sem E2E de navegador, sem migration nova** (nenhum arquivo em `app/prisma` mudou). Decisoes: D-0015 a D-0018. Regras: R-5 (fechada), R-16 e R-17; R-12 a R-15 agora tambem por HTTP.

| Criterio da spec | Estado | Evidencia |
|---|---|---|
| Plano, assinatura, ciclo e 12 pecas; cliente ve plano e "0 de 12" | provado por API (sem tela) | `tests/http/fase2-fluxos.test.ts` (P1) |
| Ciclo duplicado 409 (inclusive 3 pedidos simultaneos), fora da vigencia 422, cota congelada apos mudar o plano, ajuste so ADMIN com justificativa, retrato do ciclo encerrado | provado | idem |
| Transicoes invalidas 422 com lista do permitido; cancelar sem justificativa 422; publicar sem URL/evidencia 422; publicado nao edita nem cancela; calendario por competencia; reagendar fora do mes 422 | provado por HTTP | `fase2-fluxos.test.ts` (P2); tabela completa origem x destino segue nos testes unitarios |
| Aprovacao por versao: so dono ou colaborador com `content:approve`; ADMIN, STAFF e colaborador comum 403; autor e horario so do servidor; segunda decisao 409; mesma pessoa repetindo = mesma resposta; versao desatualizada 409; edicao invalida a aprovacao; 10 rodadas simultaneas = 1 decisao + 1 409 | provado por HTTP | `tests/http/fase2-aprovacao.test.ts` |
| Silencio nao aprova (30 dias com relogio simulado) | nao ha o que simular: nenhuma tarefa aprova ou muda status por tempo; o teste so confirma que ler a fila e o conteudo nao muda nada | idem; selo de atraso continua na fase 4 |
| Visibilidade: nenhum rascunho, nota, objetivo, pilar, briefing ou comentario interno em resposta do portal; chaves exatas do JSON do cliente | provado por HTTP (varredura de marcas, 3 pessoas, 11 rotas) | `fase2-aprovacao.test.ts` (R-13, R-16) |
| Isolamento A x B em TODAS as rotas novas (leitura, edicao, listagem, download, anexo) e STAFF nao atribuido 404; banco do B identico antes e depois | provado por HTTP | `tests/http/fase2-idor.test.ts` (41 chamadas admin e 14 do portal, 5 tipos de pessoa). Exportacao: nao existe rota de exportacao nesta entrega |
| Upload: imagem, PDF e video (12 MB) sobem, finalizam e baixam identicos; so como anexo; sem arquivo em `public/` | provado por HTTP | `tests/http/fase2-arquivos.test.ts` |
| Arquivo malicioso: executavel como imagem, HTML, SVG, extensao dupla, MIME mentiroso, extensao trocada, sem extensao, HEIC como mp4: recusado, objeto apagado, `REJEITADO` auditado | provado (unitario, servico e HTTP) | `file-type.test.ts`, `fase2-arquivos.test.ts` (integracao e HTTP) |
| Acima do limite 413 (pedido e durante a gravacao, com e sem Content-Length); zero byte; incompleto; conexao que cai nao deixa `DISPONIVEL`, objeto nem temporario; repetir envio idempotente | provado | idem |
| URL de download expira (relogio simulado e relogio real de 5 s); de outra pessoa, de outro cliente, adulterada e de usuario sem acesso falham; perder acesso mata o link | provado | `storage.test.ts`, integracao e HTTP |
| Pendente antigo e orfao limpos por tarefa idempotente e por comando | provado | `fase2-arquivos.test.ts` (integracao, inclui o comando `scripts/limpar-arquivos.mjs` contra `nexo_test`) |
| Links: casos da spec recusados; nenhum acesso de rede ao validar | recusa provada por HTTP (14 casos) e por unitario com `fetch` proibido; **nao** ha cliente HTTP instrumentado dentro do servidor compilado | `fase2-fluxos.test.ts`, `external-link.test.ts` |
| Limite de tentativas em upload e download (por pessoa, 429 com Retry-After); CSRF; corpo invalido, gigante e campo desconhecido | provado por HTTP | `fase2-arquivos.test.ts` |
| Roteiro e gravacao: rascunho invisivel ao cliente, gravacao por link e por arquivo, confirmar, regravacao com justificativa visivel, historico, comentario interno escondido, envio repetido idempotente | provado por HTTP | `fase2-fluxos.test.ts` (P5) |
| Busca por nome, @ e dominio do cliente real | zero ocorrencias, agora em `quality/checks.json` (`dados-ficticios`) | `app/scripts/conferir-dados-ficticios.mjs` |
| E2E, telas 360/768/1440, axe | NAO feito | fora desta entrega |
| Armazenamento S3, proxy reverso real, video de 2 GB, antivirus, disco cheio real, retomada de envio por partes | NAO provado | `docs/armazenamento.md` |

Mutacoes (codigo quebrado de proposito, suite rodada, codigo restaurado): ver `contexto/HANDOFF.md`, secao "Fase 2: backend de arquivos e handlers HTTP".
