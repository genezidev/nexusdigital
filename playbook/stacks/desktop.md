# Perfil desktop (Windows e Mac)

Para programas instalados no computador: trabalham com arquivos locais, funcionam sem internet, conversam com impressora ou outro equipamento, ou precisam ficar abertos o dia todo.

## Stack recomendada

| Peça | Escolha | Versão conferida em 2026-11-22 | Por quê |
|---|---|---|---|
| Framework | Electron + TypeScript | 45.4.1 | Windows, Mac e Linux com o mesmo código web; só precisa de Node.js para começar |
| Criação, pacote e instalador | Electron Forge, modelo `vite` (já em TypeScript) | 8.0.1 | Cria, empacota, assina e publica |
| Interface | React ou HTML com os componentes do [perfil web](web.md) | | Reaproveita o que a pessoa aprendeu no web |
| Dados locais | SQLite na pasta de dados do usuário | | Arquivo único, sem servidor |
| Segredos | Cofre do sistema (`safeStorage` do Electron) | | Nunca em arquivo de configuração |

Alternativas:

- **Tauri** (2.12): instalador bem menor e menos memória, permissões negadas por padrão. Exige Rust e, no Windows, as ferramentas de build do Visual Studio. Bom quando tamanho importa ou o app fica aberto o tempo todo.
- **.NET** (10, LTS até 2028-11-14) com **WPF** ou **WinUI 3**: só Windows, aparência e integração nativas. Use quando o app é só para Windows e conversa muito com o sistema.
- **SwiftUI**: só Mac, exige Mac com Xcode.
- **PySide**: quando o motor do programa já é Python.

## Criar o projeto

```powershell
npm view @electron-forge/cli dist-tags
npx create-electron-app@8.0.1 app --template=vite
```

Fixe a versão do Electron instalada (`--save-exact`). Rode `npm start` dentro da pasta.

## Segurança obrigatória

- Mantenha os padrões seguros: `contextIsolation` ligado, `nodeIntegration` desligado, `sandbox` ligado.
- A janela fala com o resto do programa só por funções pequenas expostas no `preload`, com entrada validada.
- Nunca carregue site remoto dentro do app; links externos abrem no navegador.
- Aplique a lista de segurança da documentação do Electron antes de publicar.

## Publicar

Siga `scaff-publicar` e, para Microsoft Store ou Mac App Store, `scaff-lojas`. Sem assinatura de código, o Windows e o Mac avisam que o programa é de origem desconhecida: certificado (Windows) e conta Apple Developer com notarização (Mac) são custos e decisões da pessoa. Gerar e assinar para Mac exige um Mac ou CI com macOS. Detalhes de cada loja e da notarização em [publicacao/lojas.md](../publicacao/lojas.md).

Teste instalar, abrir, atualizar e desinstalar em máquina limpa, e confira onde ficam os dados.

## Armadilhas

- Cada versão principal do Electron tem suporte curto: planeje atualizar algumas vezes por ano.
- Atualização automática exige servidor ou serviço de releases e app assinado.
- Antivírus pode bloquear executável sem assinatura.

## Fontes

- Electron: https://www.electronjs.org/docs/latest · segurança: https://www.electronjs.org/docs/latest/tutorial/security
- Electron Forge: https://www.electronforge.io
- Tauri: https://v2.tauri.app · .NET: https://dotnet.microsoft.com/platform/support/policy
