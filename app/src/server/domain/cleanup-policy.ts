// Regras PURAS da limpeza de arquivos (M-A, revisao independente da fase 2). A limpeza apaga no disco, entao
// ela so roda quando tem certeza de que o banco e esta pasta sao do MESMO sistema e que o numero de "orfaos"
// e plausivel. Banco errado ou restaurado de backup antigo faria todo objeto parecer orfao.

export const MIN_CLEANUP_HOURS = 1;
export const DEFAULT_TRASH_RETENTION_DAYS = 30;
export const DEFAULT_MAX_ORPHANS = 20;
export const DEFAULT_MAX_ORPHAN_RATIO = 0.1;
/** Abaixo disto a proporcao nao diz nada (1 orfao em 3 objetos e normal); vale so o teto absoluto. */
export const MIN_OBJECTS_FOR_RATIO = 10;

export type CleanupAbortCode =
  | "INVALID_OPTIONS"
  | "INSTALL_ID_MISSING"
  | "INSTALL_ID_MISMATCH"
  | "TOO_MANY_ORPHANS"
  | "ORPHAN_RATIO"
  | "NO_AVAILABLE_ASSETS";

/** A limpeza parou ANTES de apagar ou mover qualquer coisa de dado de cliente. Mensagem segura (sem caminho, sem id). */
export class CleanupAbortedError extends Error {
  constructor(
    readonly code: CleanupAbortCode,
    message: string,
  ) {
    super(message);
    this.name = "CleanupAbortedError";
  }
}

export interface CleanupLimits {
  maxAgeHours: number;
  trashRetentionDays: number;
  maxOrphans: number;
  maxOrphanRatio: number;
}

export function resolveCleanupLimits(input: Partial<CleanupLimits> = {}, pendingMaxAgeHours = 24): CleanupLimits {
  const limits: CleanupLimits = {
    maxAgeHours: input.maxAgeHours ?? pendingMaxAgeHours,
    trashRetentionDays: input.trashRetentionDays ?? DEFAULT_TRASH_RETENTION_DAYS,
    maxOrphans: input.maxOrphans ?? DEFAULT_MAX_ORPHANS,
    maxOrphanRatio: input.maxOrphanRatio ?? DEFAULT_MAX_ORPHAN_RATIO,
  };
  const bad = (message: string): never => {
    throw new CleanupAbortedError("INVALID_OPTIONS", message);
  };
  // Menos de 1 hora mataria envios em andamento (video grande leva tempo) e pendentes recem-criados.
  if (!Number.isFinite(limits.maxAgeHours) || limits.maxAgeHours < MIN_CLEANUP_HOURS) bad(`O minimo de --horas e ${MIN_CLEANUP_HOURS}.`);
  if (!Number.isFinite(limits.trashRetentionDays) || limits.trashRetentionDays < 1) bad("A retencao da lixeira e de pelo menos 1 dia.");
  if (!Number.isInteger(limits.maxOrphans) || limits.maxOrphans < 0) bad("O teto de orfaos precisa ser um inteiro maior ou igual a zero.");
  if (!Number.isFinite(limits.maxOrphanRatio) || limits.maxOrphanRatio < 0 || limits.maxOrphanRatio > 1) bad("A proporcao maxima de orfaos fica entre 0 e 1.");
  return limits;
}

/** Decisao sobre o identificador da instalacao (banco x pasta). `allowCreate` so vem de um pedido explicito (flag). */
export type BindingDecision =
  | { action: "ok" }
  | { action: "write-file"; id: string }
  | { action: "write-db"; id: string }
  | { action: "create-both" }
  | { action: "abort"; code: "INSTALL_ID_MISSING" | "INSTALL_ID_MISMATCH"; message: string };

export function decideInstallBinding(dbId: string | null, fileId: string | null, allowCreate: boolean): BindingDecision {
  if (dbId && fileId) {
    if (dbId === fileId) return { action: "ok" };
    // Nunca se corrige sozinho nem por flag: sao sistemas diferentes (banco trocado ou pasta de outra instalacao).
    return {
      action: "abort",
      code: "INSTALL_ID_MISMATCH",
      message: "O banco e a pasta de arquivos sao de instalacoes diferentes (identificadores nao combinam). Nada foi apagado.",
    };
  }
  if (!allowCreate) {
    const faltando = !dbId && !fileId ? "o banco e a pasta" : !dbId ? "o banco" : "a pasta de arquivos";
    return {
      action: "abort",
      code: "INSTALL_ID_MISSING",
      message: `Falta o identificador da instalacao em ${faltando}. Confira o destino e, so se for o par certo, rode uma vez com --vincular-instalacao.`,
    };
  }
  if (dbId) return { action: "write-file", id: dbId };
  if (fileId) return { action: "write-db", id: fileId };
  return { action: "create-both" };
}

export interface OrphanAssessment {
  totalObjects: number;
  orphans: number;
  availableInDb: number;
}

/** Devolve o motivo para ABORTAR (nada e movido) ou null se o numero de orfaos e plausivel. */
export function assessOrphans(a: OrphanAssessment, limits: Pick<CleanupLimits, "maxOrphans" | "maxOrphanRatio">): CleanupAbortedError | null {
  if (a.orphans === 0) return null;
  if (a.totalObjects >= MIN_OBJECTS_FOR_RATIO && a.availableInDb === 0) {
    return new CleanupAbortedError(
      "NO_AVAILABLE_ASSETS",
      "O banco nao tem nenhum arquivo DISPONIVEL, mas a pasta tem muitos objetos: provavelmente e o banco errado ou um backup antigo. Nada foi movido.",
    );
  }
  if (a.orphans > limits.maxOrphans) {
    return new CleanupAbortedError("TOO_MANY_ORPHANS", `Orfaos demais (${a.orphans}, teto ${limits.maxOrphans}). Confira o banco e a pasta; para aceitar de forma explicita use --max-orfaos. Nada foi movido.`);
  }
  if (a.totalObjects >= MIN_OBJECTS_FOR_RATIO && a.orphans / a.totalObjects > limits.maxOrphanRatio) {
    return new CleanupAbortedError(
      "ORPHAN_RATIO",
      `Proporcao de orfaos alta (${a.orphans} de ${a.totalObjects}, teto ${Math.round(limits.maxOrphanRatio * 100)}%). Confira o banco e a pasta; para aceitar de forma explicita use --max-proporcao. Nada foi movido.`,
    );
  }
  return null;
}
