import { FileSearch, ShieldAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Estados padrao do sistema (DESIGN.md): vazio, erro, acesso negado, nao encontrado e carregando.
// Sempre com texto (nunca so cor ou icone) e com um proximo passo quando existe um.

function StateBox({
  icon: Icon,
  title,
  description,
  children,
  tone = "neutral",
  role,
  headingLevel = 2,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  tone?: "neutral" | "danger";
  role?: "alert" | "status";
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <div
      role={role}
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-10 text-center"
    >
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-full",
          tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <Heading className="text-lg font-semibold">{title}</Heading>
      {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon = FileSearch,
  title,
  description,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <StateBox icon={icon} title={title} description={description}>
      {children}
    </StateBox>
  );
}

export function ErrorState({
  title = "Não foi possível carregar",
  description = "Algo deu errado do nosso lado. Seus dados não foram alterados.",
  children,
}: {
  title?: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <StateBox icon={TriangleAlert} tone="danger" role="alert" title={title} description={description}>
      {children}
    </StateBox>
  );
}

export function AccessDenied({
  description = "Você não tem permissão para ver esta página. Se acha que isto é um engano, fale com o administrador da agência.",
  homeHref = "/",
}: {
  description?: ReactNode;
  homeHref?: string;
}) {
  return (
    <StateBox icon={ShieldAlert} tone="danger" role="alert" headingLevel={1} title="Acesso negado" description={description}>
      <Button asChild variant="outline">
        <Link href={homeHref}>Voltar ao início</Link>
      </Button>
    </StateBox>
  );
}

export function NotFoundState({ homeHref = "/", description }: { homeHref?: string; description?: ReactNode }) {
  return (
    <StateBox
      icon={FileSearch}
      headingLevel={1}
      title="Página não encontrada"
      description={description ?? "O endereço não existe ou você não tem acesso a ele."}
    >
      <Button asChild variant="outline">
        <Link href={homeHref}>Voltar ao início</Link>
      </Button>
    </StateBox>
  );
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="min-h-dvh md:pl-60" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <div className="hidden md:block fixed inset-y-0 left-0 w-60 bg-sidebar" aria-hidden="true" />
      <div className="h-16 border-b" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <PageSkeleton />
      </div>
    </div>
  );
}
