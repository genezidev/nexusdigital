import { Building2 } from "lucide-react";
import { PageHeader, type Crumb } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";

/** Pessoa sem cliente ativo: explica e nao mostra dado nenhum. */
export function NoActiveClient({ crumbs, title }: { crumbs: Crumb[]; title: string }) {
  return (
    <>
      <PageHeader crumbs={crumbs} title={title} />
      <EmptyState icon={Building2} title="Nenhum cliente ativo" description="Escolha o cliente no topo da página ou fale com o administrador da agência se o seu acesso foi encerrado." />
    </>
  );
}
