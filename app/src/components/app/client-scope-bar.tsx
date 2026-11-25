import { Building2 } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * Escolha do cliente nas telas de agencia. E um formulario GET comum (funciona sem JavaScript): o cliente escolhido
 * vai na URL so como ALVO; o servidor confere se esta pessoa pode ver aquele cliente (404 uniforme se nao puder).
 * Trocar de cliente recarrega a pagina inteira do servidor: nenhum estado do cliente anterior sobrevive.
 */
export function ClientScopeBar({ action, clients, selectedId }: { action: string; clients: { id: string; name: string }[]; selectedId?: string }) {
  return (
    <form action={action} method="get" aria-label="Escolher cliente" className="mb-4 flex flex-wrap items-end gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-sm">
        <Label htmlFor="client">Cliente</Label>
        <NativeSelect id="client" name="client" defaultValue={selectedId ?? ""} required>
          <option value="" disabled>
            Escolha um cliente
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" variant="outline">
        {selectedId ? "Trocar cliente" : "Abrir"}
      </Button>
    </form>
  );
}

export function NoClientSelected({ children }: { children?: ReactNode }) {
  return (
    <EmptyState icon={Building2} title="Escolha um cliente" description="Estas telas mostram um cliente por vez. Escolha acima o cliente que você quer ver.">
      {children}
    </EmptyState>
  );
}

/** Formulario de filtros (GET). Mantem o cliente escolhido e volta para a pagina 1. */
export function FilterForm({ action, clientId, children }: { action: string; clientId?: string; children: ReactNode }) {
  return (
    <form action={action} method="get" role="search" aria-label="Filtros" className="mb-4 flex flex-wrap items-end gap-3">
      {clientId ? <input type="hidden" name="client" value={clientId} /> : null}
      {children}
      <Button type="submit" variant="outline">
        Filtrar
      </Button>
    </form>
  );
}

export function FilterSelect({ name, label, value, options, all = "Todos" }: { name: string; label: string; value?: string; options: { value: string; label: string }[]; all?: string }) {
  const id = `f-${name}`;
  return (
    <div className="flex min-w-[10rem] flex-1 flex-col gap-2 sm:max-w-[14rem]">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} name={name} defaultValue={value ?? ""}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
