// Confere que seed, testes, fixtures e codigo nao carregam dados reais do primeiro cliente (spec 0002, criterios).
// Falha se achar os termos proibidos. Os termos ficam montados por partes para este arquivo nao se auto-acusar.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const termos = [["cli", "que"], ["cli", "quedf"], ["abre", ".bio"]].map((p) => p.join("").toLowerCase());
const pastas = ["prisma", "src", "tests", "e2e", "scripts"];
const ignorar = new Set(["node_modules", ".next", "generated", "test-results", ".playwright-browsers"]);
const eu = fileURLToPath(import.meta.url);

const achados = [];
function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    if (ignorar.has(nome)) continue;
    const caminho = path.join(dir, nome);
    const st = statSync(caminho);
    if (st.isDirectory()) varrer(caminho);
    else if (caminho !== eu && /\.(ts|tsx|mjs|js|json|sql|md|css)$/.test(nome)) {
      const texto = readFileSync(caminho, "utf8").toLowerCase();
      for (const t of termos) if (texto.includes(t)) achados.push(`${path.relative(raiz, caminho)}`);
    }
  }
}
for (const p of pastas) varrer(path.join(raiz, p));
if (achados.length) {
  console.error(`Dados reais encontrados em: ${[...new Set(achados)].join(", ")}`);
  process.exit(1);
}
console.log("Nenhum dado real do primeiro cliente em prisma, src, tests, e2e e scripts.");
