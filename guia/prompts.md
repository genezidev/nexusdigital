# Kit de prompts

Pedidos prontos para copiar, colar no agente e completar. Troque tudo que está entre colchetes `[ ]`. Um pedido por mensagem; espere a resposta antes do próximo. Funciona no Claude Code e no Codex (no Codex, chame a skill com `$`, por exemplo `$scaff-iniciar`).

Regras que valem para todos:

- Diga o resultado que você quer ver, não a tecnologia. O agente propõe a técnica.
- Se não souber responder uma pergunta do agente, diga "não sei, use a recomendação padrão e anote como suposição".
- Nunca cole senha, chave de API ou token no chat. Diga onde está ("a chave está no painel do Asaas") e configure você mesmo.
- Antes de qualquer custo, publicação ou exclusão de dados, o agente deve parar e pedir sua autorização. Se ele não pedir, pergunte.

## Começar

**Tenho só uma ideia**
> Use scaff-iniciar e leia contexto/PROJETO.md. Quero criar [o que é, em uma frase] para [quem vai usar]. O problema que resolve: [problema]. Me entreviste uma pergunta por vez, explicando por que cada uma importa, e depois proponha a primeira entrega que eu consiga testar.

**Tenho um PDF ou briefing**
> Use scaff-iniciar e leia contexto/PROJETO.md e o arquivo anexado [nome do arquivo]. Pergunte só o que mudar o escopo, até 5 perguntas, e proponha a spec da primeira entrega com critérios de aceite.

**Quero que a equipe de agentes conduza tudo**
> Use scaff-orquestrar. Siga as fases a partir de onde o projeto está, delegue aos agentes especialistas e pare só nas decisões caras: stack, pagamento, domínio, credenciais, custos e publicação.

**Não sei qual tecnologia usar**
> Use scaff-arquitetura. Pela spec, compare 2 opções de stack em linguagem simples: custo por mês, dificuldade para mim, onde publicar e o que fica difícil mudar depois. Recomende uma.

## Construir

**Nova funcionalidade**
> Use scaff-modulo. Quero que [tipo de usuário] consiga [ação] para [resultado]. Está pronto quando [como eu vou testar]. Atualize a spec antes de programar e me mostre como testar no final.

**Mudar o visual de uma tela**
> Use scaff-design. Na tela [nome ou endereço], quero [o que mudar]. Siga design/DESIGN.md, confira no celular e no computador e me mostre antes e depois.

**Cobrar dos clientes**
> Leia playbook/saas/pagamentos.md e playbook/saas/gateways/. Quero cobrar [valor e frequência: mensal, avulso] por [o que o cliente recebe] usando [gateway ou "me recomende"]. Monte primeiro no sandbox e me diga o que eu preciso configurar no painel do gateway.

**Várias empresas no mesmo sistema**
> Leia playbook/saas/multiempresa.md. Cada [empresa, clínica, loja] deve ver só os próprios dados. Proponha como separar e prove com um teste usando duas empresas.

## Quando algo dá errado

**Apareceu um erro**
> Apareceu este erro quando eu [o que estava fazendo]:
> ```
> [cole a mensagem de erro inteira]
> ```
> Encontre a causa antes de mudar qualquer coisa, explique em linguagem simples, corrija com um teste que reproduz o problema e me diga como conferir.

**Funcionava e parou**
> [Funcionalidade] funcionava e parou depois de [última mudança, se souber]. Compare com a última versão que funcionava, ache a causa e corrija. Não desfaça outras mudanças sem me perguntar.

**O agente disse que terminou, mas não funciona**
> Você disse que [tarefa] estava pronta, mas quando eu [o que fiz] acontece [o que acontece]. Mostre a evidência de que funciona, seguindo playbook/revisao.md, ou corrija.

## Continuar e entender

**Abrir uma conversa nova**
> Use scaff-retomar. Leia o handoff, confira os arquivos modificados e me diga em 5 linhas onde paramos e qual é o próximo passo.

**Não entendi o que foi feito**
> Explique o que você mudou nesta conversa como se eu nunca tivesse programado: o que o usuário vai notar, o que mudou nos dados e o que eu preciso fazer, se algo.

**Antes de encerrar o dia**
> Atualize contexto/HANDOFF.md com o que foi feito, como foi conferido, o que ficou pendente e o próximo passo. Faça um commit com uma mensagem clara.

## Publicar

**Revisar antes de publicar**
> Use scaff-verificar. Confira os critérios da spec, rode as checagens e as varreduras de playbook/varreduras.md e peça uma revisão independente ao scaff-revisor e ao scaff-seguranca. Liste o que falta, em ordem de gravidade.

**Escolher onde publicar**
> Leia playbook/publicacao/README.md. Meu sistema é [tipo], espero [quantos] usuários no começo e posso gastar até [valor] por mês. Recomende o destino, com custos e o que eu preciso contratar.

**Publicar uma versão**
> Use scaff-publicar. Prepare a versão [número] em staging, me mostre o checklist de release preenchido com as evidências e o plano de volta. Só publique em produção depois que eu autorizar.

**Colocar o app na loja**
> Use scaff-lojas e leia playbook/publicacao/lojas.md. Quero publicar na [Google Play, App Store, Microsoft Store]. Me diga o que eu preciso criar e pagar, em ordem, e prepare tudo que for do projeto.

**O sistema caiu ou está estranho**
> Use scaff-operar. Os usuários dizem que [sintoma] desde [quando]. Confirme o problema, me diga o impacto, contenha (voltar a versão ou desligar a funcionalidade) e só depois investigue. Não mexa em dados de produção sem minha autorização.

## Gastar menos

**Conversa ficou longa**
> Resuma em 10 linhas o que está decidido e o próximo passo, atualize o handoff e eu abro uma conversa nova.

No Claude Code, `/context` mostra o que está ocupando a conversa, `/usage` mostra o consumo do plano, `/clear` começa do zero e `/compact` resume. Abra uma conversa nova a cada tarefa diferente.
