import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatPercent, progressSummary } from "@/lib/labels";

export interface ProgressData {
  quota: number;
  hasQuota: boolean;
  percent: number | null;
  surplus: number;
  planned: number;
  produced: number;
  approved: number;
  published: number;
  outsideQuota?: { planned: number; produced: number; approved: number; published: number };
  source?: "live" | "snapshot";
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Progresso do ciclo (regra unica calculada no servidor). Planejadas, produzidas, aprovadas e publicadas ficam
 * lado a lado; excedente e "fora da cota" aparecem SEPARADOS e nunca somados. Sem cota: texto honesto, sem 0%.
 */
export function ProgressCard({ title = "Progresso do mês", description, progress }: { title?: string; description?: string; progress: ProgressData | null }) {
  if (!progress) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>N/D: ainda não há ciclo aberto para calcular o progresso.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description ?? "Publicações do mês em relação à cota contratada."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-lg font-semibold" data-testid="progress-summary">
            {progressSummary(progress)}
          </p>
          {progress.hasQuota ? <ProgressBar value={progress.percent} label={`Progresso do mês: ${formatPercent(progress.percent)}`} /> : null}
        </div>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Planejadas" value={progress.planned} />
          <Stat label="Produzidas" value={progress.produced} />
          <Stat label="Aprovadas" value={progress.approved} />
          <Stat label="Publicadas" value={progress.published} />
        </dl>
        <p className="text-sm text-muted-foreground">
          {progress.surplus > 0 ? `Excedente (acima da cota): ${progress.surplus}. ` : "Sem excedente. "}
          {progress.outsideQuota ? `Fora da cota (Stories, bônus e peças não contáveis): ${progress.outsideQuota.published} publicada(s) de ${progress.outsideQuota.planned}. ` : ""}
          {progress.source === "snapshot" ? "Ciclo encerrado: números do fechamento." : ""}
        </p>
      </CardContent>
    </Card>
  );
}
