# Modelo de segurança

Diz a quem revisa o projeto (pessoa, agente ou ferramenta) o que precisa ser protegido, de quem, quais regras nunca podem falhar e o que conta como falha. Preencha quando o sistema tiver login, pagamento, dados pessoais, várias empresas ou arquivos enviados. Revise a cada mudança de exposição (novo domínio, API pública, app mobile) e antes do primeiro deploy.

Não confunda com `SECURITY.md`: o GitHub usa esse nome para a política de como reportar vulnerabilidades.

## Regras de preenchimento

- **Exposição primeiro.** Quem alcança o sistema (internet, só a rede interna, só o app mobile, só o administrador) muda a gravidade de quase tudo. Se não estiver confirmado, diga.
- **Regra com dono no código.** Cada regra cita o arquivo ou a função que **bloqueia** a violação. Algo que só registra em log ou envia alerta é "monitorado", não "garantido".
- **Números fixos.** Regras ganham `R-1`, `R-2`… e o número nunca é reaproveitado, para achados e testes citarem a regra.
- **Exceção estreita e com data.** Cada exclusão nomeia o tipo de falha e o local ("testes em `tests/`"); risco aceito tem data de revisão. "Rotas internas são confiáveis" sem dizer quais esconde falhas reais.
- **Nada sensível aqui.** Sem segredo, endereço interno, dado de cliente ou falha ainda não corrigida, principalmente se o repositório for público. Dúvidas em aberto vão para o handoff, não para este arquivo.
- Exclusões, riscos aceitos e gravidades rebaixadas precisam da confirmação do dono do projeto. Sem ela, marque `Sem decisão`: nada é suprimido.

## Modelo

```markdown
Última revisão: AAAA-MM-DD (ou "rascunho") · Vale para: este repositório

## Sistema e exposição
<o que o sistema faz, onde roda (web, API, mobile, desktop), quem alcança cada parte, o que fica fora>

## O que proteger
<dados pessoais, dados de pagamento, credenciais, dados de cada empresa, painel admin, filas, backups>

## Quem acessa e o que pode fazer
| Quem | Pode | Não pode |
|---|---|---|
| Visitante sem login | ver páginas públicas | ler dados de qualquer conta |
| Usuário de uma empresa | ler e editar dados da própria empresa | ver ou mudar dados de outra empresa |
| Administrador | ... | ... |
| Gateway de pagamento (webhook) | avisar mudança de cobrança | mudar plano sem reconsulta na API |

## Entradas que vêm de fora
<formulários, uploads, webhooks, parâmetros de URL, mensagens, arquivos importados, respostas de IA>

## Regras que nunca podem falhar
- **R-1** Toda leitura e escrita filtra pela empresa de quem pede. Garantido por: `<arquivo ou função>`. Monitorado por: `<se houver>`.
- **R-2** Ação que muda dados confere permissão no servidor antes de executar. Garantido por: `<...>`.
- **R-3** Segredos e tokens nunca aparecem em log, resposta da API ou erro. Garantido por: `<...>`.

Aposentadas: <R-n e motivo, quando houver>

## O que conta como falha
| Tipo | Regra | Relatar? | Gravidade |
|---|---|---|---|
| Ler ou mudar dado de outra empresa | R-1 | Sim | alta; crítica se sem login |
| Script injetado que só afeta a própria pessoa | — | Não | — |
| <tipo ainda sem decisão> | — | Sem decisão | padrão da ferramenta |

## Fora do escopo e riscos aceitos
- <o que, onde> — <por quê>.
- Risco aceito: <o que, onde> — <por quê>. Revisar em: AAAA-MM-DD.

## Limites conhecidos e compensações
<proteções que estão fora do código (Cloudflare, painel do provedor, política do banco) e o que depende delas>
```

## Como usar

- Revisão de segurança, `playbook/varreduras.md` e `playbook/seguranca.md` leem este arquivo para decidir o que é achado e qual a gravidade.
- Cada regra `R-n` deve ter um teste que falharia se ela fosse quebrada; cite o teste ao lado da regra quando existir.
- Se o código que uma regra cita mudar de nome ou lugar, atualize a regra no mesmo commit.

---

## Rascunho deste projeto (Nexo Digital)

Última revisão: 2026-11-25 (fase 2, camada de dados) · Vale para: este repositório. R-1 a R-4 e R-6 a R-15 têm dono no código e teste (integração em `nexo_test` e HTTP real contra o app compilado). R-5 tem só o rascunho da camada de dados; o backend de arquivos ainda não existe. R-12 a R-15 (fase 2) estão provadas só na camada de dados (sem HTTP nem tela).

**Sistema e exposição.** Aplicação web privada, na internet atrás de HTTPS, sem cadastro público. Painel admin e portal do cliente no mesmo sistema. Banco e storage sem porta pública.

**O que proteger.** Dados de cada cliente, contratos e documentos privados, cobranças e comprovantes, gravações de vídeo, credenciais e tokens, auditoria, backups.

| Quem | Pode | Não pode |
|---|---|---|
| Visitante sem login | ver `/login` e abrir convite ou reset válido | ler qualquer dado |
| CLIENT_OWNER / CLIENT_COLLABORATOR | ler dados publicados da própria empresa, conforme papel | ver outra empresa, notas internas, rascunhos; alterar financeiro, métricas ou contrato |
| STAFF | operar clientes atribuídos, conforme permissões | acessar cliente não atribuído; administração global |
| ADMIN | todos os clientes, usuários, financeiro e auditoria | consultar senha de alguém; apagar auditoria |

**Regras que nunca podem falhar** (donos no código e testes da fase 1; `app/tests/integration/` e `app/tests/http/`, banco `nexo_test`)
- **R-1** Toda leitura e escrita filtra pelo cliente da sessão, nunca por `clientId` vindo do navegador. Garantido por: `app/src/server/authorization/context.ts` (`resolveTenantContext` resolve o cliente da sessão e reconfere participação, bloqueio e status a cada requisição), `app/src/server/repositories/*.ts` (todo `where` leva `clientId` da sessão, inclusive por id; repositórios só aceitam `Scoped`, nunca um id solto), no banco, RLS forçada com papel `nexo_app` sem BYPASSRLS (`prisma/migrations/20261124151100_rls_e_papeis`, `app/src/server/db/scope.ts`) e, nas telas e handlers, `app/src/server/services/access.ts` (`resolveAdminClientContext`: a URL `/admin/clients/[id]` é só alvo; id malformado, inexistente ou de cliente não atribuído ao STAFF dá o mesmo 404) e `app/src/app/api/portal/client/route.ts` (não existe parâmetro de cliente: o contexto vem da sessão). Testes: `tenant-isolation.test.ts` (roda na conexão do app e na do dono, que ignora RLS, para provar o filtro de código), `rls.test.ts`, `staff-and-access.test.ts` e, por HTTP real, `tests/http/authorization.test.ts` (usuário do A recebe 403 em todas as rotas `/api/admin/*` e "Acesso negado" nas páginas, sem dado do B; `?clientId=` do B é ignorado; membro e convite do B na rota do A dão 404 e nada muda; STAFF não atribuído recebe 404; troca para cliente alheio dá 403). Limite: nos escopos de sistema (ADMIN entre clientes, convite por token, resolução de sessão, listas do próprio usuário) a RLS não protege; vale o código (D-0004).
- **R-2** Toda operação confere permissão no servidor, inclusive arquivos, exportações e jobs. Garantido por: `app/src/server/authorization/permissions.ts` (`assertCan`, nega por padrão) chamado dentro de cada função de repositório e serviço; em cada handler e página, `app/src/server/http/actor.ts` (`requireStaffArea`, `requireAdmin`, `requireClientUser`) e `app/src/server/page-session.ts` (o layout nunca é a única barreira); STAFF só entra com participação STAFF ativa (`context.ts`; gatilho `client_members_role_check` no banco). O `proxy.ts` é só a primeira barreira (cookie presente ou não, sem banco). Testes: `tenant-isolation.test.ts`, `staff-and-access.test.ts`, `invitations.test.ts` ("quem só lê não cria convite") e `tests/http/authorization.test.ts` (dono e colaborador não administram; STAFF não cria cliente, não convida, não bloqueia nem lê a auditoria global). Arquivos, exportações e jobs: ainda não existem (fase 2 em diante). Observação da mutação: tirar só a checagem de papel de `resolveAdminClientContext` não derruba teste, porque `requireStaffArea` já barra antes; tirar as duas derruba dois testes.
- **R-3** Senhas só existem como hash (Argon2id ou bcrypt); convites e resets são de uso único com validade. Garantido por: senha em `accounts.password` com scrypt do Better Auth (decisão D-0005, aceita pelo dono: scrypt equivale a Argon2id/bcrypt); convite em `app/src/server/services/invitations.ts` (só `token_hash`, UPDATE atômico `used_at IS NULL AND expires_at > agora`, 7 dias, mesmo 410 para inexistente, usado, revogado ou expirado); reset por `verification.storeIdentifier: "hashed"` e consumo único em `app/src/server/auth/auth.ts`, com `revokeSessionsOnPasswordReset`. Testes: `invitations.test.ts`, `auth-schema.test.ts` e `tests/http/accounts.test.ts` (convite criado pela API, aberto, aceito, segundo uso 410, token ausente do banco e da auditoria; reset por HTTP com token em hash, uso único e sessões antigas derrubadas).
- **R-4** Segredos, tokens e senhas nunca aparecem em log, resposta ou erro. Garantido por: repositórios nunca selecionam `token_hash` nem dados de senha (`invitations.ts`, `members.ts`), `sanitizeDiff` remove chaves sensíveis da auditoria (`repositories/audit.ts`), `app/src/server/http/respond.ts` (erro inesperado vira 500 genérico e o log guarda só o tipo, nunca a mensagem; sem stack), `app/src/server/http/dto.ts` (lista explícita de campos), `.env` fora do Git, o link do convite só na resposta da criação e nunca gravado em claro, e o cliente único da API (`app/src/lib/api/client.ts`) descarta campos fora do contrato (inclusive o `token` que o Better Auth devolve no login). Testes: `invitations.test.ts`, `tenant-isolation.test.ts`, `src/server/http/respond.test.ts`, `src/lib/api/client.test.ts` e `tests/http/*` (`expectNoLeak` em toda resposta de erro). Monitorado, não garantido: o Better Auth imprime avisos no stdout do servidor (ex.: "Invalid password", sem o valor); revisar logs de produção antes do deploy.
- **R-5 (RASCUNHO, fase 2; backend de arquivos pendente)** Arquivos ficam em storage privado, acessados por URL assinada curta após autorização. Já existe, na camada de dados: chave aleatória `clients/<client_id>/<uuid>` sem nome nem extensão do usuário e conferida por CHECK do banco (`assets_values_check`, migration `20261125100000`); registro `PENDENTE` que nunca aparece nem baixa (RLS e `getStorageKeyForDownload` em `app/src/server/repositories/assets.ts`); tipo e tamanho por lista (`app/src/server/domain/asset-policy.ts`, extensões perigosas, dupla extensão e maiúsculas); estado `DISPONIVEL` só com tipo, tamanho e SHA-256 medidos (`app/src/server/services/assets.ts`, `finalizeAsset`); `scan_status` pronto para quarentena e só a agência o muda (gatilho `assets_guard`); arquivo ligado a versão enviada não é excluído nem desligado (gatilhos `assets_guard` e `asset_links_guard`); interface `ObjectStorage` em `app/src/server/storage/types.ts` (D-0010). Testes: `tests/integration/fase2-planejamento-arquivos.test.ts`, `src/server/domain/asset-policy.test.ts`. **Falta (backend de arquivos):** drivers de disco e S3, URL assinada de poucos segundos emitida depois de `assertCan`, tipo real pelos primeiros bytes, servir como anexo com `nosniff`, limpeza de pendentes, limite de tentativas por usuário e os testes de expiração e de URL de outra pessoa. Até lá a regra NÃO está garantida de ponta a ponta.
- **R-6** Requisição que muda estado só vale se vier da própria origem (CSRF), e a sessão fica em cookie HttpOnly, SameSite=Lax (Secure em HTTPS), nunca em `localStorage`. Garantido por: `assertSameOrigin` em `app/src/server/http/handler.ts` (handlers próprios), `trustedOrigins`, `disableOriginCheck: false` e `disableCSRFCheck: false` explícitos em `app/src/server/auth/auth.ts` (o Better Auth desliga a checagem quando a variável `TEST` existe; por isso o app de teste a remove em `scripts/iniciar-app-teste.mjs`) e os atributos de cookie em `auth.ts`. Testes: `tests/http/accounts.test.ts` (Origin de outro site ou ausente dá 403, com cookie válido, no handler próprio e no Better Auth; cookie HttpOnly e SameSite), `e2e/jornada.spec.ts` (nada de token em storage nem em `document.cookie`).
- **R-7** Login, redefinição, troca de senha e aceite de convite têm limite de tentativas (429), em armazenamento de banco, sem balde global: um anônimo não bloqueia o login de outras pessoas. Garantido por: `app/src/server/http/auth-guard.ts` (corpo JSON obrigatório e lido como o Better Auth lê, 415/400 sem repassar o que não dá para contar; balde por IP validado; sem IP confiável, balde do e-mail, token ou sessão; no login, conta só falhas por (e-mail, IP /64) e teto por e-mail contra ataque distribuído, com marca de IP já conhecido; mesma resposta 429 para conta existente e inexistente; corpo acima de 8 KB dá 413; o limitador do Better Auth fica desligado em `auth.ts`), `app/src/server/http/client-ip.ts` (cabeçalho `TRUSTED_IP_HEADER` que só o proxy define, validação de IPv4/IPv6, tamanho e saltos, `TRUSTED_PROXIES`, IPv6 em /64; o cabeçalho interno `x-nexo-client-ip` é recalculado a cada requisição), `limitRequests` em `handler.ts` e `consumeRateLimit`/`pruneRateLimits` em `rate-limit.ts` (janela fixa atômica na tabela `rate_limits`, com poda em lotes por índice). Em produção o app não inicia sem `TRUST_PROXY` explícito (`app/src/server/config/env.ts`, `app/src/instrumentation-node.ts`). Testes: `tests/http/rate-limit.test.ts` (quatro instâncias do app compilado; formatos de corpo form-urlencoded, text/plain, sem Content-Type, BOM, charset, JSON inválido e token por query; um anônimo não tranca o admin vindo de outro IP; só falhas contam; teto distribuído; `x-forwarded-for` com vários valores, IP inválido, cabeçalho enorme, IPv6, cabeçalho interno forjado, 413, partida sem `TRUST_PROXY`), `tests/integration/rate-limit-prune.test.ts`, `src/server/http/client-ip.test.ts`, `src/server/config/env.test.ts` e `tests/http/accounts.test.ts`. Limite residual: um atacante distribuído com 100 ou mais falhas em 15 minutos para o mesmo e-mail ainda atrasa aquele login (mitigação: MFA do admin na fase 5 e banimento de IP no proxy); sem IP confiável, os anônimos dividem o balde do e-mail; volume de requisições é do proxy; a configuração real do proxy (`docs/proxy-e-ip.md`) só se prova no servidor.
- **R-8** Sessão revogada, conta bloqueada, participação revogada e STAFF desatribuído perdem o acesso na requisição seguinte. Garantido por: sessão lida no banco a cada requisição, sem cookie cache (`app/src/server/http/actor.ts`), `resolveTenantContext` e o bloqueio que também apaga as sessões (`app/src/server/services/members.ts`). Testes: `tests/http/authorization.test.ts` e `e2e/estados.spec.ts` (bloquear, encerrar sessões e desbloquear, vistos por outra sessão aberta).
- **R-9** Não existe cadastro público nem rota administrativa paralela do Better Auth. Garantido por: lista de permissão de rotas em `app/src/app/api/auth/[...all]/route.ts` (o resto responde 404, inclusive `/admin/*` do plugin, que pularia a auditoria do app), `disableSignUp` em `auth.ts` e recusa uniforme (503) do pedido de redefinição enquanto não há envio de e-mail, para não revelar quais e-mails existem. Teste: `tests/http/accounts.test.ts`.

- **R-10** A trilha de auditoria não é reescrita nem apagada, por nenhum papel nem por ação referencial. Garantido por: GRANT só de SELECT e INSERT em `audit_logs` para `nexo_app`, `REVOKE DELETE ON users FROM nexo_app` e os gatilhos `audit_logs_no_change` (UPDATE ou DELETE, inclusive o SET NULL das FKs) e `audit_logs_no_truncate` (migration `20261124210000_auditoria_imutavel`, D-0007; os gatilhos são `ENABLE ALWAYS`, valem também com `session_replication_role = replica`). Testes: `tests/integration/rls.test.ts` (app não apaga usuário e o autor continua gravado; nem o dono do banco apaga usuário, cliente ou linha, atualiza ou trunca; `tgenabled = 'A'`). Limite aceito, não eliminado: superusuário ainda pode `DISABLE TRIGGER`, `DROP TRIGGER` ou usar replicação lógica; isso é operação fora do app e deve ficar no registro de mudanças. Exclusão por LGPD da fase 5 é anonimização por UPDATE em `users`, nunca DELETE (D-0007).
- **R-11** O primeiro administrador e a senha do papel `nexo_app` em produção só nascem por caminho controlado, sem segredo em argumento, código ou log. Garantido por: `app/scripts/provisionar-producao.mjs` (ambiente declarado, confirmação explícita, host em `PROVISIONAR_HOST_PERMITIDO`, recusa se já existe ADMIN, checagem de senha que rejeita as piores e padrões óbvios (não garante senha forte), URL do banco sem `?host=`/`?port=`/`?options=` e validada pelo parse do driver, auditoria, transação única, nada impresso) e a recusa de produção do `db-migrar.mjs` e do `seed.ts`. Testes: `tests/integration/provisionar.test.ts`. Limite: o script não foi executado em produção; a escolha de rodá-lo é da pessoa responsável (`docs/runbook-producao.md`).

- **R-12** Aprovação é do cliente, vinculada a uma versão, e não se reescreve. Garantido por: política RLS `approvals_insert` (só `app.audience = 'client'` e `author_id = app.user_id`: nem ADMIN, nem STAFF, nem escopo de sistema), gatilho `approvals_guard` (horário do servidor; só a versão ATUAL, ENVIADA, de conteúdo AGUARDANDO_APROVACAO; UPDATE só para invalidar uma vez; sem DELETE nem TRUNCATE, `ENABLE ALWAYS`), índice único parcial `approvals_one_active_decision_per_version` (primeira decisão vence), gatilho `content_versions_guard` (versão ENVIADA imutável), `contents_guard` (ponteiro da versão atual só avança) e `contents_invalidate_approvals` (nova versão invalida a anterior), tudo na migration `20261125100000`; no código, `decideApproval` em `app/src/server/services/contents.ts` (permissão `content:approve`, trava consultiva por conteúdo, 409 `ALREADY_DECIDED` e `STALE_VERSION`). Testes: `tests/integration/fase2-visibility-approval.test.ts` (20 rodadas concorrentes, mutações descritas no handoff). Sem prova ainda: HTTP real e navegador.
- **R-13** O cliente só vê o que foi compartilhado e enviado: nunca rascunho, nota interna, comentário interno, objetivo, pilar, classificação de cota nem roteiro em rascunho. Garantido por: RLS por audiência (`app.audience`, gravado por `withTenant` em `app/src/server/db/scope.ts`) nas tabelas `contents`, `content_versions`, `approvals`, `comments`, `scripts`, `script_scenes`, `recordings`, `assets` e `asset_links`; no código, `visibleWhere` e as listas explícitas de campos do cliente em `app/src/server/repositories/contents.ts`, `scripts.ts` e `assets.ts`; o cliente só decide o status de conteúdo aguardando aprovação (política `contents_update_client_decision` e gatilho `contents_guard`). O progresso do portal vem de `cycle_progress_counts` (só números, `SECURITY DEFINER`, D-0012). Testes: `fase2-visibility-approval.test.ts` (varredura de marcas plantadas em tela de dados, nas duas conexões, e consultas cruas na RLS). Limite: a mesma varredura ainda não roda sobre respostas HTTP, telas nem exportações (não existem).
- **R-14** Link externo só HTTPS, sem credencial, porta, IP literal nem nome interno, e o servidor nunca o busca. Garantido por: `validateHttpsLink` em `app/src/server/domain/external-link.ts` (lista de domínios de gravação, Instagram só em instagram.com), usado por `submitRecording`, `createScript` (referências) e pela transição para PUBLICADO; CHECK `https://` no banco (`recordings_values_check`, `contents_values_check`). Testes: `external-link.test.ts` (todos os casos da spec, `fetch` proibido durante a validação), `fase2-planejamento-arquivos.test.ts`. Limite: a validação por texto não resolve DNS (um nome público que resolva para IP interno não é detectado; como o servidor nunca busca o endereço, o efeito fica no navegador de quem abre o link).
- **R-15** Nenhuma ligação entre clientes na fase 2, mesmo por SQL direto: chaves estrangeiras compostas `(client_id, id)` em todas as tabelas de cliente e RLS forçada com GRANT mínimo (sem DELETE onde o histórico se preserva). Garantido por: migration `20261125100000_planos_conteudos_aprovacao_arquivos` (reversão ensaiada em `nexo_test`), repositórios que filtram por `client_id` da sessão. Testes: `fase2-isolation.test.ts` (A x B em todas as tabelas novas, nas conexões do app e do dono; FK composta provada com o gatilho de regra desligado dentro de transação desfeita).

Aposentadas: nenhuma.

**O que conta como falha.** Ler ou mudar dado de outro cliente (R-1): relatar, gravidade alta (crítica sem login). Acesso a `/admin` ou ação administrativa por quem não é ADMIN/STAFF (R-2), aceitar mudança de estado de outra origem (R-6) e acesso após revogação, bloqueio ou desatribuição (R-8): relatar, gravidade alta. Demais tipos: Sem decisão.

**Limites conhecidos e compensações (telas, 2026-11-24).**
- Com Cache Components, uma página que decide acesso depois de começar a transmitir devolve status 200 com a tela "Acesso negado" (ou o redirecionamento no corpo). Os handlers de API devolvem 401, 403, 404, 409, 410, 422 e 429 de verdade. A decisão de acesso é a mesma e não vaza dado.
- O `proxy.ts` só confere a presença do cookie; quem decide é o servidor.
- Sem CSP com nonce e sem HSTS ainda (HSTS é do proxy HTTPS da VPS). A CSP entra na revisão de `playbook/varreduras.md` antes do primeiro deploy.
- Nenhuma revisão com `playbook/varreduras.md`, teste de carga ou teste de penetração foi feita.

---

Estrutura inspirada na skill `security-model` das [skills da Sentry](https://github.com/getsentry/skills) (Apache-2.0), que por sua vez adapta a `define-security-policy` do [openai/codex-security](https://github.com/openai/codex-security) (Apache-2.0). Texto reescrito e simplificado em português pela base.
