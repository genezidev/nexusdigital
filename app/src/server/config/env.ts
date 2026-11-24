import { z } from "zod";

// Variaveis do SERVIDOR (nenhuma tem prefixo NEXT_PUBLIC_). Validadas na primeira leitura:
// ausente ou invalida impede o uso, com mensagem que diz qual variavel falta (sem imprimir valores).
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET precisa ter 32+ caracteres"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  // Ligue (true) so atras de proxy reverso que sobrescreve x-forwarded-for; senao o limite por IP vira um balde unico.
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  // Tentativas de login por janela de 60 s e por IP. Padrao 5; so suba em testes automatizados.
  AUTH_SIGNIN_RATE_MAX: z.coerce.number().int().min(1).max(1000).default(5),
});

export type ServerEnv = z.infer<typeof schema>;

let cache: ServerEnv | undefined;

export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (source === process.env && cache) return cache;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const nomes = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuracao invalida ou ausente: ${nomes}`);
  }
  if (source === process.env) cache = parsed.data;
  return parsed.data;
}
