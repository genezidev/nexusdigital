import { Skeleton } from "@/components/ui/skeleton";

// Estado "carregando" da raiz (telas publicas e primeira carga do shell). O shell tem o seu proprio skeleton.
export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <div className="flex w-full max-w-md flex-col gap-4" aria-hidden="true">
        <Skeleton className="mx-auto h-9 w-44" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </main>
  );
}
