# Release <versão>

Copie para `releases/<versão>.md` a cada publicação. Marque cada item só com a evidência ao lado (comando e resultado, link, captura). Item que não se aplica: escreva "não se aplica" e o motivo.

- Data: AAAA-MM-DD · Destino: staging | produção | loja (qual)
- Revisão (commit) publicada: <hash>
- Quem autorizou a produção: <pessoa, data e onde foi dito>

## O que muda

- <mudança em linguagem simples, ligada à spec ou história>

## Antes

- [ ] Critérios da spec conferidos item por item (`playbook/revisao.md`)
- [ ] Checagens de `quality/checks.json` passando agora: `python scripts/verificar.py --executar`
- [ ] Revisão independente feita, achados resolvidos ou aceitos com motivo
- [ ] Varreduras de segredos, dependências e código (`playbook/varreduras.md`) sem achado confirmado aberto
- [ ] Primeira publicação em produção: checklist de `playbook/seguranca.md` percorrido
- [ ] Migrations aplicadas e testadas em staging, com volta planejada
- [ ] Backup recente e restauração testada num ambiente de teste
- [ ] Variáveis e segredos configurados no painel ou no servidor (nunca no repositório)
- [ ] Plano de volta escrito abaixo e testado em staging quando possível
- [ ] Notas da versão para quem usa

## Staging

- [ ] Mesmo artefato (build, imagem ou pacote) que irá para produção
- [ ] Jornada principal testada com dados de teste
- [ ] Erros e logs conferidos depois do teste

## Produção ou loja

- [ ] Autorização explícita da pessoa registrada acima
- [ ] Publicado no horário combinado, com alguém acompanhando
- [ ] Jornada principal conferida em produção logo depois
- [ ] Erros e alertas acompanhados nas primeiras horas
- [ ] Handoff atualizado com versão, comandos e resultados

## Extra para mobile e desktop

- [ ] Versão e número de build maiores que os da última publicação
- [ ] Pacote assinado com a chave guardada fora do repositório
- [ ] Pacote final analisado (`playbook/varreduras.md`)
- [ ] Ficha da loja, capturas, política de privacidade e formulário de dados coerentes com o que o app coleta
- [ ] Testado na faixa de teste da loja em aparelho real antes de enviar para revisão

## Plano de volta

- Sinal para voltar: <ex.: erro na jornada principal, taxa de erros acima de X>
- Passos: <voltar para a versão anterior, desligar a funcionalidade, restaurar backup, em que ordem>
- Dados: <o que acontece com dados gravados pela versão nova>
