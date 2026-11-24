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
    // ---- Armazenamento privado de arquivos (R-5, D-0015). Somente nomes aqui; valores em app/.env. ----
    // Motor: so "local" existe nesta entrega (driver S3 documentado em docs/armazenamento.md).
    STORAGE_DRIVER: z.enum(["local"]).default("local"),
    // Pasta do driver de disco: FORA de public/ e fora do Git. Em producao, caminho absoluto.
    STORAGE_LOCAL_DIR: z.string().min(1).max(500).optional(),
    // Segredo das URLs assinadas (HMAC). Em dev/teste, se ausente, deriva do BETTER_AUTH_SECRET; em producao e obrigatorio.
    STORAGE_SIGNING_SECRET: z.string().min(32, "STORAGE_SIGNING_SECRET precisa ter 32+ caracteres").optional(),
    // Tamanho maximo por tipo, em MB (aceita fracao so para teste). Padroes da spec: 20, 50, 2048.
    MAX_IMAGE_MB: z.coerce.number().positive().max(10240).default(20),
    MAX_PDF_MB: z.coerce.number().positive().max(10240).default(50),
    MAX_VIDEO_MB: z.coerce.number().positive().max(10240).default(2048),
    // Validade das URLs assinadas: alvo de envio (video grande) e download (curtissima).
    UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(5).max(3600).default(900),
    DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(5).max(600).default(60),
    // Limites por usuario: pedidos de alvo de envio e de link de download, por janela de 10 minutos.
    UPLOAD_RATE_MAX: z.coerce.number().int().min(1).max(100000).default(60),
    DOWNLOAD_RATE_MAX: z.coerce.number().int().min(1).max(100000).default(300),
    // Quantos envios pendentes cada pessoa pode ter ao mesmo tempo.
    MAX_PENDING_UPLOADS_PER_USER: z.coerce.number().int().min(1).max(1000).default(10),
    // Cota de armazenamento por cliente em MB (DISPONIVEL + pendentes declarados). 0 desliga a conferencia.
    STORAGE_CLIENT_QUOTA_MB: z.coerce.number().min(0).max(10_000_000).default(51200),
    // Dominios autorizados para link de gravacao (CSV). Vazio = lista padrao do codigo (domain/external-link.ts).
    RECORDING_LINK_DOMAINS: z.string().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && value.TRUST_PROXY === undefined) {
      ctx.addIssue({ code: "custom", path: ["TRUST_PROXY"], message: "TRUST_PROXY precisa ser definido (true ou false) em producao" });
    }
    if (value.NODE_ENV === "production" && !value.STORAGE_SIGNING_SECRET) {
      ctx.addIssue({ code: "custom", path: ["STORAGE_SIGNING_SECRET"], message: "STORAGE_SIGNING_SECRET precisa ser definido em producao" });
    }
  })
  .transform((value) => ({
    ...value,
    TRUST_PROXY: value.TRUST_PROXY ?? "false",
    TRUSTED_PROXIES: csv(value.TRUSTED_PROXIES),
    RECORDING_LINK_DOMAINS: csv(value.RECORDING_LINK_DOMAINS).map((d) => d.toLowerCase()),
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
