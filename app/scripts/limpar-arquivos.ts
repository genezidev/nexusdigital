// Limpeza idempotente de arquivos (R-5): pendentes abandonados, objetos orfaos e temporarios de envio com mais de N
// horas (padrao 24). Roda com o papel do APP (nexo_app, sem BYPASSRLS) em escopo de manutencao; nunca toca arquivo
// DISPONIVEL. Uso: node scripts/limpar-arquivos.mjs [--ambiente dev|test|producao] [--horas 24]
// Detalhes e agendamento: docs/armazenamento.md.
import "dotenv/config";
import { createDb } from "../src/server/db/client";
import { cleanupFiles, PENDING_MAX_AGE_HOURS } from "../src/server/services/files";
import { getStorage } from "../src/server/storage";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL (papel do app) no ambiente.");
  process.exit(2);
}
const horas = Number(process.env.LIMPAR_HORAS ?? PENDING_MAX_AGE_HOURS);
if (!Number.isFinite(horas) || horas < 0) {
  console.error("--horas precisa ser um numero maior ou igual a zero.");
  process.exit(2);
}

async function main(): Promise<void> {
  const db = createDb(url!);
  try {
    const report = await cleanupFiles(db, getStorage(), { maxAgeHours: horas });
    console.log(JSON.stringify({ ok: true, horas, ...report }));
  } catch (error) {
    // Nunca imprime a mensagem do driver (pode ter parametros); so o tipo.
    console.error(`Falha na limpeza: ${error instanceof Error ? error.name : typeof error}`);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

void main();
