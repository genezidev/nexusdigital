import type { Prisma } from "@/generated/prisma/client";
import { assertCan } from "@/server/authorization/permissions";
import type { Scoped, SystemScoped } from "@/server/db/scope";
import { ForbiddenError } from "@/server/errors";

const SENSITIVE_KEY = /pass(word)?|token|hash|secret|authorization|cookie/i;

/** Remove chaves sensiveis (recursivamente) antes de gravar o diff na auditoria (R-4). */
export function sanitizeDiff(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map((v) => sanitizeDiff(v) ?? null) as Prisma.InputJsonValue;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) continue;
      out[k] = sanitizeDiff(v) ?? null;
    }
    return out;
  }
  return value as Prisma.InputJsonValue;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  requestId?: string;
  diff?: unknown;
}

// Append-only: so existe INSERT e SELECT (o papel do app nao tem UPDATE nem DELETE).
export async function recordAudit(s: Scoped, entry: AuditEntry) {
  await s.tx.auditLog.create({
    data: {
      clientId: s.ctx.clientId,
      actorId: s.ctx.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      requestId: entry.requestId,
      diff: sanitizeDiff(entry.diff),
    },
  });
}

export async function listAudit(s: Scoped, limit = 50) {
  assertCan(s.ctx, "audit:read");
  return s.tx.auditLog.findMany({
    where: { clientId: s.ctx.clientId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
}

/** Auditoria entre clientes: so ADMIN (escopo criado por systemContextForAdmin). Nunca devolve o diff. */
export async function listAuditPage(s: SystemScoped, query: { page: number; pageSize: number }) {
  if (s.sys.reason !== "admin") throw new ForbiddenError();
  const pageSize = Math.min(Math.max(Math.trunc(query.pageSize) || 25, 1), 100);
  const page = Math.max(Math.trunc(query.page) || 1, 1);
  const [items, total] = await Promise.all([
    s.tx.auditLog.findMany({
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    s.tx.auditLog.count(),
  ]);
  return { items, total, page, pageSize };
}
