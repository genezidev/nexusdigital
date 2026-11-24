/**
 * Navegacao com recarga completa. Usada depois de entrar e de sair: descarta todo estado em memoria
 * e o cache de rotas do navegador, para que nada de uma sessao sobreviva na outra. O destino e sempre
 * um caminho interno decidido pelo servidor (safeNext) ou fixo no codigo.
 */
export function hardNavigate(path: string): void {
  window.location.assign(path);
}
