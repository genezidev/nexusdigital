// Interface de storage (D-0010, revisada em D-0015). Telas, API e testes conhecem so este contrato.
// Quem emite e confere URL assinada, autoriza e valida o tipo real e a camada de servico (services/files.ts);
// o motor so move bytes, de forma limitada, em streaming e sem confiar em nada que veio do navegador.
// Motores: disco local (storage/local-disk.ts, dev e teste) e S3 compativel (producao, ainda NAO implementado;
// ver docs/armazenamento.md para o que ele precisa cumprir).

export interface StoredObject {
  bytes: number;
  /** SHA-256 em hexadecimal, calculado pelo servidor enquanto os bytes passam. */
  checksumSha256: string;
  /** Primeiros bytes (ate HEAD_BYTES), para conferir o tipo real pela assinatura do arquivo. */
  head: Uint8Array;
}

export interface OpenedObject {
  stream: ReadableStream<Uint8Array>;
  bytes: number;
}

export interface ListedObject {
  /** Chave do objeto (clients/<cliente>/<uuid>) ou, para sobras de envio, `.tmp/<nome>`. */
  key: string;
  modifiedAt: Date;
}

export interface ObjectStorage {
  readonly driver: "local";
  /**
   * Grava em streaming, SEM carregar o arquivo na memoria, em arquivo temporario, e so entao o torna visivel
   * na chave final (atomico). Passou de `maxBytes`: aborta, apaga o temporario e lanca PayloadTooLargeError (413).
   * Chave ja existente: ConflictError (nunca sobrescreve). Corpo interrompido: apaga o temporario e relanca.
   * Disco cheio ou indisponivel: StorageUnavailableError (503).
   */
  put(key: string, source: ReadableStream<Uint8Array>, opts: { maxBytes: number }): Promise<StoredObject>;
  /** Abre o objeto para leitura em streaming; null se nao existe. */
  open(key: string): Promise<OpenedObject | null>;
  /** Idempotente: objeto ja ausente nao e erro. */
  delete(key: string): Promise<void>;
  /** Objetos e temporarios mais velhos que `olderThanMs` (limpeza de orfaos). `olderThanMs: 0` lista tudo. */
  list(opts: { olderThanMs: number; now?: Date }): AsyncIterable<ListedObject>;

  // ---- Instalacao e lixeira (M-A). Limpeza nunca apaga de primeira: orfao vai para a lixeira e so sai depois da retencao. ----
  /** Identificador da instalacao gravado na RAIZ do armazenamento (`.install-id`); null se ainda nao existe. */
  readInstallId(): Promise<string | null>;
  /** Cria o identificador. NUNCA sobrescreve: ConflictError se ja existe. */
  writeInstallId(id: string): Promise<void>;
  /** Move o objeto para a lixeira (dentro da raiz) e marca `now` como a hora da remocao. false se o objeto nao existe. */
  moveToTrash(key: string, now: Date): Promise<boolean>;
  /** Devolve da lixeira para a chave original. false se nao esta na lixeira; ConflictError se a chave ja existe. */
  restoreFromTrash(key: string): Promise<boolean>;
  /** Objetos na lixeira, com a hora em que entraram. */
  listTrash(): AsyncIterable<{ key: string; trashedAt: Date }>;
  /** Apaga DE VERDADE um objeto da lixeira (idempotente). */
  deleteFromTrash(key: string): Promise<void>;
  /** Bytes livres para o app no volume do armazenamento (StorageUnavailableError se nao der para medir). */
  freeBytes(): Promise<number>;
}
