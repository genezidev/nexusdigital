// Provisionamento do ambiente (M-3): define a senha do papel `nexo_app` e cria o PRIMEIRO administrador.
// Roda com o DONO do banco (DATABASE_MIGRATE_URL), DEPOIS do backup e das migrations (docs/runbook-producao.md).
//
//   node scripts/provisionar-producao.mjs --ambiente=producao --confirmo=producao
//   node scripts/provisionar-producao.mjs --ambiente=producao --confirmo=producao --somente-papel   (rotacao)
//   node scripts/provisionar-producao.mjs --ambiente=producao --confirmo=producao --permitir-outro-admin
//
// Regras:
// - Segredos SO por variavel de ambiente ou prompt oculto; nunca por argumento (argv aparece em `ps` e no
//   historico do shell), nunca no codigo, e nada disso e impresso. Este script NAO le .env.
// - `--ambiente=dev|test|producao` e obrigatorio e a confirmacao e explicita (`--confirmo=<ambiente>` ou digitar a frase).
// - dev/test: so em 127.0.0.1/localhost, banco nexo_dev ou nexo_test (nexo_test_prov_* para copias de teste).
//   producao: banco que nao seja nexo_dev/nexo_test e host:porta listado em PROVISIONAR_HOST_PERMITIDO.
// - Idempotente: se ja existe ADMIN, recusa (codigo 3) sem alterar nada, salvo --permitir-outro-admin.
//   --somente-papel rotaciona so a senha do papel nexo_app.
// - Uma transacao, com trava consultiva: tudo ou nada. Grava auditoria (admin.provisioned).
//
// Variaveis: DATABASE_MIGRATE_URL, PROVISIONAR_HOST_PERMITIDO (so producao), APP_DB_PASSWORD (24+),
// ADMIN_NOME, ADMIN_EMAIL, ADMIN_SENHA (12 a 128, igual ao minimo do app). Faltando uma, pede no terminal.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

// Mesmos limites do app (src/server/services/invitations.ts); um teste confere a igualdade.
export const MIN_SENHA = 12;
export const MAX_SENHA = 128;
export const MIN_SENHA_PAPEL_APP = 24;

// Lista curta e honesta: pega as piores senhas e padroes obvios (palavras comuns, estacoes e meses, teclado,
// sequencias, repeticoes, substituicoes tipo P@ssw0rd). NAO garante que a senha seja forte: use um gerenciador.
const PALAVRAS_COMUNS = [
  "password", "passwd", "senha", "123456", "12345", "qwerty", "qwert", "asdfg", "zxcvb", "abcdef", "admin", "nexo", "letmein",
  "welcome", "iloveyou", "mudar", "trocar", "master", "secret", "segredo", "login", "root", "teste", "test", "brasil", "futebol",
  "flamengo", "corinthians", "palmeiras", "summer", "winter", "spring", "autumn", "verao", "inverno", "outono", "primavera",
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december",
  "monkey", "dragon", "football", "baseball", "sunshine", "princess", "batman", "superman", "changeme", "default", "guest",
];
const LINHAS_TECLADO = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "qazwsxedc", "1q2w3e4r5t"];

function normalizarLeet(texto) {
  const mapa = { "@": "a", 4: "a", 3: "e", 1: "i", "!": "i", 0: "o", 5: "s", $: "s", 7: "t", 8: "b", 9: "g" };
  return [...texto.toLowerCase()].map((c) => mapa[c] ?? c).join("");
}

function temSequenciaDeTeclado(minusculas) {
  for (const linha of LINHAS_TECLADO) {
    for (const base of [linha, [...linha].reverse().join("")]) {
      for (let i = 0; i + 5 <= base.length; i++) if (minusculas.includes(base.slice(i, i + 5))) return true;
    }
  }
  return false;
}

export class Recusa extends Error {
  constructor(mensagem, codigo = 2) {
    super(mensagem);
    this.codigo = codigo;
  }
}

/** Devolve o motivo da recusa ou null. Nunca inclui a senha na mensagem. */
export function motivoSenhaFraca(senha, { email = "", nome = "" } = {}) {
  if (typeof senha !== "string") return "Senha ausente.";
  if (senha.length < MIN_SENHA) return `A senha precisa ter ao menos ${MIN_SENHA} caracteres.`;
  if (senha.length > MAX_SENHA) return `A senha pode ter no maximo ${MAX_SENHA} caracteres.`;
  const minuscula = senha.toLowerCase();
  const leet = normalizarLeet(senha);
  if (new Set(senha).size < 6) return "A senha tem poucos caracteres diferentes.";
  if (PALAVRAS_COMUNS.some((c) => minuscula.includes(c) || leet.includes(c))) return "A senha contem uma palavra ou sequencia comum.";
  if (temSequenciaDeTeclado(minuscula)) return "A senha contem uma sequencia de teclado.";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && (minuscula.includes(local) || leet.includes(normalizarLeet(local)))) return "A senha nao pode conter o seu e-mail.";
  const primeiroNome = nome.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (primeiroNome.length >= 4 && minuscula.includes(primeiroNome)) return "A senha nao pode conter o seu nome.";
  if (/(.)\1{3,}/.test(senha)) return "A senha repete o mesmo caractere varias vezes seguidas.";
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg)/i.test(senha)) return "A senha contem uma sequencia obvia.";
  if (/^[a-z]+\d{1,6}[^a-z0-9]{0,3}$/i.test(senha) && senha.length < 16) return "A senha segue o padrao palavra + numero.";
  return null;
}

export function motivoSenhaPapelFraca(senha) {
  if (typeof senha !== "string" || senha.length < MIN_SENHA_PAPEL_APP) return `A senha do papel nexo_app precisa ter ao menos ${MIN_SENHA_PAPEL_APP} caracteres.`;
  if (senha.length > 200) return "A senha do papel nexo_app e longa demais.";
  // So ASCII imprimivel e sem caracteres que compliquem a URL de conexao copiada para o .env do app.
  if (!/^[\x21-\x7e]+$/.test(senha)) return "A senha do papel nexo_app deve usar so caracteres ASCII visiveis, sem espacos.";
  if (new Set(senha).size < 8) return "A senha do papel nexo_app tem poucos caracteres diferentes.";
  return null;
}

/** Verificador SCRAM-SHA-256 do PostgreSQL: o texto da senha nunca chega ao servidor nem aos logs de SQL. */
export function verificadorScram(senha, iteracoes = 4096) {
  const sal = randomBytes(16);
  const salgada = pbkdf2Sync(senha, sal, iteracoes, 32, "sha256");
  const hmac = (chave, texto) => createHmac("sha256", chave).update(texto).digest();
  const chaveCliente = hmac(salgada, "Client Key");
  const guardada = createHash("sha256").update(chaveCliente).digest("base64");
  const chaveServidor = hmac(salgada, "Server Key").toString("base64");
  return `SCRAM-SHA-256$${iteracoes}:${sal.toString("base64")}$${guardada}:${chaveServidor}`;
}

const LOCAL = new Set(["127.0.0.1", "localhost", "::1"]);
const SSLMODES = new Set(["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]);

/** Valida o destino contra o ambiente declarado. Devolve { host, porta, banco } (sem usuario nem senha). */
export function autorizarDestino(ambiente, urlTexto, hostsPermitidos = "") {
  if (!["dev", "test", "producao"].includes(ambiente)) throw new Recusa("Declare o ambiente: --ambiente=dev, --ambiente=test ou --ambiente=producao.");
  let url;
  try {
    url = new URL(urlTexto ?? "");
  } catch {
    throw new Recusa("DATABASE_MIGRATE_URL ausente ou invalida.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Recusa("DATABASE_MIGRATE_URL precisa ser uma URL postgresql://.");
  // Query string alem de sslmode e recusada: ?host=, ?port=, ?hostaddr=, ?options= trocariam o destino
  // DEPOIS da autorizacao (o driver pg os usa para sobrescrever a URL).
  for (const [chave, valor] of url.searchParams) {
    if (chave !== "sslmode" || !SSLMODES.has(valor)) throw new Recusa("Recusado: a URL do banco so pode ter o parametro sslmode (nada de host, port, hostaddr ou options).");
  }
  if (url.hash) throw new Recusa("Recusado: a URL do banco nao pode ter fragmento.");
  // O que o driver vai usar de verdade para conectar (mesmo parse da conexao) precisa coincidir com a URL.
  const real = new pg.Client({ connectionString: urlTexto });
  const banco = String(real.database ?? "");
  const porta = String(real.port ?? "5432");
  const host = String(real.host ?? "").toLowerCase().replace(/^\[|\]$/g, "");
  const hostUrl = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host !== hostUrl || banco !== decodeURIComponent(url.pathname.replace(/^\//, "")) || porta !== (url.port || "5432")) {
    throw new Recusa("Recusado: a URL do banco e ambigua (o driver conectaria em outro destino).");
  }
  const alvo = { host, porta, banco };
  if (ambiente === "dev" || ambiente === "test") {
    const permitido = ambiente === "dev" ? banco === "nexo_dev" : /^nexo_test(_prov_[a-z0-9]{1,24})?$/.test(banco);
    if (!LOCAL.has(host) || !permitido) {
      throw new Recusa(`Recusado: --ambiente=${ambiente} so vale em 127.0.0.1/localhost com o banco ${ambiente === "dev" ? "nexo_dev" : "nexo_test"}.`);
    }
    return alvo;
  }
  if (/^nexo_(dev|test)/.test(banco)) throw new Recusa("Recusado: --ambiente=producao nao pode apontar para nexo_dev ou nexo_test.");
  const lista = hostsPermitidos.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (lista.length === 0) throw new Recusa("Recusado: defina PROVISIONAR_HOST_PERMITIDO com o host (ou host:porta) autorizado.");
  if (!lista.includes(host) && !lista.includes(`${host}:${porta}`)) throw new Recusa(`Recusado: o host ${host}:${porta} nao esta em PROVISIONAR_HOST_PERMITIDO.`);
  return alvo;
}

function lerArgumentos(argv) {
  const out = { somentePapel: false, outroAdmin: false };
  for (const arg of argv) {
    if (arg === "--somente-papel") out.somentePapel = true;
    else if (arg === "--permitir-outro-admin") out.outroAdmin = true;
    else if (arg.startsWith("--ambiente=")) out.ambiente = arg.slice(11);
    else if (arg.startsWith("--confirmo=")) out.confirmo = arg.slice(11);
    else throw new Recusa(`Argumento desconhecido: ${arg.split("=")[0]}. Segredos nunca vao por argumento: use variavel de ambiente ou o prompt.`);
  }
  return out;
}

async function perguntar(texto, { oculto = false } = {}) {
  if (!process.stdin.isTTY) throw new Recusa(`Falta um valor e nao ha terminal interativo para perguntar: ${texto.trim()}`);
  process.stdout.write(texto);
  const stdin = process.stdin;
  if (oculto) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let buf = "";
    const fim = (fn) => {
      stdin.removeListener("data", aoReceber);
      if (oculto) stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
      fn();
    };
    const aoReceber = (trecho) => {
      for (const c of trecho) {
        if (c === "\r" || c === "\n") return fim(() => resolve(buf));
        if (c === "\u0003") return fim(() => reject(new Recusa("Cancelado.", 130)));
        if (c === "\u007f" || c === "\b") buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on("data", aoReceber);
  });
}

async function valor(nome, pergunta, opcoes = {}) {
  const env = process.env[nome];
  const bruto = env !== undefined && env !== "" ? env : await perguntar(pergunta, { oculto: opcoes.oculto === true });
  return opcoes.aparar === false ? bruto : bruto.trim();
}

function mascarar(email) {
  const [local, dominio] = email.split("@");
  return `${local.slice(0, 1)}***@${dominio}`;
}

export async function principal(argv = process.argv.slice(2)) {
  const args = lerArgumentos(argv);
  const alvo = autorizarDestino(args.ambiente, process.env.DATABASE_MIGRATE_URL, process.env.PROVISIONAR_HOST_PERMITIDO);

  // Confirmacao explicita: --confirmo=<ambiente> ou a frase digitada.
  if (args.confirmo !== args.ambiente) {
    const frase = `PROVISIONAR ${args.ambiente.toUpperCase()}`;
    console.log(`Destino: ${alvo.host}:${alvo.porta}/${alvo.banco} (ambiente ${args.ambiente}).`);
    console.log("Antes: backup tirado e migrations aplicadas (docs/runbook-producao.md).");
    const resposta = await perguntar(`Para continuar, digite exatamente ${frase}: `);
    if (resposta.trim() !== frase) throw new Recusa("Confirmacao nao confere. Nada foi alterado.");
  }

  // Valida TODAS as entradas antes de abrir conexao (nada parcial).
  const senhaPapel = await valor("APP_DB_PASSWORD", "Nova senha do papel nexo_app: ", { oculto: true, aparar: false });
  const fracaPapel = motivoSenhaPapelFraca(senhaPapel);
  if (fracaPapel) throw new Recusa(fracaPapel);

  let admin = null;
  if (!args.somentePapel) {
    const nome = await valor("ADMIN_NOME", "Nome do administrador: ");
    const email = (await valor("ADMIN_EMAIL", "E-mail do administrador: ")).toLowerCase();
    if (nome.length < 2 || nome.length > 120) throw new Recusa("Nome do administrador invalido (2 a 120 caracteres).");
    if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) throw new Recusa("E-mail do administrador invalido.");
    let senha = await valor("ADMIN_SENHA", "Senha do administrador: ", { oculto: true, aparar: false });
    if (process.env.ADMIN_SENHA === undefined || process.env.ADMIN_SENHA === "") {
      const repetida = await perguntar("Repita a senha: ", { oculto: true });
      if (repetida !== senha) throw new Recusa("As senhas nao conferem.");
    }
    const fraca = motivoSenhaFraca(senha, { email, nome });
    if (fraca) throw new Recusa(fraca);
    admin = { nome, email, hash: await hashPassword(senha) };
    senha = "";
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_MIGRATE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nexo:provisionar'))");

    const papel = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'nexo_app'");
    const tabelas = await client.query("SELECT to_regclass('public.users') AS users, to_regclass('public._prisma_migrations') AS migracoes");
    if (papel.rowCount === 0 || !tabelas.rows[0].users || !tabelas.rows[0].migracoes) {
      throw new Recusa("O banco ainda nao tem as migrations (papel nexo_app e tabelas). Rode as migrations antes.", 4);
    }
    const pendentes = await client.query("SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL");
    if (pendentes.rows[0].n > 0) throw new Recusa("Ha migration inacabada neste banco. Resolva antes de provisionar.", 4);

    if (admin) {
      const existentes = await client.query("SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN'");
      if (existentes.rows[0].n > 0 && !args.outroAdmin) {
        throw new Recusa("Ja existe um administrador. Nada foi alterado. (Para rotacionar so a senha do papel: --somente-papel. Para outro admin: --permitir-outro-admin.)", 3);
      }
      const mesmoEmail = await client.query("SELECT 1 FROM users WHERE email = $1", [admin.email]);
      if (mesmoEmail.rowCount > 0) throw new Recusa("Ja existe um usuario com este e-mail. Nada foi alterado.", 3);
    }

    // Senha do papel por verificador SCRAM (o texto nao aparece nos logs do servidor).
    const comando = await client.query("SELECT format('ALTER ROLE nexo_app PASSWORD %L', $1::text) AS cmd", [verificadorScram(senhaPapel)]);
    await client.query(comando.rows[0].cmd);

    let resumoAdmin = "";
    if (admin) {
      await client.query("SELECT set_config('app.system', 'on', true)");
      const criado = await client.query(
        "INSERT INTO users (name, email, email_verified, role, updated_at) VALUES ($1, $2, true, 'ADMIN', now()) RETURNING id",
        [admin.nome, admin.email],
      );
      const id = criado.rows[0].id;
      await client.query(
        "INSERT INTO accounts (user_id, account_id, provider_id, password, updated_at) VALUES ($1::uuid, $2::text, 'credential', $3, now())",
        [id, id, admin.hash],
      );
      await client.query(
        "INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, diff) VALUES ($1::uuid, 'admin.provisioned', 'user', $2::text, $3::jsonb)",
        [id, id, JSON.stringify({ via: "provisionar-producao", ambiente: args.ambiente, papelDoApp: "senha definida" })],
      );
      resumoAdmin = ` Administrador criado: ${mascarar(admin.email)} (id ${id}).`;
    }
    await client.query("COMMIT");
    console.log(`Provisionado em ${alvo.host}:${alvo.porta}/${alvo.banco} (${args.ambiente}). Senha do papel nexo_app definida.${resumoAdmin}`);
    console.log("Proximo passo: atualize DATABASE_URL do app com a nova senha do papel e reinicie o servico. Nenhuma senha foi impressa.");
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (erro instanceof Recusa) throw erro;
    // Mensagem do driver pode citar valores: so o codigo SQLSTATE e uma dica fixa.
    const codigo = typeof erro?.code === "string" ? erro.code : "desconhecido";
    const dica = codigo === "42501" ? " O dono precisa ignorar RLS (superusuario ou BYPASSRLS) para gravar a auditoria." : "";
    throw new Recusa(`Falha ao provisionar (SQLSTATE ${codigo}); nada foi gravado.${dica}`, 1);
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().then(
    () => process.exit(0),
    (erro) => {
      console.error(erro instanceof Recusa ? erro.message : "Erro inesperado no provisionamento (nada foi gravado).");
      process.exit(erro instanceof Recusa ? erro.codigo : 1);
    },
  );
}
