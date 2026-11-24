import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/app/shell";
import { ROLE_LABEL } from "@/lib/schemas";
import { getMyClients, requireClientPageActor } from "@/server/page-session";

const NAV: NavItem[] = [
  { href: "/portal", label: "Início", icon: "home", exact: true },
  { href: "/portal/profile", label: "Perfil", icon: "profile" },
];

// Portal do cliente. A lista de clientes do seletor vem do banco (participacoes ativas da pessoa logada);
// o "cliente ativo" mostrado so conta se ainda estiver nessa lista. Cada pagina repete a decisao de acesso.
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const actor = await requireClientPageActor();
  const clients = await getMyClients(actor.userId);
  const active = clients.find((c) => c.id === actor.activeClientId) ?? null;
  return (
    <AppShell
      area="portal"
      user={{ name: actor.name, email: actor.email, roleLabel: active ? ROLE_LABEL[active.role] : "Cliente" }}
      themePreference={actor.themePreference}
      nav={NAV}
      contextLabel={active?.name ?? "Portal do cliente"}
      profileHref="/portal/profile"
      switcher={{ activeClientId: active?.id ?? null, clients: clients.map((c) => ({ id: c.id, name: c.name })) }}
    >
      {children}
    </AppShell>
  );
}
