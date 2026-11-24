import { z } from "zod";
import { TIMEZONE_VALUES, DEFAULT_TIMEZONE } from "@/lib/timezones";

// Validacao compartilhada entre formularios (navegador) e handlers (servidor). Mensagens em pt-BR.
// O servidor SEMPRE revalida: a validacao do navegador e so conforto.

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

const email = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail muito longo.")
  .pipe(z.email("Informe um e-mail válido, como nome@empresa.com.br."));

export const passwordField = z
  .string({ error: "Informe a senha." })
  .min(MIN_PASSWORD_LENGTH, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  .max(MAX_PASSWORD_LENGTH, `A senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`);

const personName = z
  .string({ error: "Informe o nome." })
  .trim()
  .min(2, "Informe o nome com pelo menos 2 caracteres.")
  .max(120, "Nome muito longo (máximo 120 caracteres).");

export const loginSchema = z.object({
  email,
  password: z.string({ error: "Informe a senha." }).min(1, "Informe a senha."),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: passwordField, confirm: z.string().min(1, "Repita a nova senha.") })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não são iguais." });

export const acceptInvitationSchema = z
  .object({ name: personName, password: passwordField, confirm: z.string().min(1, "Repita a senha.") })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não são iguais." });

// Corpo enviado ao servidor (sem o campo de confirmacao).
export const acceptInvitationBody = z.object({
  token: z.string().min(20).max(200),
  name: personName,
  password: passwordField,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    password: passwordField,
    confirm: z.string().min(1, "Repita a nova senha."),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As senhas não são iguais." })
  .refine((v) => v.password !== v.currentPassword, { path: ["password"], message: "A nova senha precisa ser diferente da atual." });

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} muito longo (máximo ${max} caracteres).`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const createClientSchema = z.object({
  name: z.string({ error: "Informe o nome do cliente." }).trim().min(2, "Informe o nome do cliente (mínimo 2 caracteres).").max(120, "Nome muito longo (máximo 120 caracteres)."),
  contactName: optionalText(120, "Nome do contato"),
  contactEmail: z
    .string()
    .trim()
    .max(254, "E-mail muito longo.")
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.email("Informe um e-mail de contato válido.").optional()),
  timezone: z.enum(TIMEZONE_VALUES, { error: "Escolha um fuso horário da lista." }).default(DEFAULT_TIMEZONE),
});

export const INVITE_ROLES = ["CLIENT_OWNER", "CLIENT_COLLABORATOR"] as const;
export const inviteSchema = z.object({
  email,
  role: z.enum(INVITE_ROLES, { error: "Escolha o papel da pessoa." }),
});

export const blockSchema = z.object({ blocked: z.boolean() });
export const switchClientSchema = z.object({ clientId: z.uuid("Cliente inválido.") });
export const themeSchema = z.object({ theme: z.enum(["SYSTEM", "LIGHT", "DARK"]) });

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  STAFF: "Equipe",
  CLIENT_OWNER: "Responsável do cliente",
  CLIENT_COLLABORATOR: "Colaborador do cliente",
};

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
