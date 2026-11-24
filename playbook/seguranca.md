# Checklist de segurança antes de publicar

Resumo em português do nível 1 do OWASP ASVS 5.0.0, o mínimo para qualquer aplicação web ou API que vá para a internet. Vale também para o backend de apps mobile e desktop. Os códigos entre parênteses (V6.2.1…) apontam o requisito original para quem quiser o texto completo.

Use assim: antes do primeiro deploy em produção, o agente percorre a lista, marca cada item como **ok**, **não se aplica** ou **pendente**, e guarda o resultado no handoff com a evidência (teste, configuração ou trecho de código). Item pendente bloqueia a publicação ou vira decisão registrada em `contexto/DECISOES.md`.

## Entrada de dados e saída na tela

- [ ] Consultas ao banco usam parâmetros ou o ORM, nunca texto montado com dado do usuário (V1.2.4).
- [ ] O app não executa comando do sistema com dado do usuário; se precisar, usa lista de argumentos (V1.2.5).
- [ ] Texto do usuário aparece como texto, não como HTML. HTML vindo de editor rico passa por biblioteca de sanitização mantida (V1.3.1, V3.2.2).
- [ ] Nada de `eval` ou execução dinâmica de código com dado do usuário (V1.3.2).
- [ ] Toda validação que importa acontece no servidor; a do navegador é só conforto (V2.2.2).
- [ ] Fluxos em etapas (checkout, cadastro em passos) não deixam pular etapa chamando a API direto (V2.3.1).

## Senhas e login

- [ ] Senha com no mínimo 8 caracteres (15 recomendado), sem exigir maiúscula, número ou símbolo, e sem limite baixo de tamanho (V6.2.1, V6.2.5).
- [ ] Senha é recusada se estiver numa lista das senhas mais comuns (V6.2.4).
- [ ] Campo de senha permite colar e funciona com gerenciador de senhas (V6.2.7).
- [ ] A senha é conferida exatamente como digitada, sem cortar nem mudar maiúsculas (V6.2.8).
- [ ] Trocar a senha pede a senha atual (V6.2.3). Não existe "pergunta secreta" (V6.4.2).
- [ ] Limite de tentativas de login contra robôs, documentado na spec (V6.1.1, V6.3.1).
- [ ] Não existe conta padrão como `admin/admin` em produção (V6.3.2).
- [ ] Senhas guardadas com hash próprio para senha (Argon2id, scrypt ou bcrypt) da biblioteca de autenticação da stack.

## Sessão

- [ ] A sessão é conferida no servidor (V7.2.1) e uma sessão nova é criada a cada login (V7.2.4).
- [ ] Sair e expirar invalidam a sessão no servidor (V7.4.1). Conta desativada perde todas as sessões (V7.4.2).
- [ ] Cookie de sessão com `Secure` (V3.3.1), além de `HttpOnly` e `SameSite` (nível 2, mas baratos). Evite guardar token de login em `localStorage`, que qualquer script injetado na página consegue ler.
- [ ] Ações que mudam dados usam POST, PUT, PATCH ou DELETE, nunca GET (V3.5.3).

## Permissões

- [ ] Toda operação confere no servidor se a pessoa pode executá-la (V8.2.1, V8.3.1).
- [ ] Toda busca por ID confere se o dado pertence a quem pede, para ninguém trocar o ID na URL e ver dado alheio (V8.2.2).
- [ ] A API devolve só os campos necessários, nunca o objeto inteiro do banco (V15.3.1).

## Tokens (JWT e parecidos)

- [ ] Assinatura sempre conferida antes de usar o conteúdo, com algoritmo fixo na configuração (V9.1.1, V9.1.2).
- [ ] Validade (`exp`) conferida (V9.2.1).

## Arquivos enviados

- [ ] Limite de tamanho (V5.2.1) e conferência de extensão e conteúdo (V5.2.2).
- [ ] Nome do arquivo salvo é gerado pelo app, não o enviado pelo usuário (V5.3.2).
- [ ] Arquivo enviado nunca é executado pelo servidor (V5.3.1).

## Transporte e navegador

- [ ] HTTPS em tudo, sem cair para HTTP, com certificado público (V12.2.1, V12.2.2) e TLS 1.2 ou 1.3 (V12.1.1).
- [ ] Cabeçalho HSTS com pelo menos 1 ano (V3.4.1).
- [ ] CORS com lista fixa de origens permitidas, nunca refletindo qualquer origem (V3.4.2).
- [ ] Toda resposta com `Content-Type` correto e `charset` (V4.1.1).

## Dados sensíveis e publicação

- [ ] Senha, token ou chave nunca na URL ou na query string (V14.2.1). Exceção: webhook de gateway que só aceita segredo na URL; veja [saas/gateways/README.md](saas/gateways/README.md).
- [ ] Ao sair, o app limpa dados de login guardados no navegador (V14.3.1).
- [ ] A pasta `.git` não é publicada nem acessível pelo site (V13.4.1).
- [ ] Criptografia só com algoritmos aprovados (AES-GCM; nada de MD5 ou ECB) e da biblioteca padrão, nunca feita à mão (V11.3.1, V11.3.2, V11.4.1).

## Dependências

- [ ] Existe prazo combinado para atualizar dependência com falha conhecida (V15.1.1), e nenhuma está vencida no momento da publicação (V15.2.1). Rode a auditoria da stack (`npm audit`, `pip-audit`, `dotnet list package --vulnerable` ou equivalente) e guarde a saída.

## Varreduras (acréscimo da base, fora do ASVS)

- [ ] Histórico do Git sem segredo real (Gitleaks), dependências e configuração sem falha grave em aberto (Trivy) e código sem achado confirmado (Semgrep); app mobile analisado no MobSF. Comandos e como tratar cada achado em [varreduras.md](varreduras.md).
- [ ] Sistema com login, pagamento, dados pessoais ou várias empresas tem [../contexto/MODELO-DE-SEGURANCA.md](../contexto/MODELO-DE-SEGURANCA.md) preenchido e revisado.

## Nível 2: pagamento, dados pessoais e várias empresas

Sistemas com pagamento, dados pessoais em volume (LGPD), saúde ou várias empresas no mesmo banco seguem também estes itens do nível 2, escolhidos entre os 183 do ASVS 5.0.0 por serem os que mais pesam nesses casos. Para auditoria formal, use a lista completa.

**Regras de negócio e abuso**
- [ ] Limites de negócio documentados e aplicados por usuário e no sistema todo (valor máximo, quantidade por dia) (V2.1.3, V2.3.2).
- [ ] Operação de negócio com várias escritas é transação: ou tudo acontece, ou nada (V2.3.3).
- [ ] Recurso limitado (vaga, estoque, crédito) é reservado com trava, sem venda dupla (V2.3.4).
- [ ] Limite de uso contra automação nas funções caras ou que vazam dados em massa: exportação, busca, IA, envio de e-mail (V2.4.1, V15.2.2).

**Login e sessão**
- [ ] Senhas de até 64 caracteres ou mais são aceitas, nunca expiram por tempo e são conferidas contra senhas vazadas no cadastro e na troca (V6.2.9, V6.2.10, V6.2.12).
- [ ] Segundo fator disponível, e obrigatório para admin e para quem mexe em pagamento (V6.3.3).
- [ ] Recuperar a senha não pula o segundo fator (V6.4.3). Códigos de uso único valem uma vez só, com validade curta e limite de tentativas (V6.5.1, V6.5.5, V6.6.3).
- [ ] Tempo de inatividade e duração máxima da sessão definidos e aplicados (V7.1.1, V7.3.1, V7.3.2).
- [ ] Trocar e-mail, telefone ou segundo fator pede a senha de novo (V7.5.1). Depois de trocar a senha ou o fator, a pessoa pode encerrar as outras sessões; ela vê e encerra as sessões ativas, e o admin encerra as de um usuário (V7.4.3, V7.5.2, V7.4.5).

**Permissões e empresas**
- [ ] Sistema com várias empresas impede que uma operação alcance outra empresa (V8.4.1). Ver [saas/multiempresa.md](saas/multiempresa.md).
- [ ] Permissão por campo quando necessário: quem pode ler ou alterar cada campo sensível (preço, papel, status de pagamento) (V8.1.2, V8.2.3).
- [ ] O servidor aceita só os campos previstos em cada operação, nunca o objeto inteiro vindo da tela (V15.3.3).

**Dados sensíveis**
- [ ] Dados sensíveis identificados e classificados, com regras de guarda, log e acesso para cada nível (V14.1.1, V14.1.2, V14.2.4).
- [ ] Dado sensível não vai para rastreadores e ferramentas de terceiros sem necessidade (V14.2.3), não fica em cache de servidor ou do navegador (`Cache-Control: no-store`) (V14.2.2, V14.3.2) e não fica no `localStorage` (V14.3.3).

**Segredos, criptografia e configuração**
- [ ] Segredos do servidor num cofre ou no gerenciador de segredos da plataforma, com acesso mínimo (V13.3.1, V13.3.2). Ver "Segredos no servidor" em [vps.md](vps.md).
- [ ] Conexões entre serviços (app, banco, fila) com contas próprias de privilégio mínimo, nunca senha padrão (V13.2.1 a V13.2.3).
- [ ] Criptografia só com bibliotecas reconhecidas e cifra autenticada (por exemplo AES-256-GCM); valores aleatórios que não podem ser adivinhados com 128 bits ou mais (V11.2.1, V11.3.3, V11.5.1).
- [ ] Produção sem modo de depuração, listagem de pastas, documentação interna ou painéis de monitoramento expostos sem intenção (V13.4.2, V13.4.3, V13.4.5, V15.2.3).
- [ ] O IP real do cliente vem de cabeçalho que só o proxy define; o cliente não consegue forjá-lo (V4.1.3, V15.3.4).

**Arquivos**
- [ ] Tipos, extensões e tamanho máximo documentados por funcionalidade de upload; compactados checados antes de abrir (V5.1.1, V5.2.3).
- [ ] Nome de arquivo do usuário ignorado ou validado, e nome seguro no download (V5.4.1, V5.4.2).

**Logs e falhas**
- [ ] Inventário dos logs: o que é registrado, onde fica, quem acessa e por quanto tempo (V16.1.1).
- [ ] Logins com sucesso e falha, permissões negadas e tentativas de burlar controles ficam registrados, com quando, onde, quem e o quê, em horário UTC (V16.2.1, V16.2.2, V16.3.1 a V16.3.3).
- [ ] Senha, dados de pagamento e tokens nunca no log; dados sensíveis mascarados (V16.2.5).
- [ ] Logs protegidos contra alteração e enviados para um sistema separado (V16.4.2, V16.4.3).
- [ ] Erro inesperado mostra mensagem genérica, e falha de validação nunca deixa a transação seguir (V16.5.1, V16.5.3).

**Dependências**
- [ ] Inventário das bibliotecas (SBOM) gerado e atualizado (V15.1.2). O Trivy gera, como em [varreduras.md](varreduras.md).

## Além do nível 2

Leia o ASVS completo em https://github.com/OWASP/ASVS (versão estável 5.0.0, maio de 2025, tag `v5.0.0_release`). Login social e OAuth: confira o capítulo V10. App mobile: o padrão equivalente é o OWASP MASVS.

---

Este guia é uma adaptação resumida do [OWASP Application Security Verification Standard 5.0.0](https://github.com/OWASP/ASVS), da OWASP Foundation, e por isso é distribuído sob a licença [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Mudanças: seleção dos requisitos de nível 1 e de parte do nível 2, tradução livre, agrupamento por tema e a seção "Varreduras", que é da base e não vem do ASVS.
