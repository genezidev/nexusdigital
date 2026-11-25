// Erros de dominio com codigo HTTP sugerido. Nunca carregam segredo, token ou hash.
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ConflictError extends AppError {
  constructor(code = "CONFLICT", message = "Registro ja existe.") {
    super(code, 409, message);
  }
}

export class NotFoundError extends AppError {
  // Mesmo erro para "nao existe" e "e de outro cliente": nao revela a existencia.
  constructor(message = "Nao encontrado.") {
    super("NOT_FOUND", 404, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado.") {
    super("FORBIDDEN", 403, message);
  }
}

// Convite invalido, usado, revogado ou expirado: mesma mensagem para todos os casos.
export class InvalidInvitationError extends AppError {
  constructor() {
    super("INVALID_INVITATION", 410, "Convite invalido ou expirado.");
  }
}

export class WeakPasswordError extends AppError {
  constructor(message = "Senha fraca ou curta.") {
    super("WEAK_PASSWORD", 422, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Entre para continuar.") {
    super("UNAUTHORIZED", 401, message);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Requisicao invalida.") {
    super("BAD_REQUEST", 400, message);
  }
}

// Dados bem formados, mas invalidos para a regra (campo a campo, em portugues, sem dado sensivel).
export class ValidationError extends AppError {
  constructor(
    readonly fields: Record<string, string>,
    message = "Corrija os campos indicados.",
  ) {
    super("VALIDATION", 422, message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super("RATE_LIMITED", 429, "Muitas tentativas. Aguarde um pouco e tente novamente.");
  }
}

// Regra de dominio recusada (maquina de estados, justificativa ausente...): 422 com o codigo e, quando houver,
// a lista do que seria permitido. Nunca carrega dado sensivel.
export class DomainRuleError extends AppError {
  constructor(
    code: string,
    message: string,
    readonly allowed: readonly string[] = [],
  ) {
    super(code, 422, message);
  }
}

// Arquivos (R-5): corpo grande demais, tipo recusado, link vencido e armazenamento fora do ar.
export class PayloadTooLargeError extends AppError {
  constructor(message = "O arquivo e maior que o limite permitido.") {
    super("PAYLOAD_TOO_LARGE", 413, message);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = "Tipo de arquivo nao permitido.", code = "UNSUPPORTED_MEDIA_TYPE") {
    super(code, 415, message);
  }
}

// Link assinado com assinatura valida, da propria pessoa, mas vencido: ela pede outro.
export class GoneError extends AppError {
  constructor(message = "O link venceu. Peca um novo.") {
    super("LINK_EXPIRED", 410, message);
  }
}

// Disco cheio, pasta ausente ou S3 fora: nunca sucesso falso, nunca detalhe interno.
export class StorageUnavailableError extends AppError {
  constructor(message = "Armazenamento indisponivel no momento. Tente novamente em instantes.") {
    super("STORAGE_UNAVAILABLE", 503, message);
  }
}

// Capacidade do SERVIDOR (teto global de armazenamento ou pouco espaco livre no volume): 507, mensagem clara e sem
// numero interno. Diferente da cota do cliente (422, STORAGE_QUOTA_EXCEEDED), que e regra de negocio por cliente.
export class InsufficientStorageError extends AppError {
  constructor(message = "O armazenamento do servidor esta sem espaco no momento. Tente novamente mais tarde ou avise a agencia.") {
    super("STORAGE_FULL", 507, message);
  }
}

// Arquivo marcado em QUARENTENA (scan_status): nao se baixa ate a agencia liberar. 423 e codigo proprio, sem detalhe.
export class AssetQuarantinedError extends AppError {
  constructor(message = "Este arquivo esta em quarentena e nao pode ser baixado.") {
    super("ASSET_QUARANTINED", 423, message);
  }
}
