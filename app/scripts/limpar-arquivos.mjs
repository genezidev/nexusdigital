// Comando de limpeza de arquivos pendentes, orfaos e temporarios (idempotente). Uso:
//   node scripts/limpar-arquivos.mjs --ambiente dev|test|producao [--horas 24] [--retencao-dias 30]
//        [--max-orfaos 20] [--max-proporcao 0.1] [--vincular-instalacao] [--restaurar <chave>]
//
// - `--ambiente` e OBRIGATORIO e e CONFERIDO contra o banco de verdade (mesma regra de scripts/provisionar-producao.mjs):
//   dev = 127.0.0.1/localhost com nexo_dev (DATABASE_URL); test = 127.0.0.1/localhost com nexo_test (TEST_DATABASE_URL);
//   producao = banco que nao seja nexo_dev/nexo_test e host em PROVISIONAR_HOST_PERMITIDO (DATABASE_URL). Divergencia = recusa.
// - `--horas` tem minimo de 1 (0 mataria envios em andamento).
// - Orfao (objeto sem registro) NAO e apagado: vai para `.trash/` e so sai apos --retencao-dias (padrao 30).
// - A limpeza aborta (codigo 3, nada movido) se o identificador da instalacao do banco nao combinar com o `.install-id`
//   da pasta, se houver orfaos demais (--max-orfaos, --max-proporcao) ou se o banco nao tiver nenhum arquivo DISPONIVEL.
// - `--vincular-instalacao`: pedido EXPLICITO para criar o identificador que falta (nunca sobrescreve um que existe).
// - `--restaurar <chave>`: devolve um objeto da lixeira (chave `clients/<cliente>/<uuid>`).
// Segredos nunca sao impressos.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { autorizarDestino, Recusa } from "./provisionar-producao.mjs";

const USO =
  "Uso: node scripts/limpar-arquivos.mjs --ambiente dev|test|producao [--horas 24] [--retencao-dias 30] [--max-orfaos 20] [--max-proporcao 0.1] [--vincular-instalacao] [--restaurar <chave>]";
const comValor = new Set(["--ambiente", "--horas", "--retencao-dias", "--max-orfaos", "--max-proporcao", "--restaurar"]);
const semValor = new Set(["--vincular-instalacao"]);

const opcoes = {};
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const nome = args[i];
  if (semValor.has(nome)) opcoes[nome] = true;
  else if (comValor.has(nome) && i + 1 < args.length && !args[i + 1].startsWith("--")) opcoes[nome] = args[++i];
  else {
    console.error(USO);
    process.exit(2);
  }
}

const ambiente = opcoes["--ambiente"];
if (!["dev", "test", "producao"].includes(ambiente ?? "")) {
  console.error(`Declare o ambiente. ${USO}`);
  process.exit(2);
}
const numero = (nome, minimo, maximo, inteiro) => {
  if (opcoes[nome] === undefined) return undefined;
  const n = Number(opcoes[nome]);
  if (!Number.isFinite(n) || n < minimo || n > maximo || (inteiro && !Number.isInteger(n))) {
    console.error(`${nome} precisa ser um numero${inteiro ? " inteiro" : ""} entre ${minimo} e ${maximo}.`);
    process.exit(2);
  }
  return n;
};
const horas = numero("--horas", 1, 24 * 365, false) ?? 24;
const retencao = numero("--retencao-dias", 1, 3650, true);
const maxOrfaos = numero("--max-orfaos", 0, 1_000_000, true);
const maxProporcao = numero("--max-proporcao", 0, 1, false);

const urlDoAmbiente = ambiente === "test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
if (!urlDoAmbiente) {
  console.error(ambiente === "test" ? "Defina TEST_DATABASE_URL em app/.env." : "Defina DATABASE_URL (papel do app) no ambiente.");
  process.exit(2);
}
try {
  autorizarDestino(ambiente, urlDoAmbiente, process.env.PROVISIONAR_HOST_PERMITIDO ?? "");
} catch (erro) {
  console.error(erro instanceof Recusa ? erro.message : "Recusado: destino do banco invalido.");
  process.exit(2);
}

const env = { ...process.env, DATABASE_URL: urlDoAmbiente, LIMPAR_HORAS: String(horas) };
if (retencao !== undefined) env.LIMPAR_RETENCAO_DIAS = String(retencao);
if (maxOrfaos !== undefined) env.LIMPAR_MAX_ORFAOS = String(maxOrfaos);
if (maxProporcao !== undefined) env.LIMPAR_MAX_PROPORCAO = String(maxProporcao);
if (opcoes["--vincular-instalacao"]) env.LIMPAR_VINCULAR = "1";
if (opcoes["--restaurar"]) env.LIMPAR_RESTAURAR = opcoes["--restaurar"];

const tsx = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const alvo = fileURLToPath(new URL("./limpar-arquivos.ts", import.meta.url));
const r = spawnSync(process.execPath, [tsx, alvo], { stdio: "inherit", env });
process.exit(r.status ?? 1);
