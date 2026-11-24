import { Badge } from "@/components/ui/badge";

// Todo estado aparece com TEXTO (nunca so cor), como pede o DESIGN.md.

export function ClientStatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") return <Badge variant="success">Ativo</Badge>;
  if (status === "SUSPENDED") return <Badge variant="warning">Suspenso</Badge>;
  return <Badge variant="secondary">Arquivado</Badge>;
}

export function AccountBadge({ blocked }: { blocked: boolean }) {
  return blocked ? <Badge variant="destructive">Conta bloqueada</Badge> : <Badge variant="success">Conta ativa</Badge>;
}

export function InvitationBadge({ usedAt, revokedAt, expiresAt, now }: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date; now: Date }) {
  if (usedAt) return <Badge variant="secondary">Usado</Badge>;
  if (revokedAt) return <Badge variant="secondary">Revogado</Badge>;
  if (expiresAt.getTime() <= now.getTime()) return <Badge variant="warning">Expirado</Badge>;
  return <Badge variant="success">Pendente</Badge>;
}
