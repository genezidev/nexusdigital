"use client";

import { ErrorState } from "@/components/app/states";
import { Button } from "@/components/ui/button";

// Erro inesperado numa tela da area admin: texto fixo, sem excecao nem stack. O shell continua de pe.
export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState>
      <Button onClick={() => reset()}>Tentar de novo</Button>
    </ErrorState>
  );
}
