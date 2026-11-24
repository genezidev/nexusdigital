---
name: scaff-fundacao
description: "Cria o esqueleto do projeto na stack aceita: gerador oficial com versão fixa, checagens, CI e uma fatia mínima funcionando. Use depois de aceitar a arquitetura e antes do primeiro módulo."
---

Confira em contexto/DECISOES.md que stack e banco estão aceitos; sem isso, pare e volte para scaff-arquitetura. Rode python scripts/conferir_versoes.py para as ferramentas do catálogo e use o gerador oficial da stack com versão fixa; leia o que ele criou antes de mudar. Preserve os arquivos da base (AGENTS.md, contexto, specs, playbook, modelos) e nunca sobrescreva arquivo existente sem conferir a diferença. Crie .env.example só com nomes de variáveis, confira o .gitignore e nunca grave segredo. Configure em quality/checks.json os comandos reais de lint, testes e build e prove com python scripts/verificar.py --executar. Entregue uma fatia mínima de ponta a ponta (uma tela ou comando que grava e lê um dado de teste) com um teste automatizado. Acrescente o job da stack no CI com permissões mínimas e ações fixadas por SHA (playbook/fluxo.md). Escreva no README como instalar, rodar e testar e registre no handoff versões, comandos e resultados.
