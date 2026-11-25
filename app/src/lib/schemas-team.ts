import { z } from "zod";

// D-0026: corpos da equipe do cliente. strictObject: campo desconhecido (clientId, role, permissions, userId...) vira 422,
// nunca e aceito como verdade. O papel NUNCA vem do navegador: o convite do dono e sempre de colaborador.
export const teamEmail = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail muito longo.")
  .pipe(z.email("Informe um e-mail válido, como nome@empresa.com.br."));

export const teamInviteBody = z.strictObject({ email: teamEmail, approve: z.boolean().optional().default(false) });

export const teamMemberPatchBody = z
  .strictObject({ approve: z.boolean().optional(), active: z.boolean().optional() })
  .refine((v) => v.approve !== undefined || v.active !== undefined, "Informe o que mudar.")
  .refine((v) => !(v.approve !== undefined && v.active !== undefined), "Mude uma coisa por vez.");
