import { cn } from "@/lib/utils"

/** Barra de progresso acessivel (role="progressbar"). Sem `value`, fica indeterminada (sem valor inventado). */
function ProgressBar({ value, label, className }: { value: number | null; label: string; className?: string }) {
  const known = value !== null && Number.isFinite(value)
  const pct = known ? Math.max(0, Math.min(100, Math.floor(value))) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? pct : undefined}
      aria-valuetext={known ? `${pct}%` : "sem dado"}
      className={cn("h-3 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  )
}

export { ProgressBar }
