// Limpeza idempotente de arquivos (R-5, M-A): pendentes abandonados, temporarios de envio e objetos orfaos com mais de N
// horas (padrao 24, minimo 1). Orfao vai para a LIXEIRA (`.trash/`) e so e apagado depois da retencao (padrao 30 dias).
// Roda com o papel do APP (nexo_app, sem BYPASSRLS) em escopo de manutencao; nunca toca arquivo DISPONIVEL e aborta
// sem mover nada se o banco e a pasta nao forem da mesma instalacao ou se houver orfaos demais.
// Uso (via scripts/limpar-arquivos.mjs, que confere o ambiente): ver o cabecalho dele. Detalhes: docs/armazenamento.md.
import "dotenv/config";
import { createDb } from "../src/server/db/client";
import { getServerEnv } from "../src/server/config/env";
import { CleanupAbortedError } from "../src/server/domain/cleanup-policy";
import { bindInstallation, cleanupFiles, PENDING_MAX_AGE_HOURS, restoreTrashedObject } from "../src/server/services/files";
import { getStorage } from "../src/server/storage";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL (papel do app) no ambiente.");
  process.exit(2);
}
const numeroOuUndefined = (valor: string | undefined) => (valor === undefined || valor === "" ? undefined : Number(valor));

async function main(): Promise<void> {
  const env = getServerEnv();
  const db = createDb(url!);
  try {
    const storage = getStorage();
    if (process.env.LIMPAR_RESTAURAR) {
      const restored = await restoreTrashedObject(storage, process.env.LIMPAR_RESTAURAR);
      console.log(JSON.stringify({ ok: restored, restaurado: restored }));
      if (!restored) process.exitCode = 1;
      return;
    }
    const vinculo = process.env.LIMPAR_VINCULAR === "1" ? await bindInstallation(db, storage) : undefined;
    const horas = Number(process.env.LIMPAR_HORAS ?? PENDING_MAX_AGE_HOURS);
    const report = await cleanupFiles(db, storage, {
      maxAgeHours: horas,
      trashRetentionDays: numeroOuUndefined(process.env.LIMPAR_RETENCAO_DIAS) ?? env.STORAGE_TRASH_RETENTION_DAYS,
      maxOrphans: numeroOuUndefined(process.env.LIMPAR_MAX_ORFAOS) ?? env.CLEANUP_MAX_ORPHANS,
      maxOrphanRatio: numeroOuUndefined(process.env.LIMPAR_MAX_PROPORCAO) ?? env.CLEANUP_MAX_ORPHAN_RATIO,
    });
    console.log(JSON.stringify({ ok: true, horas, ...(vinculo ? { vinculo } : {}), ...report }));
  } catch (error) {
    if (error instanceof CleanupAbortedError) {
      // Mensagem do NOSSO erro (sem caminho, sem id, sem segredo): diz o que conferir. Nada foi apagado nem movido.
      console.error(JSON.stringify({ ok: false, abortado: error.code, motivo: error.message }));
      process.exitCode = 3;
    } else {
      // Nunca imprime a mensagem do driver (pode ter parametros); so o tipo.
      console.error(`Falha na limpeza: ${error instanceof Error ? error.name : typeof error}`);
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
}

void main();
