// Envio de e-mail (SMTP) ainda NAO esta implementado nesta fase. A interface fica aqui, num so lugar:
// enquanto devolver false, recuperacao de senha e envio de convite por e-mail aparecem como
// "indisponiveis" na interface e o servidor recusa o fluxo (nunca sucesso falso, nunca vazar se o e-mail existe).
export function isEmailDeliveryAvailable(): boolean {
  return false;
}
