import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api/client";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("cliente unico da API", () => {
  it("valida o formato da resposta: corpo fora do contrato vira erro, nunca dado parcial", async () => {
    mockFetch(201, { id: "nao-e-uuid", name: 1 });
    await expect(api.createClient({ name: "Cliente A", timezone: "America/Maceio" })).rejects.toMatchObject({ status: 502, code: "BAD_RESPONSE" });
  });

  it("aceita a resposta valida e descarta campos extras (ex.: token de sessao do Better Auth)", async () => {
    mockFetch(200, { redirect: false, token: "segredo-que-nao-pode-passar", user: { id: "u1", email: "x@y.z" } });
    const r = await api.login({ email: "x@y.z", password: "senha" });
    expect(r).toEqual({ user: { id: "u1" } });
    expect(JSON.stringify(r)).not.toContain("segredo");
  });

  it("traduz erros do servidor e do Better Auth para pt-BR e expoe erros por campo", async () => {
    mockFetch(401, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" });
    await expect(api.login({ email: "a@b.c", password: "x" })).rejects.toMatchObject({ status: 401, message: "E-mail ou senha incorretos." });

    mockFetch(422, { error: { code: "VALIDATION", message: "Corrija os campos indicados.", fields: { name: "Informe o nome." }, requestId: "r" } });
    const e = await api.createClient({ name: "x", timezone: "America/Maceio" }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.fields).toEqual({ name: "Informe o nome." });

    mockFetch(429, { message: "Too many requests. Please try again later." });
    await expect(api.login({ email: "a@b.c", password: "x" })).rejects.toMatchObject({ status: 429, message: expect.stringMatching(/Muitas tentativas/) });

    mockFetch(410, { error: { code: "INVALID_INVITATION", message: "Convite invalido ou expirado.", requestId: "r" } });
    await expect(api.acceptInvitation({ token: "t".repeat(30), name: "Nome Teste", password: "senha-bem-longa-1" })).rejects.toMatchObject({
      status: 410,
      message: expect.stringMatching(/convite é inválido ou expirou/i),
    });
  });

  it("falha de rede nao vaza detalhes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed ECONNREFUSED 127.0.0.1"))));
    const e = await api.logout().catch((x) => x);
    expect(e).toMatchObject({ status: 0, code: "NETWORK" });
    expect(e.message).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/);
  });

  it("respostas 204 passam pelo contrato sem corpo", async () => {
    mockFetch(204, null);
    await expect(api.switchClient("0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b")).resolves.toBeUndefined();
  });
});
