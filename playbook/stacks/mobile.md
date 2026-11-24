# Perfil mobile (Android e iOS)

Para apps que precisam estar na loja ou usar o que só o celular faz bem: câmera, notificação, localização, uso sem internet. Se a ideia funciona num site, comece pelo [perfil web](web.md) e deixe o app para depois.

## Stack recomendada

| Peça | Escolha | Versão conferida em 2026-11-22 | Por quê |
|---|---|---|---|
| Framework | Expo (React Native) + TypeScript | SDK 58 (`expo` 58.0.26, React Native 0.88) | Mesma linguagem do web, teste no celular pelo Expo Go, build iOS na nuvem sem Mac |
| Navegação | Expo Router (vem no modelo padrão) | junto do SDK | Telas como arquivos, parecido com o Next.js |
| Dados no aparelho | SQLite do Expo para uso offline; armazenamento seguro do Expo para token | junto do SDK | Token nunca em armazenamento comum |
| API e banco | A do [perfil web](web.md) ou do [perfil Python](python.md) | | Uma API para app e painel |
| Build e envio | EAS Build e EAS Submit | conferir preço | Gera Android e iOS na nuvem |

Alternativas: **Flutter** (3.50.1, Dart 3.14) quando a interface precisa ser idêntica em tudo e a equipe aceita aprender Dart; **Kotlin com Jetpack Compose** e **Swift com SwiftUI** quando o app depende de recurso nativo profundo (Bluetooth intenso, widgets, integração com o sistema), com dois códigos para manter.

## Criar o projeto

```powershell
npm view expo dist-tags
npx create-expo-app@5.0.0 app
```

Pelo `npm view`, confira que `latest` é estável e qual SDK ele traz; fixe as versões que o gerador instalou. Rode `npx expo start` e abra no celular com o Expo Go. Quando usar biblioteca nativa que o Expo Go não tem, gere um build de desenvolvimento (EAS).

## Estrutura e cuidados

- Telas em `app/` (Expo Router), regras e chamadas à API em módulos testáveis fora das telas.
- Peça cada permissão só quando a pessoa for usar o recurso, com texto que explica o porquê.
- Pense no offline: o que acontece sem rede, como sincroniza depois, o que fazer com conflito.
- Testes: Jest para regras; jornada principal testada em emulador Android e em aparelho real. Maestro ou Detox para jornadas automatizadas quando o app crescer.

## Publicar

Siga `scaff-lojas` e `scaff-publicar`. Contas de desenvolvedor (Google Play e Apple) são pagas e criadas pela própria pessoa; requisitos, prazos e o teste de 14 dias da Google Play em [publicacao/lojas.md](../publicacao/lojas.md). Antes do envio, analise o pacote como em [varreduras.md](../varreduras.md).

## Armadilhas

- Atualizar o SDK do Expo de uma vez pulando várias versões: suba uma versão principal por vez, seguindo o guia de atualização.
- Segredo dentro do app: tudo que vai no pacote pode ser extraído. Chaves ficam na API.
- Build iOS local exige Mac com Xcode; sem Mac, use o EAS.
- Tags do GitHub do Expo são de pacotes internos: confira a versão no npm.

## Fontes

- Expo: https://docs.expo.dev · versões do SDK: https://docs.expo.dev/versions/latest/
- Flutter: https://docs.flutter.dev/release/archive
- React Native: https://reactnative.dev/docs/getting-started
