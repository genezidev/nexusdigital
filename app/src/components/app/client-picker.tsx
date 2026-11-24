"use client";

import { Building2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, api } from "@/lib/api/client";
import { ROLE_LABEL } from "@/lib/schemas";

// Escolha de contexto para quem participa de mais de um cliente. O servidor reconfere a participacao
// (switchActiveClient); o id enviado e so um pedido.
export function ClientPicker({ clients }: { clients: { id: string; name: string; role: string }[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function choose(id: string) {
    setBusyId(id);
    try {
      await api.switchClient(id);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível escolher este cliente.");
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Escolha o cliente</CardTitle>
        <CardDescription>Você participa de mais de um cliente. Escolha com qual deseja trabalhar agora; pode trocar a qualquer momento pelo topo da página.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2">
          {clients.map((c) => (
            <li key={c.id}>
              <Button variant="outline" className="h-auto w-full justify-start gap-3 py-3 text-left" disabled={busyId !== null} onClick={() => void choose(c.id)}>
                {busyId === c.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Building2 aria-hidden="true" />}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{c.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{ROLE_LABEL[c.role] ?? c.role}</span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
