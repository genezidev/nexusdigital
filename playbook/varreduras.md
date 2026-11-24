# Varreduras e auditoria de segurança

Use antes do primeiro deploy em produção, antes de tornar um repositório público, ao montar o CI e antes de instalar skill, plugin ou servidor MCP de terceiros. Complementa o checklist de [seguranca.md](seguranca.md): o checklist diz o que precisa ser verdade; as ferramentas daqui procuram, sempre do mesmo jeito, o que escapou.

Regra geral: ferramenta determinística primeiro, revisão do agente depois. O scanner acha a mesma coisa toda vez; o agente acha quando por acaso olha. Detalhes, versões e riscos de cada ferramenta em `catalogo/repositorios.md`.

## Instalar na versão mais recente

Antes de instalar, confira a versão atual: `python scripts/conferir_versoes.py <nome>` compara a versão analisada no catálogo com a última release estável. Se a atual for mais nova, leia as notas da versão e os avisos de segurança do repositório antes. Instale sempre com o número da versão, nunca `latest`, e anote no handoff.

| Ferramenta | Windows | Mac e Linux |
|---|---|---|
| Gitleaks | `winget install --id Gitleaks.Gitleaks --exact --version <versao>` | `brew install gitleaks` ou o binário da release |
| Trivy | `winget install --id AquaSecurity.Trivy --exact --version <versao>` | `brew install trivy` ou o binário da release |
| Semgrep | `uv tool install semgrep==<versao>` (ou `pip install semgrep==<versao>` num ambiente virtual) | o mesmo |
| MobSF | Docker Desktop + imagem com versão | Docker + imagem com versão |

Os pacotes do `winget` apontam para o zip da release oficial no GitHub (hash conferido igual ao do arquivo `checksums.txt` da release em 2026-11-22). Quem baixar o zip à mão confere o hash com `Get-FileHash arquivo.zip` no PowerShell contra o `checksums.txt` da mesma release.

## Onde guardar os relatórios

Salve as saídas em `.seguranca/` (já no `.gitignore`) ou fora do projeto. Relatório nunca leva o valor de um segredo: só o detector, o arquivo, o commit e um trecho mascarado. Guarde no handoff o comando, a versão da ferramenta, a revisão analisada e o resumo do resultado.

## Segredos no histórico (Gitleaks)

```bash
gitleaks git --redact --report-path .seguranca/gitleaks.json .
```

- `gitleaks git` lê todo o histórico; `gitleaks dir` só a pasta atual. Um segredo apagado no último commit continua em todo clone: varra o histórico.
- `--redact` é obrigatório: sem ele, o relatório JSON guarda a chave inteira (conferido em teste). Com ele, o valor aparece como `REDACTED`.
- Código de saída 1 quando acha segredo, 0 quando não acha: serve direto no CI.
- Falso positivo (chave de teste, exemplo): marque a linha com o comentário `gitleaks:allow` ou copie o campo `Fingerprint` do relatório (formato `commit:arquivo:regra:linha`) para uma linha do `.gitleaksignore`, com o motivo no handoff.

**Achou um segredo real:**

1. Revogue e gere uma chave nova no fornecedor **antes** de mexer no Git. Limpar o histórico primeiro deixa a chave viva em clones, forks e caches enquanto você trabalha.
2. Troque **todas** as chaves que podem ter vazado de uma vez, não uma por semana. Quem já tem uma chave válida consegue roubar as novas enquanto a troca não termina.
3. Atualize as variáveis no painel ou no servidor (ver "Segredos no servidor" em [vps.md](vps.md)) e confirme que o app funciona com as chaves novas.
4. Repositório que vai ficar público e já teve segredo no histórico: crie um repositório novo com o estado atual, em vez de confiar na reescrita do histórico.
5. No GitHub, ative "Secret scanning" e "Push protection" nas configurações do repositório.

## Dependências, configuração e imagens (Trivy)

```bash
trivy fs --scanners vuln,misconfig,secret --disable-telemetry --skip-version-check .
trivy image --disable-telemetry --skip-version-check nome-da-imagem:versao
```

- `fs` confere as dependências pelos arquivos de trava (`package-lock.json`, `uv.lock`, `poetry.lock`, `go.sum` etc.), erros em `Dockerfile`, Kubernetes e Terraform, e segredos. `image` confere a imagem Docker que vai para produção.
- Inventário das bibliotecas (SBOM), pedido no nível 2 de [seguranca.md](seguranca.md): `trivy fs --format cyclonedx --output sbom.cdx.json --disable-telemetry --skip-version-check .`. Gere a cada versão publicada e guarde junto das notas da versão.
- No CI, use `--exit-code 1 --severity HIGH,CRITICAL` para barrar só o que é grave, e `--ignore-unfixed` quando ainda não existe versão corrigida.
- Sem as duas opções acima, o Trivy envia dados de uso anônimos e consulta o site da Aqua para avisar de versão nova.
- A primeira execução baixa a base de vulnerabilidades: levou 2min19s e o cache ficou com 1,7 GB no teste. As seguintes levaram 3 segundos. Use `--cache-dir` para escolher onde o cache fica e apague-o quando não precisar mais.
- Instale uma versão fixa (tabela acima) e confira o hash. Em março de 2026 credenciais roubadas da equipe publicaram uma versão com malware (v0.69.4) e redirecionaram quase todas as tags da `trivy-action`; quem fixava a ação por SHA de commit seguro ou usava release imutável não foi afetado.

Continue rodando também a auditoria da própria stack (`npm audit`, `pip-audit`), como pede [seguranca.md](seguranca.md).

## Código (Semgrep Community Edition)

```bash
semgrep scan --config p/default --metrics=off --disable-version-check
```

- Procura padrões perigosos no código (injeção, `eval`, criptografia fraca, segredo fixo) em mais de 30 linguagens. `--error` faz o comando falhar quando houver achados, para usar no CI.
- `--metrics=off` e `--disable-version-check` sempre: com regras baixadas do registro (`p/...`), o Semgrep envia métricas ao semgrep.dev, e por padrão consulta os servidores dele a cada execução para avisar de versão nova (conferido no teste). Mesmo assim ele grava um `anonymous_user_id` em `~/.semgrep/settings.yml`. Baixar `p/default` exige internet de qualquer jeito.
- As regras do registro têm licença própria, que não é de código aberto: use no projeto, nunca copie regras para esta base, templates ou curso. Regras escritas por você para o seu projeto (por exemplo, "toda consulta filtra pelo id da empresa") ficam em `.semgrep/` no próprio repositório.
- O login (`semgrep login`) e as regras "Pro" são opcionais e enviam dados à plataforma; não são necessários para iniciar.
- Funciona no Windows (testado com a 1.186.0, cerca de 20 segundos num projeto pequeno).

**Scanner não substitui o checklist.** No projeto de teste, o Semgrep achou `eval` com dado do usuário, SQL montado com texto e contêiner rodando como root, mas não achou senha guardada com MD5 nem a chave secreta com valor padrão `"dev"` quando a variável de ambiente falta. Esses itens continuam sendo conferidos por [seguranca.md](seguranca.md) e pela revisão.

## App mobile (MobSF)

Para Android e iOS, antes de enviar à loja, analise o arquivo gerado (APK, AAB ou IPA) com o MobSF rodando **no seu computador**:

```bash
docker run -it --rm -p 127.0.0.1:8000:8000 opensecurity/mobile-security-framework-mobsf:v<versao>
```

- Publique a porta só em `127.0.0.1` e troque a senha padrão (`mobsf`/`mobsf`) se o contêiner ficar de pé. Nunca deixe o MobSF acessível pela internet.
- Não envie app privado ao site público de demonstração nem ative o envio ao VirusTotal: o arquivo sai do seu controle.
- A análise estática basta para o iniciante; a dinâmica exige emulador ou aparelho preparado. O padrão de referência é o OWASP MASVS.
- Troque `<versao>` pela release atual (por exemplo `v4.6.9`); evite `latest`.
- No CI, a versão leve é o `mobsfscan`, que lê o código-fonte (Java, Kotlin, Swift, Objective-C, React Native, Expo, Cordova e Capacitor). Não lê Dart: em Flutter, analise o APK ou IPA no MobSF.
- **No Windows, o `mobsfscan` não serve sozinho**: o motor dele (`libsast` 3.2.0) desliga as regras de código Java, Kotlin e Swift quando detecta Windows, sem avisar. No teste, ele só listou boas práticas ausentes e deixou passar um WebView inseguro e um arquivo gravado com `MODE_WORLD_READABLE`. Rode o `mobsfscan` no CI (Linux) ou no WSL. No Windows, rode o Semgrep direto com as regras dele, o que achou as duas falhas:

```powershell
$regras = python -c "import mobsfscan, pathlib; print(pathlib.Path(mobsfscan.__file__).parent / 'rules' / 'semgrep')"
semgrep scan --config $regras --metrics=off --disable-version-check .
```

## Como tratar um achado

Vale para scanner, revisão do agente ou relato de terceiros.

- **Confirmado**: existe o caminho completo, de quem ataca até o dano, provado no código ou num teste local com dados falsos. Só achado confirmado recebe gravidade.
- **Precisa validar**: falta um fato específico (configuração do provedor, proxy, política do banco em produção). Escreva qual é o fato e como conferir com segurança. Sem gravidade.
- **Descartado**: a hipótese foi desmentida. Registre o porquê, para não ser reaberta.

Para chamar de vulnerabilidade, diga quem ataca, o que ele envia, qual regra deveria barrar, o que ele consegue e de quem. Falta de uma camada extra quando outra já bloqueia o ataque é melhoria, não vulnerabilidade. Gravidade segue o dano demonstrado: acesso aos dados de outra empresa ou de outra conta é alto; execução de código ou leitura do banco inteiro sem login é crítico.

Regras para o agente:

- Quem confirma o achado não é quem o encontrou: peça uma segunda revisão (outra sessão ou subagente) tentando desmentir.
- Nada de teste contra produção, serviço de terceiro ou dado real. Prova é local, com contas e dados falsos.
- A revisão descreve a menor correção e o teste que falharia antes dela; a correção vira tarefa com critério na spec.
- Uma rodada não esgota o projeto. Diga o que foi coberto e o que ficou de fora.
- Suprimir um alerta exige motivo e data de revisão, nunca "é falso positivo" sem explicação.

O que conta como falha neste projeto fica em [../contexto/MODELO-DE-SEGURANCA.md](../contexto/MODELO-DE-SEGURANCA.md).

## Antes de instalar skill, plugin ou MCP, ou de abrir repositório de terceiros

Skill é texto que o agente obedece; hook e servidor MCP são programas que rodam com o seu acesso. Antes de instalar, ou de abrir o agente dentro de um repositório baixado:

- Leia com o editor ou `cat`, antes de abrir o agente na pasta: `.claude/settings*.json`, `hooks/hooks.json`, `.mcp.json`, `.codex/config.toml`, `.vscode/tasks.json` e os `scripts` do `package.json`. Hooks e tarefas podem rodar sozinhos ao abrir.
- Desconfie de: comando que baixa e executa (`curl ... | bash`), permissão ampla (`Bash(*)`, `--yolo`, `danger-full-access`), leitura de `~/.ssh`, `.env` ou tokens, envio para endereço desconhecido, texto escondido (caracteres invisíveis, comentários HTML com instruções) e skill que manda ser usada "sempre".
- Prefira versão fixa (tag ou commit) a `@latest` e a branch `main`. Servidor MCP com `npx pacote@latest` muda sem aviso.
- Hooks de início de sessão e de fim de turno rodam em toda conversa e gastam tokens; plugins com muitas skills disputam etapas com as skills `scaff-*` (um processo por projeto).
- Na dúvida, clone numa pasta temporária e peça ao agente uma revisão só de leitura, sem executar nada do repositório.

## Agente de IA no GitHub Actions

Se o projeto usar Claude Code, Codex ou Gemini no CI:

- Título, corpo de issue, comentário, nome de branch e log de erro são texto de qualquer pessoa: não entram no prompt de um agente que tenha token com escrita ou acesso a segredos.
- Nunca combine `pull_request_target` com checkout do código do PR.
- Nada de `Bash(*)`, `--yolo` ou `danger-full-access` no CI, e nunca execute (`eval`, `$()`) o que o agente responder.
- Libere o gatilho só para pessoas do repositório, não para `*`.
- Fixe todas as ações por SHA de commit revisado (ver [fluxo.md](fluxo.md)).

## Fontes

Princípios reescritos com nossas palavras a partir de: [security-audit da Cloudflare](https://github.com/cloudflare/security-audit-skill) (MIT), [skills da Sentry](https://github.com/getsentry/skills) (Apache-2.0), [cybersecurity-skills](https://github.com/briiirussell/cybersecurity-skills) (MIT) e ideias, sem texto adaptado, das [skills da Trail of Bits](https://github.com/trailofbits/skills). Ferramentas: [Gitleaks](https://github.com/gitleaks/gitleaks) (MIT), [Trivy](https://github.com/aquasecurity/trivy) (Apache-2.0) e o [aviso oficial do ataque de março de 2026](https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23), [Semgrep](https://github.com/semgrep/semgrep) (LGPL-2.1; regras sob licença própria), [MobSF](https://github.com/MobSF/Mobile-Security-Framework-MobSF) (GPL-3.0). Detalhes em `catalogo/repositorios.md`.
