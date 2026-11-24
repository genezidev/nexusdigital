// Interface de storage (D-0010). Nenhum motor existe ainda nesta entrega: o backend de arquivos (R-5)
// implementa esta interface com disco local (dev e teste) e S3 compativel (producao). Telas, API e testes
// conhecem so este contrato. Nunca devolve caminho publico: o acesso e por URL assinada curta,
// emitida depois de assertCan e da conferencia de que o arquivo e do cliente da sessao.
export interface SignedTarget {
  url: string;
  /** Cabecalhos que o cliente precisa mandar (ex.: limite de tamanho embutido no alvo). */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectStat {
  bytes: number;
  /** SHA-256 em hexadecimal, calculado pelo servidor sobre o objeto gravado. */
  checksumSha256: string;
  /** Primeiros bytes, para conferir o tipo real pela assinatura do arquivo. */
  head: Uint8Array;
}

export interface ObjectStorage {
  createUploadTarget(key: string, opts: { maxBytes: number; expiresInSeconds: number }): Promise<SignedTarget>;
  createDownloadUrl(key: string, opts: { expiresInSeconds: number; filename?: string; inline?: boolean }): Promise<SignedTarget>;
  stat(key: string): Promise<ObjectStat | null>;
  delete(key: string): Promise<void>;
}
