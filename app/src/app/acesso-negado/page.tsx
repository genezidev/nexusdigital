import type { Metadata } from "next";
import { AccessDenied } from "@/components/app/states";

export const metadata: Metadata = { title: "Acesso negado" };

// Destino do proxy para quem esta logado mas nao pode ver a area pedida (resposta 403).
export default function AccessDeniedPage() {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-xl items-center px-4 py-10">
      <div className="w-full">
        <AccessDenied />
      </div>
    </main>
  );
}
