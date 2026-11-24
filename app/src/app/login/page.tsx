import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/app/auth-card";
import { LoginForm } from "@/components/app/login-form";
import { safeNext } from "@/lib/safe-next";
import { getPageActor, homeFor } from "@/server/page-session";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const actor = await getPageActor();
  if (actor) redirect(homeFor(actor.role));
  const { next } = await searchParams;
  return (
    <AuthCard title="Entrar" description="O acesso é feito por convite da agência. Não há cadastro público.">
      <LoginForm next={safeNext(next)} />
    </AuthCard>
  );
}
