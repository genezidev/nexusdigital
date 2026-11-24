import type { Metadata } from "next";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { ProfileContent } from "@/components/app/profile-content";
import { ROLE_LABEL } from "@/lib/schemas";
import { getMyClients, requireClientPageActor } from "@/server/page-session";

export const metadata: Metadata = { title: "Perfil" };

export default async function PortalProfilePage() {
  const loaded = await guarded("/", async () => {
    const actor = await requireClientPageActor();
    const clients = await getMyClients(actor.userId);
    const active = clients.find((c) => c.id === actor.activeClientId) ?? null;
    return { actor, active };
  });
  if (!loaded.ok) return loaded.view;
  const { actor, active } = loaded.data;

  return (
    <>
      <PageHeader crumbs={[{ label: "Início", href: "/portal" }, { label: "Perfil" }]} title="Perfil" description="Seus dados, senha e preferências." />
      <ProfileContent
        user={actor}
        roleLabel={active ? ROLE_LABEL[active.role] : "Cliente"}
        themePreference={actor.themePreference}
        clientName={active?.name ?? null}
      />
    </>
  );
}
