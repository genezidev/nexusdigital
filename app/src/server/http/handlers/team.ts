import "server-only";
import type { NextRequest } from "next/server";
import { teamInviteBody, teamMemberPatchBody } from "@/lib/schemas-team";
import { getServerEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import type { Authorized } from "@/server/http/api";
import { limitMutation, uuid } from "@/server/http/api";
import { parseBody } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { inviteCollaborator, loadTeam, revokeTeamInvitation, setCollaboratorActive, setCollaboratorApproval } from "@/server/services/team";

// Equipe do cliente (D-0026). So pela porta do portal: o cliente vem da SESSAO (portalCtx), nunca do corpo nem da URL.
// Os servicos repetem `assertCan(team:manage)` (so o dono) e o banco repete a regra nos gatilhos.

export async function getTeam(a: Authorized, requestId: string) {
  const team = await loadTeam(getDb(), a.ctx);
  return json(
    {
      members: team.members.map((m) => ({ ...m, lastLoginAt: m.lastLoginAt ? m.lastLoginAt.toISOString() : null })),
      invitations: team.invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() })),
    },
    200,
    requestId,
  );
}

/** Cria o convite e devolve o link UMA vez (sem e-mail ainda: o dono copia, como o admin ja faz). */
export async function postInvitation(a: Authorized, req: NextRequest, requestId: string) {
  await limitMutation("team", a.ctx.userId);
  const b = await parseBody(req, teamInviteBody);
  const created = await inviteCollaborator(getDb(), a.ctx, { email: b.email, approve: b.approve });
  const link = `${new URL(getServerEnv().APP_URL).origin}/invite/${created.token}`;
  return json({ invitationId: created.invitationId, link, expiresAt: created.expiresAt.toISOString(), emailSent: false }, 201, requestId);
}

export async function deleteInvitation(a: Authorized, invitationId: string, requestId: string) {
  await limitMutation("team", a.ctx.userId);
  await revokeTeamInvitation(getDb(), a.ctx, uuid(invitationId));
  return json({ ok: true }, 200, requestId);
}

export async function patchMember(a: Authorized, req: NextRequest, memberId: string, requestId: string) {
  await limitMutation("team", a.ctx.userId);
  const b = await parseBody(req, teamMemberPatchBody);
  const id = uuid(memberId);
  const result = b.approve !== undefined ? await setCollaboratorApproval(getDb(), a.ctx, id, b.approve) : await setCollaboratorActive(getDb(), a.ctx, id, b.active!);
  return json({ ok: true, ...result }, 200, requestId);
}
