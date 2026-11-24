// Rotulos em portugues para as acoes registradas na auditoria. Acao desconhecida mostra o codigo (nunca esconde).
const LABELS: Record<string, string> = {
  "client.created": "Cliente criado",
  "invitation.created": "Convite criado",
  "invitation.accepted": "Convite aceito",
  "invitation.revoked": "Convite revogado",
  "member.blocked": "Conta bloqueada",
  "member.unblocked": "Conta desbloqueada",
  "member.sessions_revoked": "Sessões encerradas",
};

export const auditLabel = (action: string): string => LABELS[action] ?? action;
