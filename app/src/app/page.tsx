import { redirect } from "next/navigation";
import { getPageActor, homeFor } from "@/server/page-session";

// Porta de entrada: o servidor decide o destino pela sessao (nada vem do navegador).
export default async function Home() {
  const actor = await getPageActor();
  redirect(actor ? homeFor(actor.role) : "/login");
}
