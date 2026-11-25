import { getServerEnv } from "@/server/config/env";

/**
 * Em producao, configuracao ausente ou invalida (inclusive TRUST_PROXY sem valor explicito, M-1) derruba o
 * processo na partida, com mensagem que lista so os NOMES das variaveis (nunca valores).
 */
export function verifyServerConfigOrExit(): void {
  try {
    const env = getServerEnv();
    // So chega aqui em producao com http se for teste local explicito (ALLOW_INSECURE_LOCAL_APP_URL, host de loopback).
    if (env.NODE_ENV === "production" && env.APP_URL.startsWith("http://")) {
      console.warn("[nexo] AVISO: APP_URL em http (cookie sem Secure): so aceitavel em teste local, nunca num servidor real.");
    }
  } catch (error) {
    console.error(`[nexo] ${error instanceof Error ? error.message : "configuracao invalida"}`);
    process.exit(1);
  }
}
