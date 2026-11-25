// Rotulos em portugues para as acoes registradas na auditoria. Acao desconhecida mostra o codigo (nunca esconde).
const LABELS: Record<string, string> = {
  "client.created": "Cliente criado",
  "invitation.created": "Convite criado",
  "invitation.accepted": "Convite aceito",
  "invitation.revoked": "Convite revogado",
  "member.blocked": "Conta bloqueada",
  "member.unblocked": "Conta desbloqueada",
  "member.sessions_revoked": "Sessões encerradas",
  "media_link.created": "Link de mídia adicionado",
  "media_link.removed": "Link de mídia removido",
  "team.invited": "Colaborador convidado pelo dono do cliente",
  "team.invitation_revoked": "Convite de colaborador revogado pelo dono",
  "team.permissions_changed": "Permissões de colaborador alteradas pelo dono",
  "team.member_deactivated": "Colaborador desativado pelo dono",
  "team.member_reactivated": "Colaborador reativado pelo dono",
};

export const auditLabel = (action: string): string => LABELS[action] ?? action;
