// Roda uma vez quando o servidor Next inicia (nao no `next build`). A verificacao fica em arquivo so de Node
// (instrumentation-node.ts) porque usa process.exit, que o analisador do Edge recusa.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;
  const { verifyServerConfigOrExit } = await import("./instrumentation-node");
  verifyServerConfigOrExit();
}
