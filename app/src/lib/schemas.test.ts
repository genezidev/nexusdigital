import { describe, expect, it } from "vitest";
import {
  acceptInvitationSchema,
  changePasswordSchema,
  createClientSchema,
  inviteSchema,
  loginSchema,
  passwordField,
  resetPasswordSchema,
} from "@/lib/schemas";

const msg = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? [];

describe("senha", () => {
  it("exige de 12 a 128 caracteres, com mensagem em portugues", () => {
    expect(passwordField.safeParse("a".repeat(11)).success).toBe(false);
    expect(msg(passwordField.safeParse("a".repeat(11)))[0]).toMatch(/pelo menos 12/);
    expect(passwordField.safeParse("a".repeat(12)).success).toBe(true);
    expect(passwordField.safeParse("a".repeat(128)).success).toBe(true);
    expect(passwordField.safeParse("a".repeat(129)).success).toBe(false);
  });

  it("confirmacao diferente e erro no campo confirm (convite, reset e troca)", () => {
    const base = { password: "uma-senha-longa-1", confirm: "outra-senha-longa-2" };
    for (const [schema, input] of [
      [acceptInvitationSchema, { name: "Pessoa Teste", ...base }],
      [resetPasswordSchema, base],
      [changePasswordSchema, { currentPassword: "atual-qualquer", ...base }],
    ] as const) {
      const r = schema.safeParse(input);
      expect(r.success).toBe(false);
      expect(r.error?.issues.some((i) => i.path.join(".") === "confirm")).toBe(true);
    }
  });

  it("a nova senha precisa ser diferente da atual", () => {
    const r = changePasswordSchema.safeParse({ currentPassword: "mesma-senha-longa-1", password: "mesma-senha-longa-1", confirm: "mesma-senha-longa-1" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path.join(".")).toBe("password");
  });
});

describe("login", () => {
  it("valida e-mail e exige senha preenchida (sem revelar regra de senha no login)", () => {
    expect(loginSchema.safeParse({ email: "x", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: " Pessoa@Empresa.com.br ", password: "x" }).success).toBe(true);
  });
});

describe("cliente e convite", () => {
  it("usa America/Maceio quando o fuso nao e informado e recusa fuso fora da lista", () => {
    const ok = createClientSchema.parse({ name: "Cliente A" });
    expect(ok.timezone).toBe("America/Maceio");
    expect(createClientSchema.safeParse({ name: "Cliente A", timezone: "Mars/Olympus" }).success).toBe(false);
  });

  it("campos opcionais vazios viram indefinidos e e-mail de contato invalido e recusado", () => {
    const ok = createClientSchema.parse({ name: "Cliente A", contactName: "  ", contactEmail: "" });
    expect(ok.contactName).toBeUndefined();
    expect(ok.contactEmail).toBeUndefined();
    expect(createClientSchema.safeParse({ name: "Cliente A", contactEmail: "sem-arroba" }).success).toBe(false);
  });

  it("convite aceita so papeis de cliente (STAFF e ADMIN ficam de fora)", () => {
    expect(inviteSchema.safeParse({ email: "a@b.com", role: "CLIENT_OWNER" }).success).toBe(true);
    expect(inviteSchema.safeParse({ email: "a@b.com", role: "STAFF" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@b.com", role: "ADMIN" }).success).toBe(false);
  });
});
