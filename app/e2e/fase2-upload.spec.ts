import { expect, test } from "@playwright/test";
import { chooseFile, loginAs, mp4, PASSWORD, seedRich, type Rich } from "./helpers/fase2";

// Upload pela interface: barra de progresso, cancelar e as mensagens em pt-BR para queda de conexao e erros do
// servidor (413, 415, 429, 503). Os erros sao simulados na REDE do navegador (o servidor real recusa de verdade
// nos testes HTTP); o que se prova aqui e como a tela os mostra, sem sucesso falso.

let rich: Rich;
test.beforeAll(async ({ browser }) => {
  rich = await seedRich(browser, "Upload");
});

test("upload: erros 503, 429, 413, 415 e queda de conexão aparecem em pt-BR e nada é salvo", async ({ browser }) => {
  const { page, context } = await loginAs(browser, rich.owner.email, PASSWORD);
  await page.goto(`/portal/scripts/${rich.scriptId}`);
  const rec = page.getByTestId("recording-form");
  const pick = () => chooseFile(page, "Arquivo de vídeo da gravação", { name: "outra.mp4", mimeType: "video/mp4", buffer: mp4() });
  const cases: [number | "abort", RegExp][] = [
    [503, /armazenamento está indisponível/],
    [429, /Muitos envios/],
    [413, /maior que o limite/],
    [415, /tipo de arquivo/],
    ["abort", /conexão caiu/],
  ];
  for (const [code, message] of cases) {
    await page.goto(`/portal/scripts/${rich.scriptId}`); // tela limpa a cada caso
    await page.route("**/api/files/upload/**", (route) =>
      code === "abort" ? route.abort("connectionreset") : route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify({ error: { code: "X", message: "x" } }) }),
    );
    await pick();
    await rec.getByRole("button", { name: "Enviar vídeo" }).click();
    await expect(rec.getByRole("alert").filter({ hasText: message }), String(code)).toBeVisible();
    await page.unroute("**/api/files/upload/**");
  }
  await expect(rec.getByText(/Arquivo pronto/)).toHaveCount(0);
  await context.close();
});

test("upload: a barra de progresso aparece e Cancelar envio interrompe sem salvar", async ({ browser }) => {
  const { page, context } = await loginAs(browser, rich.owner.email, PASSWORD);
  await page.goto(`/portal/scripts/${rich.scriptId}`);
  const rec = page.getByTestId("recording-form");
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/api/files/upload/**", async (route) => {
    await gate;
    await route.abort().catch(() => undefined);
  });
  await chooseFile(page, "Arquivo de vídeo da gravação", { name: "grande.mp4", mimeType: "video/mp4", buffer: mp4() });
  await rec.getByRole("button", { name: "Enviar vídeo" }).click();
  await expect(rec.getByRole("progressbar", { name: "Progresso do envio" })).toBeVisible();
  await rec.getByRole("button", { name: "Cancelar envio" }).click();
  await expect(page.getByText("Envio cancelado.")).toBeVisible();
  await expect(rec.getByRole("progressbar")).toHaveCount(0);
  await expect(rec.getByText(/Arquivo pronto/)).toHaveCount(0);
  release();
  await page.unroute("**/api/files/upload/**");
  await context.close();
});
