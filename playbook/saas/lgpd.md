# LGPD na prática

O que um sistema precisa ter para tratar dados pessoais conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018). Este guia não substitui orientação jurídica: com dados sensíveis, dados de crianças ou grande volume, valide com um profissional.

## Antes de construir

1. **Liste os dados** que o sistema coleta, para quê e por quanto tempo. Colete só o necessário para a funcionalidade.
2. **Escolha a base legal** de cada uso (art. 7º). As mais comuns num SaaS:
   - **execução de contrato** a pedido do titular: dados para prestar o serviço contratado;
   - **obrigação legal ou regulatória**: nota fiscal, guarda de registros exigida por lei;
   - **legítimo interesse**: segurança, prevenção a fraude, melhorias, com cuidado e registro do porquê;
   - **consentimento**: marketing, cookies não essenciais, uso que a pessoa pode recusar.
3. **Dados sensíveis** (saúde, biometria, religião, origem racial, opinião política, vida sexual, entre outros) só entram nas hipóteses do art. 11, em regra com consentimento específico e destacado. Evite se não forem indispensáveis.
4. **Fornecedores** que recebem dados (hospedagem, e-mail, pagamento, monitoramento, IA) entram na política de privacidade. Fornecedor fora do Brasil é transferência internacional: confira as regras atuais da ANPD para isso.

Registre tudo isso no `contexto/MODELO-DE-SEGURANCA.md` e em `contexto/DECISOES.md`.

## No sistema

- [ ] Política de privacidade publicada: dados, finalidade, base legal, fornecedores, tempo de guarda, direitos e contato ([lancamento.md](lancamento.md#privacidade-e-lgpd))
- [ ] Consentimento separado para cada finalidade opcional, registrado com data, e tão fácil de revogar quanto de dar
- [ ] Banner de cookies opt-in quando houver cookie não essencial
- [ ] **Direitos do titular** (art. 18) atendidos pelo próprio sistema ou por um canal com prazo: confirmar que há tratamento, acessar, corrigir, levar os dados (exportar), apagar o que foi tratado com consentimento, saber com quem os dados foram compartilhados e revogar o consentimento
- [ ] Exportar os dados da conta e excluir a conta, com o que precisa ficar guardado por obrigação legal separado e explicado
- [ ] Prazo de guarda aplicado: tarefa agendada que apaga ou anonimiza o que venceu (inclusive logs e backups antigos)
- [ ] Medidas de segurança técnicas e administrativas (art. 46): os checklists de [seguranca.md](../seguranca.md) e [varreduras.md](../varreduras.md)
- [ ] Dados pessoais fora de logs, alertas do Telegram e ferramentas de erro ([monitoramento.md](monitoramento.md))

## Encarregado (DPO)

A lei manda o controlador indicar um encarregado e divulgar nome e contato de forma clara, de preferência no site (art. 41). A própria lei permite que a ANPD dispense essa indicação conforme o porte da empresa e o volume de dados (art. 41, §3º). Confira a regra atual da ANPD para agentes de pequeno porte antes de decidir; mesmo dispensado, mantenha um canal para os titulares.

## Incidente de segurança

Vazamento, acesso indevido ou perda de dados pessoais:

1. Contenha (troque credenciais, feche o acesso) e registre o que aconteceu, quando e quais dados.
2. Se o incidente puder causar **risco ou dano relevante** aos titulares, o controlador comunica a ANPD e os titulares (art. 48). Pelo regulamento da ANPD (Resolução CD/ANPD nº 15/2024), o prazo é de **3 dias úteis**, com possibilidade de complementar as informações depois.
3. A comunicação diz, no mínimo, a natureza dos dados afetados, quem foi afetado, as medidas de segurança, os riscos e o que foi feito para reduzir o dano.
4. Registre o incidente em `contexto/OPERACAO.md` mesmo quando não precisar comunicar.

As multas podem chegar a 2% do faturamento no Brasil, limitadas a R$ 50 milhões por infração (art. 52).

## Fontes

- Lei 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm (arts. 7º, 11, 18, 41, 46, 48 e 52 lidos em 2026-11-23)
- ANPD, comunicação de incidente: https://www.gov.br/anpd/pt-br/assuntos/comunicacao-de-incidentes-de-seguranca-cis
- Atos normativos da ANPD (pequeno porte, encarregado, transferência internacional): https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/atos-normativos
