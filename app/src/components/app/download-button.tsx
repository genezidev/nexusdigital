"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, type Scope } from "@/lib/api/client";
import { downloadAsset } from "@/lib/api/upload";

/** Baixa pelo link assinado de poucos segundos (sempre como anexo). A autorizacao e refeita no servidor a cada pedido. */
export function DownloadButton({ scope, assetId, name, label = "Baixar" }: { scope: Scope; assetId: string; name: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      await downloadAsset(scope, assetId);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível baixar o arquivo. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void go()} disabled={busy} aria-label={`${label} ${name}`}>
      {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
      {label}
    </Button>
  );
}
