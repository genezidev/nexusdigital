import { Layers } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

/** Moldura das telas publicas (login, convite, recuperacao). Sem menu: quem nao entrou nao ve navegacao. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main id="conteudo" className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex items-center justify-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Layers className="size-5" aria-hidden="true" />
          </span>
          <span className="text-xl font-semibold tracking-tight">Nexo Digital</span>
        </div>
        <Card>
          <CardHeader>
            <h1 className="text-2xl font-semibold">{title}</h1>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-5">{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}
