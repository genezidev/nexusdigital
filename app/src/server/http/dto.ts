import type { loadClientDetail } from "@/server/services/clients";

type Detail = Awaited<ReturnType<typeof loadClientDetail>>;

// Formato JSON publico do detalhe do cliente. Lista explicita de campos: nunca token, hash, senha nem
// dado de outra empresa (o detalhe ja vem filtrado pelo cliente da sessao).
export function toClientDetailDto(d: Detail) {
  return {
    client: {
      id: d.client.id,
      name: d.client.name,
      slug: d.client.slug,
      contactName: d.client.contactName,
      contactEmail: d.client.contactEmail,
      timezone: d.client.timezone,
      status: d.client.status,
      createdAt: d.client.createdAt.toISOString(),
    },
    members: d.members.map((m) => ({
      id: m.id,
      role: m.role,
      status: m.status,
      name: m.user.name,
      email: m.user.email,
      blocked: m.user.banned,
      lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
    })),
    invitations: d.invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt.toISOString(),
      usedAt: i.usedAt?.toISOString() ?? null,
      revokedAt: i.revokedAt?.toISOString() ?? null,
    })),
    permissions: d.permissions,
  };
}
