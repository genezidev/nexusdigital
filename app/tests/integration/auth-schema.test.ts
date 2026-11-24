import { beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "@/server/auth/auth";
import { appDb, makeUser, ownerDb, TEST_PASSWORD } from "./helpers/world";

// Confirma que o schema real (UUID, enums, snake_case) funciona com o Better Auth 1.7.27
// e que reset de senha usa token em hash, de uso unico (D-0002, R-3).
let resetToken = "";
const auth = createAuth(appDb, {
  secret: "segredo-de-teste-com-mais-de-32-caracteres-aaaa",
  baseURL: "http://localhost:3000",
  sendResetPassword: async ({ token }) => {
    resetToken = token;
  },
});

let user: { id: string; email: string };
beforeAll(async () => {
  user = await makeUser("USER", "login");
});

describe("Better Auth sobre o schema do Nexo", () => {
  it("login com e-mail e senha cria sessao com id UUID", async () => {
    const r = await auth.api.signInEmail({ body: { email: user.email, password: TEST_PASSWORD } });
    expect(r.user.id).toBe(user.id);
    const s = await ownerDb.session.findMany({ where: { userId: user.id } });
    expect(s).toHaveLength(1);
    expect(s[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("senha errada falha", async () => {
    await expect(auth.api.signInEmail({ body: { email: user.email, password: "senha-errada-123456" } })).rejects.toThrow();
  });

  it("nao existe cadastro publico", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: "publico@teste.test", password: TEST_PASSWORD, name: "Publico" } }),
    ).rejects.toThrow();
    expect(await ownerDb.user.count({ where: { email: "publico@teste.test" } })).toBe(0);
  });

  it("conta bloqueada nao entra", async () => {
    const bloqueado = await makeUser("USER", "bloqueado");
    await ownerDb.user.update({ where: { id: bloqueado.id }, data: { banned: true } });
    await expect(auth.api.signInEmail({ body: { email: bloqueado.email, password: TEST_PASSWORD } })).rejects.toThrow();
  });

  it("reset: token guardado como hash, uso unico, sessoes antigas revogadas", async () => {
    await auth.api.signInEmail({ body: { email: user.email, password: TEST_PASSWORD } });
    expect(await ownerDb.session.count({ where: { userId: user.id } })).toBeGreaterThan(0);

    await auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: "http://localhost:3000/reset-password" } });
    expect(resetToken.length).toBeGreaterThan(10);
    const guardados = await ownerDb.verification.findMany();
    expect(guardados.some((v) => v.identifier.includes(resetToken) || v.value.includes(resetToken))).toBe(false);

    const novaSenha = "outra-senha-bem-forte-99";
    await auth.api.resetPassword({ body: { newPassword: novaSenha, token: resetToken } });
    await expect(auth.api.resetPassword({ body: { newPassword: "mais-uma-senha-forte-77", token: resetToken } })).rejects.toThrow();
    expect(await ownerDb.session.count({ where: { userId: user.id } })).toBe(0);
    await expect(auth.api.signInEmail({ body: { email: user.email, password: TEST_PASSWORD } })).rejects.toThrow();
    await expect(auth.api.signInEmail({ body: { email: user.email, password: novaSenha } })).resolves.toBeDefined();
  });
});
