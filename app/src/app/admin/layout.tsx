import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell, type NavItem } from "@/components/app/shell";
import { AccessDenied } from "@/components/app/states";
import { ROLE_LABEL } from "@/lib/schemas";
import { getPageActor } from "@/server/page-session";

// Area da agencia (ADMIN e STAFF). O layout monta o menu, mas a decisao de acesso e REPETIDA em cada
// pagina e handler: este layout nunca e a unica barreira.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await getPageActor();
  if (!actor) redirect("/login");
  if (actor.role === "USER") {
    return (
      <main id="conteudo" className="mx-auto flex min-h-dvh max-w-xl items-center px-4 py-10">
        <div className="w-full">
          <AccessDenied homeHref="/portal" />
        </div>
      </main>
    );
  }
  const nav: NavItem[] = [
    { href: "/admin", label: "Painel", icon: "dashboard", exact: true },
    { href: "/admin/clients", label: "Clientes", icon: "clients" },
    { href: "/admin/plans", label: "Planos", icon: "plans" },
    { href: "/admin/subscriptions", label: "Assinaturas e ciclos", icon: "subscriptions" },
    { href: "/admin/calendar", label: "Calendário", icon: "calendar" },
    { href: "/admin/contents", label: "Conteúdos", icon: "contents" },
    { href: "/admin/scripts", label: "Roteiros", icon: "scripts" },
    ...(actor.role === "ADMIN" ? [{ href: "/admin/audit", label: "Auditoria", icon: "audit" } satisfies NavItem] : []),
    { href: "/admin/profile", label: "Perfil", icon: "profile" },
  ];
  return (
    <AppShell
      area="admin"
      user={{ name: actor.name, email: actor.email, roleLabel: ROLE_LABEL[actor.role] }}
      themePreference={actor.themePreference}
      nav={nav}
      contextLabel={actor.role === "ADMIN" ? "Painel da agência" : "Equipe da agência"}
      profileHref="/admin/profile"
    >
      {children}
    </AppShell>
  );
}
