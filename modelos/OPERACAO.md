# Operação

Copie para `contexto/OPERACAO.md` depois da primeira publicação e mantenha atualizado. Nunca escreva valor de senha, chave ou token aqui: só onde fica guardado e quem tem acesso.

## Onde roda

| Ambiente | Endereço | Onde está hospedado | Como publicar | Como voltar |
|---|---|---|---|---|
| staging | <url> | <servidor ou plataforma> | <comando ou passo> | <comando ou passo> |
| produção | <url> | <...> | <...> | <...> |

## Quem é avisado

- Alertas chegam em: <Telegram, e-mail>
- Responsável principal: <pessoa> · Substituto: <pessoa>

## Monitoramento

- Erros da aplicação: <ferramenta e onde ver>
- Site ou API no ar: <ferramenta, intervalo>
- Logs: <onde ficam, por quanto tempo, sem dados pessoais ou segredos>
- Custos: <painéis onde conferir>

## Rotina

| Quando | O que conferir |
|---|---|
| Toda semana | Alertas e erros novos; backup rodou |
| Todo mês | `python scripts/conferir_versoes.py` e varredura de dependências (`playbook/varreduras.md`); atualizações de segurança aplicadas primeiro em staging; custos do mês |
| A cada três meses | Restauração do backup testada num ambiente de teste; acessos de quem saiu removidos; segredos antigos trocados |
| Antes de vencer | Domínio, certificados, contas de loja e planos pagos: <datas> |

## Incidente

1. Confirmar o problema e quem é afetado.
2. Avisar o responsável e, se preciso, quem usa.
3. Conter antes de investigar: voltar a versão ou desligar a funcionalidade, como no plano de volta da release.
4. Corrigir com teste que reproduz a falha, passando por staging.
5. Registrar abaixo: data, o que houve, causa, o que mudou para não repetir.

| Data | O que houve | Causa | Prevenção |
|---|---|---|---|

## Pedidos de quem usa (LGPD)

- Baixar os próprios dados: <como atender>
- Excluir a conta e os dados: <como atender, prazo>
- Contato do encarregado: <canal>

## Acessos

| Serviço | Para quê | Quem tem acesso | Onde a credencial fica guardada |
|---|---|---|---|
| <hospedagem> | <...> | <...> | <cofre de senhas, painel> |
