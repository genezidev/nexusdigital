import { z } from "zod";
import { INTERNAL_IP_HEADER, isValidProxyEntry } from "@/server/http/client-ip";

// Variaveis do SERVIDOR (nenhuma tem prefixo NEXT_PUBLIC_). Validadas na primeira leitura:
// ausente ou invalida impede o uso, com mensagem que diz qual variavel falta (sem imprimir valores).
const csv = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const schema = z
  .object({
    NODE_ENV: z.string().optional(),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET precisa ter 32+ caracteres"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    // Em producao a escolha e OBRIGATORIA e explicita (ausente = o app nao inicia). true so atras de proxy
    // reverso confiavel que sobrescreve TRUSTED_IP_HEADER; false = nenhum cabecalho de IP vale (docs/proxy-e-ip.md).
    TRUST_PROXY: z.enum(["true", "false"]).optional(),
    // Cabecalho com o IP do cliente que SO o proxy define (padrao x-real-ip; Cloudflare: cf-connecting-ip).
    TRUSTED_IP_HEADER: z
      .string()
      .regex(/^[A-Za-z0-9-]{1,64}$/, "TRUSTED_IP_HEADER precisa ser um nome de cabecalho simples")
      .transform((v) => v.toLowerCase())
      .refine((v) => v !== INTERNAL_IP_HEADER, "TRUSTED_IP_HEADER reservado")
      .default("x-real-ip"),
    // Lista (virgulas) de IPs/CIDRs dos proxies proprios. Opcional; so para cabecalhos com cadeia (x-forwarded-for).
    TRUSTED_PROXIES: z
      .string()
      .max(1000)
      .optional()
      .refine((v) => csv(v).length <= 32 && csv(v).every(isValidProxyEntry), "TRUSTED_PROXIES precisa listar IPs ou CIDRs validos"),
    // Tentativas de login por janela de 60 s e por IP. Padrao 5; so suba em testes automatizados.
    AUTH_SIGNIN_RATE_MAX: z.coerce.number().int().min(1).max(1000).default(5),
    // Falhas de login por (e-mail, IP) em 15 min. Padrao 10; zerado quando o login der certo.
    AUTH_SIGNIN_EMAIL_MAX: z.coerce.number().int().min(1).max(100000).default(10),
    // Teto de falhas por e-mail em 15 min, de qualquer IP (so contra ataque distribuido). Padrao 100.
    AUTH_SIGNIN_EMAIL_GLOBAL_MAX: z.coerce.number().int().min(1).max(100000).default(100),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && value.TRUST_PROXY === undefined) {
      ctx.addIssue({ code: "custom", path: ["TRUST_PROXY"], message: "TRUST_PROXY precisa ser definido (true ou false) em producao" });
    }
  })
  .transform((value) => ({
    ...value,
    TRUST_PROXY: value.TRUST_PROXY ?? "false",
    TRUSTED_PROXIES: csv(value.TRUSTED_PROXIES),
  }));

export type ServerEnv = z.output<typeof schema>;

let cache: ServerEnv | undefined;

export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (source === process.env && cache) return cache;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const nomes = [...new Set(parsed.error.issues.map((i) => i.path.join(".")))].join(", ");
    throw new Error(`Configuracao invalida ou ausente: ${nomes}`);
  }
  if (source === process.env) cache = parsed.data;
  return parsed.data;
}
