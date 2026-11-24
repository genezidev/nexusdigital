"use client";

import { Ban, LogOut, MoreHorizontal, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api/client";

type Pending = "block" | "unblock" | "sessions" | null;

export function MemberActions({ clientId, memberId, name, blocked }: { clientId: string; memberId: string; name: string; blocked: boolean }) {
  const [pending, setPending] = useState<Pending>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Ações para ${name}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {blocked ? (
            <DropdownMenuItem onSelect={() => setPending("unblock")}>
              <ShieldCheck aria-hidden="true" /> Desbloquear conta
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onSelect={() => setPending("block")}>
              <Ban aria-hidden="true" /> Bloquear conta
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onSelect={() => setPending("sessions")}>
            <LogOut aria-hidden="true" /> Encerrar sessões
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmAction
        open={pending === "block"}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Bloquear a conta de ${name}?`}
        description="A pessoa perde o acesso a todos os clientes e as sessões abertas são encerradas na hora. Você pode desbloquear depois."
        confirmLabel="Bloquear conta"
        successMessage="Conta bloqueada e sessões encerradas."
        action={() => api.setMemberBlocked(clientId, memberId, true)}
      />
      <ConfirmAction
        open={pending === "unblock"}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Desbloquear a conta de ${name}?`}
        description="A pessoa poderá entrar de novo com a senha dela."
        confirmLabel="Desbloquear conta"
        successMessage="Conta desbloqueada."
        destructive={false}
        action={() => api.setMemberBlocked(clientId, memberId, false)}
      />
      <ConfirmAction
        open={pending === "sessions"}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Encerrar as sessões de ${name}?`}
        description="Todos os dispositivos da pessoa serão desconectados. Ela poderá entrar de novo com e-mail e senha."
        confirmLabel="Encerrar sessões"
        successMessage="Sessões encerradas."
        action={() => api.revokeMemberSessions(clientId, memberId)}
      />
    </>
  );
}

export function RevokeInvitationButton({ clientId, invitationId, email }: { clientId: string; invitationId: string; email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Revogar convite de ${email}`}>
        <Trash2 aria-hidden="true" /> Revogar
      </Button>
      <ConfirmAction
        open={open}
        onOpenChange={setOpen}
        title="Revogar este convite?"
        description={`O link enviado para ${email} deixa de funcionar. Você pode criar outro convite depois.`}
        confirmLabel="Revogar convite"
        successMessage="Convite revogado."
        action={() => api.revokeInvitation(clientId, invitationId)}
      />
    </>
  );
}
