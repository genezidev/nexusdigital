import type { Metadata } from "next";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { ProfileContent } from "@/components/app/profile-content";
import { ROLE_LABEL } from "@/lib/schemas";
import { requireStaffPageActor } from "@/server/page-session";

export const metadata: Metadata = { title: "Perfil" };

export default async function AdminProfilePage() {
  const loaded = await guarded("/", async () => {
    const actor = await requireStaffPageActor();
    return { actor };
  });
  if (!loaded.ok) return loaded.view;
  const { actor } = loaded.data;

  return (
    <>
      <PageHeader crumbs={[{ label: "Painel", href: "/admin" }, { label: "Perfil" }]} title="Perfil" description="Seus dados, senha e preferências." />
      <ProfileContent user={actor} roleLabel={ROLE_LABEL[actor.role]} themePreference={actor.themePreference} />
    </>
  );
}
