# Lojas de aplicativos

Conferido nas páginas oficiais em 2026-11-23. Regras, taxas e prazos mudam com frequência: confira de novo antes de cada primeiro envio e anote a data no handoff. Criar contas, pagar taxas, aceitar contratos e enviar para revisão são decisões da pessoa (skill `scaff-lojas`).

## O que vale para todas

- Política de privacidade publicada e coerente com o que o app coleta, inclusive por bibliotecas de terceiros ([saas/lgpd.md](../saas/lgpd.md)).
- App que cria conta precisa permitir **excluir a conta dentro do app** (Google também pede um link na web). Desativar não basta.
- Venda de conteúdo ou recurso digital dentro do app passa pela cobrança da loja, salvo as exceções de cada uma. Produto físico e serviço presencial usam o gateway normal ([saas/pagamentos.md](../saas/pagamentos.md)).
- Conta de teste com dados de exemplo para o revisor e backend ligado durante a revisão.
- Versão e número de build sobem a cada envio; chave de assinatura fora do repositório, com cópia ([modelos/RELEASE.md](../../modelos/RELEASE.md)).

## Google Play

- Conta: **US$ 25, pagamento único**, com documento e cartão no nome legal; pessoal ou de organização.
- **Conta pessoal nova** (criada depois de 13/11/2023): antes de publicar, teste fechado com **pelo menos 12 testadores inscritos por 14 dias seguidos**; o pedido de produção leva até 7 dias para ser analisado. Comece o teste cedo.
- **Nível de API**: desde 31/08/2026, apps novos e atualizações precisam mirar o Android 16 (API 36).
- Envio em **App Bundle (.aab)** com Play App Signing: você guarda a chave de upload (o Google consegue trocá-la se perder), e o Google guarda a chave que assina o app entregue.
- Formulário **Segurança dos dados** obrigatório para quem publica, mesmo em teste fechado ou aberto, incluindo o que os SDKs coletam.
- Cobrança: itens digitais usam o Google Play Billing. No Brasil, apps que não são jogos podem oferecer também uma cobrança alternativa (escolha do usuário), com taxa 4 pontos menor nessas compras.
- **Verificação de desenvolvedor**: o Brasil está entre os primeiros países, desde 30/09/2026, em que o Android confere a identidade de quem desenvolveu os apps instalados em aparelhos certificados. Quem distribui o APK fora da Play tem um registro próprio no Android Developer Console. Confira a página oficial antes de distribuir por fora.

## Apple App Store (iPhone e iPad)

- **Apple Developer Program: US$ 99 por ano.** Pessoa física aparece com o nome legal como vendedora; empresa precisa de **número D-U-N-S** (grátis), site e poder legal para assinar.
- Gerar e enviar o app: Xcode 26 ou mais novo (exigido desde 28/04/2026) e alvo mínimo iOS 13. Sem Mac, o build na nuvem (EAS da Expo, CI com macOS) resolve; a conta continua necessária.
- **TestFlight**: até 100 testadores internos da equipe e até 10 mil externos; o primeiro build para externos passa por revisão.
- Revisão: metade dos envios em menos de 24 horas e 90% em menos de 48 horas, segundo a Apple.
- Motivos comuns de recusa: app incompleto ou sem conta de teste; site empacotado sem recursos próprios (diretriz 4.2); login social sem outra opção equivalente que colete só nome e e-mail (4.8); sem exclusão de conta (5.1.1(v)); conteúdo digital vendido fora da compra no app (3.1.1).
- Rótulos de privacidade obrigatórios em todo envio; política de privacidade obrigatória.
- **Brasil** (acordo com o CADE, iOS 26.5 em diante): é possível oferecer pagamento alternativo dentro do app junto com a compra da Apple, ou link para comprar no site, e distribuir em lojas alternativas, cada um com comissão própria definida pela Apple. O caminho padrão com a compra no app continua igual. Antes de escolher outro, leia a página da Apple para o Brasil e registre a decisão.

## Microsoft Store (Windows)

- Conta de desenvolvedor **gratuita**, pessoal ou empresa, com verificação por documento e selfie (empresa: D-U-N-S ou documentos, análise manual de 2 a 5 dias úteis). Não dá para trocar de pessoal para empresa depois.
- **MSIX**: a loja assina e hospeda o pacote de graça. Caminho mais simples.
- **EXE ou MSI**: precisa de assinatura com certificado de autoridade reconhecida pela Microsoft, instalação silenciosa (sem telas, só o aviso do Windows) e link de download com versão que não muda depois do envio. Não aceita instalador que baixa o programa.
- Política de privacidade obrigatória quando o app trata dados pessoais; classificação etária no envio.

## Mac

- **Fora da loja** (download do site): certificado Developer ID (exige ser titular da conta Apple Developer, US$ 99 por ano) e **notarização** pela Apple (`xcrun notarytool` para enviar, `xcrun stapler` para anexar o resultado). Sem isso, o Mac bloqueia ou alerta na instalação.
- **Mac App Store**: mesma conta, revisão como no iPhone e o app precisa rodar em sandbox (acesso restrito a arquivos e recursos declarados). Confira a documentação de App Sandbox antes de escolher esse caminho, porque recursos de sistema podem ficar indisponíveis.

## Fontes

- Google Play: conta https://support.google.com/googleplay/android-developer/answer/6112435 · teste para contas pessoais https://support.google.com/googleplay/android-developer/answer/14151465 · nível de API https://developer.android.com/google/play/requirements/target-sdk · verificação de desenvolvedor https://developer.android.com/developer-verification · segurança dos dados https://support.google.com/googleplay/android-developer/answer/10787469 · assinatura https://support.google.com/googleplay/android-developer/answer/9842756 · exclusão de conta https://support.google.com/googleplay/android-developer/answer/13327111 · pagamentos https://support.google.com/googleplay/android-developer/answer/10281818 · cobrança alternativa https://support.google.com/googleplay/android-developer/answer/13821247
- Apple: programa https://developer.apple.com/support/enrollment/ · requisitos de envio https://developer.apple.com/news/upcoming-requirements/ · diretrizes https://developer.apple.com/app-store/review/guidelines/ · exclusão de conta https://developer.apple.com/support/offering-account-deletion-in-your-app/ · privacidade https://developer.apple.com/app-store/app-privacy-details/ · TestFlight https://developer.apple.com/testflight/ · revisão https://developer.apple.com/distribute/app-review/ · Brasil https://developer.apple.com/support/app-distribution-in-brazil/ · Developer ID https://developer.apple.com/developer-id/ · App Sandbox https://developer.apple.com/documentation/security/app-sandbox
- Microsoft: conta https://learn.microsoft.com/windows/apps/publish/partner-center/open-a-developer-account · EXE/MSI https://learn.microsoft.com/windows/apps/publish/publish-your-app/msi/app-package-requirements · políticas https://learn.microsoft.com/windows/apps/publish/store-policies
