import { describe, expect, it, vi } from "vitest";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InvalidInvitationError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "@/server/errors";
import { errorResponse, isNextControlFlow } from "@/server/http/respond";

async function read(r: Response) {
  return { status: r.status, body: await r.json(), headers: r.headers };
}

describe("errorResponse (400/401/403/404/409/410/422/429/500)", () => {
  it("mapeia o erro de dominio para o status e devolve codigo + mensagem + requestId", async () => {
    const cases: [Error, number, string][] = [
      [new BadRequestError(), 400, "BAD_REQUEST"],
      [new UnauthorizedError(), 401, "UNAUTHORIZED"],
      [new ForbiddenError(), 403, "FORBIDDEN"],
      [new NotFoundError(), 404, "NOT_FOUND"],
      [new ConflictError("EMAIL_TAKEN"), 409, "EMAIL_TAKEN"],
      [new InvalidInvitationError(), 410, "INVALID_INVITATION"],
      [new ValidationError({ name: "Informe o nome." }), 422, "VALIDATION"],
      [new TooManyRequestsError(12), 429, "RATE_LIMITED"],
    ];
    for (const [error, status, code] of cases) {
      const r = await read(errorResponse(error, "req-1"));
      expect(r.status).toBe(status);
      expect(r.body.error.code).toBe(code);
      expect(r.body.error.requestId).toBe("req-1");
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("422 leva os campos e 429 leva Retry-After", async () => {
    const v = await read(errorResponse(new ValidationError({ email: "E-mail invalido." }), "r"));
    expect(v.body.error.fields).toEqual({ email: "E-mail invalido." });
    const t = await read(errorResponse(new TooManyRequestsError(7), "r"));
    expect(t.headers.get("retry-after")).toBe("7");
  });

  it("erro inesperado vira 500 generico: sem mensagem, stack nem parametros de consulta", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("duplicate key value violates unique constraint (email)=(pessoa@x.com) SELECT * FROM users");
    boom.stack = "Error: ...\n    at Object.<anonymous> (C:\\app\\node_modules\\prisma\\x.js:1:1)";
    const r = await read(errorResponse(boom, "req-9"));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/duplicate|SELECT|pessoa@x|node_modules|at Object/);
    expect(r.body.error.code).toBe("INTERNAL");
    // O log guarda so o tipo do erro, nunca a mensagem.
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/duplicate|SELECT|pessoa@x/);
    spy.mockRestore();
  });
});

describe("isNextControlFlow", () => {
  it("reconhece os sinais internos do Next (que nao podem virar 500)", () => {
    expect(isNextControlFlow(Object.assign(new Error("x"), { digest: "NEXT_PRERENDER_INTERRUPTED" }))).toBe(true);
    expect(isNextControlFlow(Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;replace;/login;307;" }))).toBe(true);
    expect(isNextControlFlow(Object.assign(new Error("x"), { digest: "DYNAMIC_SERVER_USAGE" }))).toBe(true);
    expect(isNextControlFlow(new Error("qualquer"))).toBe(false);
    expect(isNextControlFlow(null)).toBe(false);
  });
});
