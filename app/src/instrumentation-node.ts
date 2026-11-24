import { getServerEnv } from "@/server/config/env";

/**
 * Em producao, configuracao ausente ou invalida (inclusive TRUST_PROXY sem valor explicito, M-1) derruba o
 * processo na partida, com mensagem que lista so os NOMES das variaveis (nunca valores).
 */
export function verifyServerConfigOrExit(): void {
  try {
    getServerEnv();
  } catch (error) {
    console.error(`[nexo] ${error instanceof Error ? error.message : "configuracao invalida"}`);
    process.exit(1);
  }
}
