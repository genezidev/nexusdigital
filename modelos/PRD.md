# PRD: <nome do produto>

Documento de produto para quando mais de uma pessoa precisa aprovar o que será construído (sócio, cliente, investidor). Para um projeto de uma pessoa só, a spec basta. Copie para `contexto/PRD.md` e preencha em linguagem simples. Onde faltar informação, escreva `[PRECISA ESCLARECER: pergunta]`.

- Versão do documento: 1 · Data: AAAA-MM-DD · Estado: rascunho | em aprovação | aprovado
- Responsável: <pessoa>

## Visão

Uma ou duas frases: o que o produto é e para quem.

## Problema

Qual dor existe hoje, como as pessoas resolvem sem o produto e o que isso custa a elas.

## Público

| Quem | O que precisa | O que pode fazer no sistema |
|---|---|---|
| <papel> | <necessidade> | <permissões em linguagem simples> |

## Objetivos e como medir

- <objetivo>: <número que mostra que deu certo, com prazo> (ex.: "50 clientes pagantes em 3 meses").

## Escopo da primeira versão

Em ordem de prioridade. Cada item vira uma ou mais histórias na spec.

1. P1: <capacidade principal>
2. P2: <...>

## Fora do escopo

O que não entra agora, para ninguém esperar.

## Requisitos gerais

- Onde funciona: <navegador, celular (Android/iOS), computador (Windows/Mac)>
- Dados pessoais e LGPD: <quais dados, por quê, por quanto tempo>
- Disponibilidade e desempenho: <ex.: "fora do ar no máximo X horas por mês", "tela principal abre em até 2 segundos">
- Acessibilidade e idioma: <...>
- Integrações: <...>

## Modelo de negócio

Como o produto ganha dinheiro (ou por que não precisa), preços previstos e custos mensais estimados, com data.

## Riscos e premissas

- Risco: <o que pode dar errado> · Como reduzir: <...>
- Premissa: <o que estamos assumindo como verdade> · Como confirmar: <...>

## Marcos

| Marco | O que estará pronto | Data prevista |
|---|---|---|
| Primeira entrega | P1 funcionando em staging | AAAA-MM-DD |

## Aprovação

| Pessoa | Papel | Decisão | Data |
|---|---|---|---|
| <nome> | <papel> | aprovado / pediu mudanças | AAAA-MM-DD |

Mudança de escopo depois de aprovado: nova versão do documento, com o que mudou e quem aprovou.
