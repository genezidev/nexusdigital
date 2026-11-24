"use client";

import { ErrorState } from "@/components/app/states";
import { Button } from "@/components/ui/button";

// Erro inesperado de renderizacao: texto fixo, sem mensagem de excecao nem stack (o log fica no servidor).
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-xl items-center px-4 py-10">
      <div className="w-full">
        <ErrorState>
          <Button onClick={() => reset()}>Tentar de novo</Button>
        </ErrorState>
      </div>
    </main>
  );
}
