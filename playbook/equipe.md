# Equipe de agentes e orquestrador

A sessão principal do Claude Code ou do Codex é o orquestrador: conversa com a pessoa, segue as fases, chama os agentes especialistas e confere o que eles entregam. Os agentes ficam em `.claude/agents/` (Claude Code) e `.codex/agents/` (Codex), gerados a partir da mesma fonte.

## Quando delegar

Delegar custa tokens e tempo: cada agente começa do zero e relê os arquivos. Delegue só quando ganhar algo:

- **Revisão independente**: quem revisa não escreveu o código (`scaff-revisor`, `scaff-seguranca`).
- **Trabalho em paralelo** com arquivos separados (por exemplo, backend e frontend de uma fatia com o contrato da API já fechado).
- **Leitura extensa** que poluiria a conversa principal (explorar um código grande, rodar varreduras longas).

Correção pequena, pergunta rápida ou um arquivo só: o orquestrador faz direto.

## Fases e agentes

| Fase | Skill | Agente | Entrada | Saída |
|---|---|---|---|---|
| Entrevista | `scaff-iniciar` com [entrevista.md](entrevista.md) | `scaff-produto` | briefing, PDF, conversa | `contexto/PROJETO.md`, resumo confirmado |
| Spec e PRD | `scaff-iniciar` | `scaff-produto` | respostas da pessoa | `specs/<id>/spec.md`; `contexto/PRD.md` se outra pessoa aprova ([modelo](../modelos/PRD.md)) |
| Arquitetura | `scaff-arquitetura` | `scaff-arquiteto` | spec | opções em `contexto/DECISOES.md`, escolha aceita |
| Design | `scaff-design` | `scaff-designer` | spec, decisões | `design/DESIGN.md`, telas |
| Fundação | `scaff-fundacao` | `scaff-devops`, `scaff-banco` | decisões aceitas | projeto rodando, checagens, CI, schema inicial |
| Módulos | `scaff-modulo`, `scaff-dados` | `scaff-backend`, `scaff-frontend`, `scaff-mobile`, `scaff-desktop`, `scaff-banco` | uma fatia da spec | código e testes da fatia |
| Qualidade | `scaff-verificar` | `scaff-qa`, `scaff-revisor` | diff da fatia | testes, achados com prova |
| Segurança | `scaff-verificar` | `scaff-seguranca` | projeto, `contexto/MODELO-DE-SEGURANCA.md` | achados classificados em `.seguranca/` |
| Publicação | `scaff-publicar`, `scaff-vps` | `scaff-devops` | entrega verificada | `releases/<versão>.md` ([modelo](../modelos/RELEASE.md)), staging, plano de volta |
| Lojas | `scaff-lojas` | `scaff-mobile`, `scaff-desktop` | pacote assinado | faixa de teste, envio autorizado |
| Operação | `scaff-operar` | `scaff-devops` | sistema publicado | `contexto/OPERACAO.md` ([modelo](../modelos/OPERACAO.md)), incidentes registrados |
| Documentação | `scaff-retomar` | `scaff-documentacao` | entrega concluída | README, `contexto/HANDOFF.md` |

Pule a fase que não se aplica (sem tela, sem banco) e diga por quê no handoff.

## Passagem de contexto

O contexto passa por arquivos, não pela conversa. Ao chamar um agente, diga em poucas linhas:

1. O objetivo e o critério da spec que ele deve cumprir.
2. Os arquivos que deve ler e os que pode alterar.
3. O que já foi decidido (aponte para `contexto/DECISOES.md`) e o que não pode mudar.
4. Como provar (comando, teste ou captura).

Cada agente termina com um relatório: o que fez, arquivos, comandos e resultados, o que ficou sem prova. O orquestrador registra o essencial no handoff.

## O relatório não é prova

O orquestrador confere antes de seguir: lê o diff, roda as checagens de `quality/checks.json` e vê a evidência pedida em `playbook/revisao.md`. Relatório dizendo "testes passando" sem a saída do comando não conta.

## Regras de coordenação

- Um arquivo, um autor por vez. Dois agentes em paralelo nunca mexem nos mesmos arquivos; contrato compartilhado (API, schema) é fechado antes.
- Agentes não chamam outros agentes. No Codex isso já é o padrão (`agents.max_depth = 1`); no Claude Code, os arquivos da base bloqueiam a ferramenta `Agent` para os especialistas.
- Revisor e segurança só leem e relatam; quem corrige é o agente que escreveu, numa nova chamada.
- Três tentativas sem resolver: pare, revise a abordagem com a pessoa.

## Onde o orquestrador para

Siga sozinho entre as fases e pare para a pessoa decidir só quando a próxima ação for cara ou difícil de desfazer:

- **Stack** e banco de dados (depois de aceita, vira decisão em `contexto/DECISOES.md`).
- **Pagamento**: gateway, preços, planos.
- **Domínio** e DNS.
- **Credenciais**: criar conta, gerar chave, colocar segredo em painel. A pessoa faz; o agente nunca vê o valor.
- **Custos**: servidor, plano pago, serviço com cobrança recorrente ou por uso.
- **Publicação**: produção, loja de apps, repositório público.
- Migração ou exclusão de dados reais.

Ao parar, mostre duas ou três opções em linguagem simples, a recomendada primeiro, com custo e o que muda depois. Registre a escolha em `contexto/DECISOES.md`.

## Como chamar cada agente

- **Claude Code**: peça em linguagem natural ("use o agente scaff-revisor para revisar a fatia 1") ou mencione `@agent-scaff-revisor`. `/agents` lista os disponíveis.
- **Codex**: peça em linguagem natural ("crie um subagente scaff-revisor para revisar a fatia 1"). O Codex só cria subagentes quando pedido e só lê `.codex/agents/` em projeto marcado como confiável: na primeira vez que abrir a pasta, responda que confia nela. Sem isso as skills aparecem, mas os agentes não. `/subagents` alterna entre os subagentes da sessão.

Os arquivos de `.codex/agents/` são gerados por `python scripts/sincronizar_skills.py --gerar-codex` a partir de `.claude/agents/`; edite só a fonte em `.claude/agents/`.

## Fontes

- [Subagentes do Claude Code](https://code.claude.com/docs/en/sub-agents)
- [Subagentes do Codex](https://learn.chatgpt.com/docs/agent-configuration/subagents) e o código de `openai/codex` (`codex-rs/agent-roles`)
- Papéis e passagem de contexto por arquivos: BMAD Method (MIT). Relatório de subagente não é prova: Superpowers (MIT). Princípios reescritos, sem cópia de texto.
