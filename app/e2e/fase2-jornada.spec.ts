import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { addMemberRow, createClientRow, tag } from "./helpers/db";
import { apiCall, chooseFile, apiOk, htmlAsPng, loginAdmin, loginAs, makePerson, mp4, PASSWORD, pdf, png, seedRich, setMemberPermissions, today, type Person, type Rich } from "./helpers/fase2";

// Jornada completa da fase 2 pela interface real (Chromium isolado, app compilado, nexo_test): o admin cria plano,
// assina, abre ciclo, cria conteudo e envia para aprovacao; o cliente A aprova uma versao e pede revisao de outra;
// o admin edita material aprovado e a aprovacao e invalidada; roteiro e gravacao; upload valido e malicioso;
// o cliente A tenta alcancar o cliente B por URL, API e arquivo; staff sem permissao.

const suffix = tag();
const t = today();
const planName = `Essencial (exemplo) ${suffix}`;
const clientName = `Cliente A Fase2 ${suffix}`;
const titleOk = `Arte aprovada ${suffix}`;
const titleRev = `Reel com revisão ${suffix}`;
const titleStale = `Carrossel versão nova ${suffix}`;
const scriptTitle = `Roteiro institucional ${suffix}`;

const st: {
  clientId?: string;
  owner?: Person;
  collab?: Person;
  staffRestricted?: Person;
  staffFree?: Person;
  idOk?: string;
  idRev?: string;
  idStale?: string;
  scriptId?: string;
  b?: Rich;
} = {};
const open: BrowserContext[] = [];
let admin: Page;
let owner: Page;

async function login(browser: Browser, email: string, who: "admin" | "other") {
  const r = who === "admin" ? await loginAdmin(browser) : await loginAs(browser, email, PASSWORD);
  open.push(r.context);
  return r.page;
}

async function confirmDialog(page: Page, name: string | RegExp, button: string | RegExp) {
  const d = page.getByRole("alertdialog", { name });
  await expect(d).toBeVisible();
  await d.getByRole("button", { name: button }).click();
}

async function createContentUi(title: string): Promise<string> {
  await admin.goto(`/admin/contents?client=${st.clientId}`);
  await admin.getByRole("button", { name: "Nova peça" }).first().click();
  const dialog = admin.getByRole("dialog", { name: "Nova peça" });
  await dialog.getByLabel("Título").fill(title);
  await dialog.getByLabel("Data prevista").fill(t.dayIso(15));
  await dialog.getByRole("button", { name: "Criar peça" }).click();
  await expect(admin.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return admin.url().split("/admin/contents/")[1].split("?")[0];
}

async function writeAndSend(title: string, caption: string, withFile: boolean) {
  await admin.getByRole("button", { name: "Iniciar produção" }).click();
  await expect(admin.getByText("Em produção").first()).toBeVisible();
  await admin.getByLabel("Legenda").fill(caption);
  await admin.getByLabel("Chamada para ação (CTA)").fill("Peça pelo WhatsApp");
  await admin.getByLabel("Hashtags").fill("#padaria #pãoquente");
  await admin.getByLabel("Briefing (interno, nunca aparece para o cliente)").fill("BRIEFING-INTERNO-E2E");
  await admin.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(admin.getByText("Rascunho salvo.")).toBeVisible();
  if (withFile) {
    await chooseFile(admin, "Arquivo da versão", { name: "previa.png", mimeType: "image/png", buffer: png() });
    await admin.getByRole("button", { name: "Enviar e anexar à versão" }).click();
    await expect(admin.getByText("previa.png").first()).toBeVisible();
  }
  await admin.getByRole("button", { name: "Compartilhar com o cliente" }).click();
  await confirmDialog(admin, "Compartilhar esta peça com o cliente?", "Compartilhar");
  await expect(admin.getByText("Peça compartilhada com o cliente.")).toBeVisible();
  await admin.getByRole("button", { name: "Enviar para aprovação" }).click();
  await confirmDialog(admin, "Enviar esta versão para aprovação?", "Enviar para aprovação");
  await expect(admin.getByText("Aguardando aprovação").first()).toBeVisible();
  void title;
}

test.describe.serial("fase 2: jornada completa", () => {
  test.beforeAll(async ({ browser }) => {
    st.clientId = await createClientRow(clientName);
    st.owner = await makePerson(`Dona do Cliente A ${suffix}`);
    st.collab = await makePerson(`Colaborador A ${suffix}`);
    st.staffRestricted = await makePerson(`Equipe Restrita ${suffix}`, "STAFF");
    st.staffFree = await makePerson(`Equipe Livre ${suffix}`, "STAFF");
    await addMemberRow(st.clientId, st.owner.id, "CLIENT_OWNER");
    await addMemberRow(st.clientId, st.collab.id, "CLIENT_COLLABORATOR");
    await addMemberRow(st.clientId, st.staffRestricted.id, "STAFF");
    await setMemberPermissions(st.clientId, st.staffRestricted.id, ["-content:write"]);
    st.b = await seedRich(browser, "B");
    admin = await login(browser, "", "admin");
    owner = await login(browser, st.owner.email, "other");
  });
  test.afterAll(async () => {
    for (const c of open) await c.close().catch(() => undefined);
  });

  test("P1: admin cria o plano (com erro inline), assina o cliente e abre o ciclo", async () => {
    await admin.goto("/admin/plans");
    await expect(admin.getByRole("heading", { level: 1, name: "Planos" })).toBeVisible();
    await admin.getByRole("button", { name: "Novo plano" }).first().click();
    const dialog = admin.getByRole("dialog", { name: "Novo plano" });
    // Erro inline por campo, em pt-BR, sem chamar a API.
    await dialog.getByRole("button", { name: "Criar plano" }).click();
    await expect(dialog.getByText("Informe o nome.")).toBeVisible();
    await expect(dialog.getByText("Informe o valor mensal.")).toBeVisible();
    await dialog.getByLabel("Código do plano").fill(`essencial-${suffix}`);
    await dialog.getByLabel("Nome do plano").fill(planName);
    await dialog.getByLabel("Valor mensal (R$)").fill("abc");
    await dialog.getByLabel("Cota de publicações por mês").fill("12");
    await dialog.getByLabel("Revisões por peça").fill("2");
    await dialog.getByLabel("Prazo de aprovação (dias úteis)").fill("3");
    await dialog.getByLabel("Escopo (o que está incluído)").fill("12 publicações por mês e calendário editorial.");
    await dialog.getByRole("button", { name: "Criar plano" }).click();
    await expect(dialog.getByText("Valor inválido. Exemplo: 1.200,00")).toBeVisible();
    await dialog.getByLabel("Valor mensal (R$)").fill("1.200,00");
    await dialog.getByRole("button", { name: "Criar plano" }).click();
    await expect(admin.getByText(`Plano "${planName}" criado.`)).toBeVisible();
    await expect(admin.getByRole("cell", { name: planName }).first()).toBeVisible();
    await expect(admin.getByText(/R\$\s1\.200,00/).first()).toBeVisible();

    await admin.goto(`/admin/subscriptions?client=${st.clientId}`);
    await expect(admin.getByText("Este cliente ainda não tem assinatura")).toBeVisible(); // vazio
    await admin.getByRole("button", { name: "Nova assinatura" }).first().click();
    const sub = admin.getByRole("dialog", { name: "Nova assinatura" });
    const value = await sub.locator("#sub-plan option", { hasText: planName }).getAttribute("value");
    await sub.getByLabel("Plano").selectOption(value!);
    await sub.getByLabel("Início da vigência").fill(t.first);
    await sub.getByLabel("Dia de cobrança (1 a 28)").fill("10");
    await sub.getByRole("button", { name: "Criar assinatura" }).click();
    await expect(admin.getByText("Assinatura criada.")).toBeVisible();
    await expect(admin.getByRole("cell", { name: planName }).first()).toBeVisible();

    await admin.getByRole("button", { name: "Abrir ciclo" }).first().click();
    const cyc = admin.getByRole("dialog", { name: "Abrir ciclo do mês" });
    await cyc.getByRole("button", { name: "Abrir ciclo" }).click();
    await expect(admin.getByText("Ciclo aberto.")).toBeVisible();
    await expect(admin.getByTestId("progress-summary")).toContainText("0 de 12 publicadas (0%)");
  });

  test("P2: admin cria 3 peças, escreve o material, anexa a prévia, compartilha e envia para aprovação", async () => {
    // Vazio antes de criar.
    await admin.goto(`/admin/contents?client=${st.clientId}`);
    await expect(admin.getByText("Nenhuma peça planejada")).toBeVisible();

    st.idOk = await createContentUi(titleOk);
    await writeAndSend(titleOk, "Hoje tem pão fresquinho às 7h. Venha provar!", true);
    st.idRev = await createContentUi(titleRev);
    await writeAndSend(titleRev, "Reel com a receita do bolo de fubá.", false);
    st.idStale = await createContentUi(titleStale);
    await writeAndSend(titleStale, "Carrossel com 5 dicas de armazenamento do pão.", false);

    // Transicoes: so as permitidas aparecem (aguardando aprovacao: nada de "Iniciar producao" nem "Publicar").
    await expect(admin.getByRole("button", { name: "Iniciar produção" })).toHaveCount(0);
    await expect(admin.getByRole("button", { name: "Registrar publicação" })).toHaveCount(0);
    await expect(admin.getByRole("button", { name: "Cancelar peça" })).toBeVisible();

    // Lista com filtro e busca no servidor.
    await admin.goto(`/admin/contents?client=${st.clientId}&status=AGUARDANDO_APROVACAO&q=${encodeURIComponent(suffix)}`);
    await expect(admin.getByRole("link", { name: titleOk })).toBeVisible();
    await admin.goto(`/admin/contents?client=${st.clientId}&status=PUBLICADO&q=${encodeURIComponent(suffix)}`);
    await expect(admin.getByText("Nenhuma peça encontrada")).toBeVisible();

    // Calendario: a peca aparece no dia certo; reagendar fora do mes e recusado com motivo.
    await admin.goto(`/admin/calendar?client=${st.clientId}&view=list&year=${t.year}&month=${t.month}`);
    await expect(admin.getByRole("link", { name: titleOk })).toBeVisible();
    const res = await apiCall(admin, "PUT", `/api/admin/clients/${st.clientId}/contents/${st.idOk}/schedule`, { plannedOn: `${t.year + 1}-01-10` });
    expect(res.status).toBe(422);
  });

  test("P3: cliente A aprova uma versão e pede revisão de outra (comentário obrigatório)", async () => {
    await owner.goto("/portal/approvals");
    await expect(owner.getByRole("heading", { level: 1, name: "Aprovações" })).toBeVisible();
    await expect(owner.getByText(titleOk)).toBeVisible();
    await expect(owner.getByText(titleRev)).toBeVisible();
    await owner.getByRole("link", { name: `Revisar e decidir ${titleOk}` }).click();
    await expect(owner.getByRole("heading", { level: 1, name: titleOk })).toBeVisible();
    // O cliente ve legenda, CTA, hashtags e a previa; nunca briefing nem notas internas.
    await expect(owner.getByText("Hoje tem pão fresquinho às 7h. Venha provar!")).toBeVisible();
    await expect(owner.getByText("previa.png")).toBeVisible();
    expect(await owner.content()).not.toContain("BRIEFING-INTERNO-E2E");
    await owner.getByRole("button", { name: "Aprovar versão 1" }).click();
    const d = owner.getByRole("dialog", { name: "Aprovar a versão 1" });
    await d.getByLabel("Comentário (opcional)").fill("Ficou ótimo!");
    await d.getByRole("button", { name: "Confirmar aprovação" }).click();
    await expect(owner.getByText("Versão aprovada.")).toBeVisible();
    await expect(owner.getByText("Aprovado por você").first()).toBeVisible();
    await expect(owner.getByRole("button", { name: /Aprovar versão/ })).toHaveCount(0);

    await owner.goto(`/portal/contents/${st.idRev}`);
    await owner.getByRole("button", { name: "Pedir revisão" }).click();
    const r = owner.getByRole("dialog", { name: "Pedir revisão da versão 1" });
    await r.getByRole("button", { name: "Enviar pedido de revisão" }).click();
    await expect(r.getByText("Escreva o comentário.")).toBeVisible(); // erro inline: comentario obrigatorio
    await r.getByLabel("O que precisa mudar").fill("Pode deixar o preço em destaque?");
    await r.getByRole("button", { name: "Enviar pedido de revisão" }).click();
    await expect(owner.getByText("Pedido de revisão enviado.")).toBeVisible();
    await expect(owner.getByText("Em ajuste pela agência").first()).toBeVisible();

    // O admin ve as duas decisoes, com autor e versao.
    await admin.goto(`/admin/contents/${st.idOk}?client=${st.clientId}`);
    await expect(admin.getByRole("list", { name: "Decisões do cliente" })).toContainText("Aprovado");
    await expect(admin.getByRole("list", { name: "Decisões do cliente" })).toContainText(st.owner!.name);
    // Progresso do mes: peca aprovada conta como "aprovada", ainda nao como publicada.
    await expect(admin.getByTestId("progress-summary")).toContainText("0 de 12 publicadas");
  });

  test("P3: versão desatualizada bloqueia a aprovação; colaborador sem permissão não vê o botão", async ({ browser }) => {
    // Cliente abre a versao 1 (aguardando) e, enquanto isso, a agencia envia a versao 2.
    await owner.goto(`/portal/contents/${st.idStale}`);
    await expect(owner.getByRole("button", { name: "Aprovar versão 1" })).toBeVisible();
    await admin.goto(`/admin/contents/${st.idStale}?client=${st.clientId}`);
    await admin.getByLabel("Legenda").fill("Carrossel com 6 dicas (versão nova).");
    await admin.getByRole("button", { name: "Salvar como nova versão" }).click();
    await expect(admin.getByText("Nova versão enviada ao cliente.")).toBeVisible();

    await owner.getByRole("button", { name: "Aprovar versão 1" }).click();
    await owner.getByRole("dialog", { name: "Aprovar a versão 1" }).getByRole("button", { name: "Confirmar aprovação" }).click();
    await expect(owner.getByTestId("decision-stale")).toContainText("Versão desatualizada");
    await expect(owner.getByRole("button", { name: /Aprovar versão/ })).toHaveCount(0);
    await owner.getByRole("button", { name: "Carregar a versão atual" }).click();
    await expect(owner.getByRole("button", { name: "Aprovar versão 2" })).toBeVisible();
    // Abrir a versao antiga mostra o aviso e nenhum botao de decisao.
    await owner.goto(`/portal/contents/${st.idStale}`);
    const v1 = await owner.getByRole("link", { name: "Ver esta versão" }).first().getAttribute("href");
    await owner.goto(v1!);
    await expect(owner.getByTestId("outdated-version")).toContainText("Só a versão 2 pode ser aprovada");
    await expect(owner.getByRole("button", { name: /Aprovar versão/ })).toHaveCount(0);

    // Colaborador sem content:approve: ve a peca, o botao nao existe.
    const collab = await login(browser, st.collab!.email, "other");
    await collab.goto("/portal/approvals");
    await expect(collab.getByTestId("no-approve-note")).toBeVisible();
    await collab.goto(`/portal/contents/${st.idStale}`);
    await expect(collab.getByRole("heading", { level: 1, name: titleStale })).toBeVisible();
    await expect(collab.getByRole("button", { name: /Aprovar versão|Pedir revisão/ })).toHaveCount(0);
    // E o servidor recusa mesmo se alguem forcar a chamada.
    const current = await apiOk(admin, "GET", `/api/admin/clients/${st.clientId}/contents/${st.idStale}`);
    const versionId = (current.content as { currentVersionId: string }).currentVersionId;
    const forced = await apiCall(collab, "POST", `/api/portal/contents/${st.idStale}/versions/${versionId}/decision`, { decision: "APROVADO" });
    expect(forced.status).toBe(403);
  });

  test("P3: admin edita material aprovado, a aprovação é invalidada e a peça volta para a fila", async () => {
    await admin.goto(`/admin/contents/${st.idOk}?client=${st.clientId}`);
    await expect(admin.getByText("Aprovado").first()).toBeVisible();
    await expect(admin.getByText("Esta peça já foi aprovada.")).toBeVisible();
    await admin.getByLabel("Legenda").fill("Hoje tem pão fresquinho às 7h e às 16h. Venha provar!");
    await admin.getByRole("button", { name: "Salvar como nova versão (invalida a aprovação)" }).click();
    await expect(admin.getByText(/aprovação anterior foi invalidada/)).toBeVisible();
    await expect(admin.getByText("Aguardando aprovação").first()).toBeVisible();
    await expect(admin.getByRole("list", { name: "Decisões do cliente" })).toContainText("Invalidada");
    await expect(admin.getByRole("list", { name: "Versões" })).toContainText("Versão 2");
    // O cliente ve a peca de novo na fila, na versao 2.
    await owner.goto("/portal/approvals");
    await expect(owner.getByText(titleOk)).toBeVisible();
    await owner.goto(`/portal/contents/${st.idOk}`);
    await expect(owner.getByRole("button", { name: "Aprovar versão 2" })).toBeVisible();
  });

  test("P5: roteiro com cenas e PDF, gravação por upload, confirmação e regravação", async () => {
    await admin.goto(`/admin/scripts?client=${st.clientId}`);
    await expect(admin.getByText("Nenhum roteiro criado")).toBeVisible();
    await admin.getByRole("button", { name: "Novo roteiro" }).first().click();
    const d = admin.getByRole("dialog", { name: "Novo roteiro" });
    await d.getByLabel("Título").fill(scriptTitle);
    await d.getByLabel("Prazo da gravação").fill(t.dayIso(28));
    await d.getByLabel("Fala da cena 1").fill("Olá! Somos a Padaria Pão Quente.");
    await d.getByLabel("Ação da cena 1", { exact: true }).fill("Plano médio sorrindo");
    await d.getByRole("button", { name: "Adicionar cena" }).click();
    await d.getByLabel("Fala da cena 2").fill("O pão sai quentinho toda manhã.");
    await d.getByRole("button", { name: "Criar roteiro" }).click();
    await expect(admin.getByRole("heading", { level: 1, name: scriptTitle })).toBeVisible();
    st.scriptId = admin.url().split("/admin/scripts/")[1].split("?")[0];
    await expect(admin.getByText("Cena 2").first()).toBeVisible();

    // Rascunho: o cliente nao ve (lista vazia).
    await owner.goto("/portal/scripts");
    await expect(owner.getByText(scriptTitle)).toHaveCount(0);

    await chooseFile(admin, "PDF do roteiro", { name: "roteiro.pdf", mimeType: "application/pdf", buffer: pdf() });
    await admin.getByRole("button", { name: "Enviar e anexar o PDF" }).click();
    await expect(admin.getByText("roteiro.pdf").first()).toBeVisible();
    await admin.getByRole("button", { name: "Enviar ao cliente" }).click();
    await confirmDialog(admin, "Enviar o roteiro ao cliente?", "Enviar ao cliente");
    await expect(admin.getByText("Roteiro enviado ao cliente.")).toBeVisible();
    await admin.getByRole("button", { name: "Liberar para gravação" }).click();
    await expect(admin.getByText("Status do roteiro atualizado.")).toBeVisible();

    // Cliente: le as instrucoes, baixa o PDF (so como anexo) e envia a gravacao.
    await owner.goto("/portal/scripts");
    await owner.getByRole("link", { name: scriptTitle }).click();
    await expect(owner.getByText("Plano médio sorrindo")).toBeVisible();
    let name = "";
    // Repete o toque no botao ate a tela hidratar (antes disso o handler nao existe).
    await expect(async () => {
      const [download] = await Promise.all([owner.waitForEvent("download", { timeout: 4000 }), owner.getByRole("button", { name: "Baixar roteiro.pdf" }).click()]);
      name = download.suggestedFilename();
    }).toPass({ timeout: 30_000 });
    expect(name).toBe("roteiro.pdf");

    const rec = owner.getByTestId("recording-form");
    // Arquivo perigoso: recusado ANTES de subir (validacao previa) e o servidor decide de novo (abaixo).
    await chooseFile(owner, "Arquivo de vídeo da gravação", { name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ\x90\x00") });
    await expect(rec.getByText(/não é permitido por segurança/)).toBeVisible();
    // Passa pelo nome, mas o conteudo e HTML: o SERVIDOR recusa pelo conteudo real.
    await chooseFile(owner, "Arquivo de vídeo da gravação", { name: "video.mp4", mimeType: "video/mp4", buffer: htmlAsPng() });
    await rec.getByRole("button", { name: "Enviar vídeo" }).click();
    await expect(rec.getByText(/O servidor recusou/)).toBeVisible();
    // Gravacao valida.
    await chooseFile(owner, "Arquivo de vídeo da gravação", { name: "gravacao.mp4", mimeType: "video/mp4", buffer: mp4() });
    await rec.getByRole("button", { name: "Enviar vídeo" }).click();
    await expect(rec.getByText(/Arquivo pronto/)).toBeVisible();
    await rec.getByRole("button", { name: "Marcar gravação como enviada" }).click();
    await expect(rec.getByText("Confirme que você tem autorização das pessoas que aparecem na gravação.")).toBeVisible();
    await rec.getByLabel("Tenho autorização das pessoas que aparecem na gravação.").check();
    await rec.getByRole("button", { name: "Marcar gravação como enviada" }).click();
    await expect(owner.getByText("Gravação marcada como enviada. A agência vai conferir.")).toBeVisible();
    await expect(owner.getByText("Enviada, aguardando conferência")).toBeVisible();

    // Admin confirma o recebimento.
    await admin.goto(`/admin/scripts/${st.scriptId}?client=${st.clientId}`);
    await expect(admin.getByText("gravacao.mp4").first()).toBeVisible();
    await admin.getByRole("button", { name: "Confirmar recebimento" }).click();
    await confirmDialog(admin, "Confirmar o recebimento da gravação?", "Confirmar recebimento");
    await expect(admin.getByText("Gravação confirmada.")).toBeVisible();
    await expect(admin.getByText("Gravação recebida").first()).toBeVisible();

    // Pede regravacao com justificativa (minimo de 10 caracteres).
    await admin.getByRole("button", { name: "Pedir regravação" }).click();
    const rr = admin.getByRole("dialog", { name: "Pedir regravação" });
    await rr.getByLabel("Justificativa").fill("curto");
    await rr.getByRole("button", { name: "Pedir regravação" }).click();
    await expect(rr.getByText("Explique com pelo menos 10 caracteres.")).toBeVisible();
    await rr.getByLabel("Justificativa").fill("O áudio ficou baixo, por favor regrave num local silencioso.");
    await rr.getByRole("button", { name: "Pedir regravação" }).click();
    await expect(admin.getByText("Regravação solicitada.")).toBeVisible();

    await owner.goto(`/portal/scripts/${st.scriptId}`);
    await expect(owner.getByTestId("rerecording-notice")).toContainText("O áudio ficou baixo");
    await expect(owner.getByText("Regravação solicitada").first()).toBeVisible();
    await expect(owner.getByTestId("recording-form")).toBeVisible(); // pode regravar; o historico continua
  });

  test("upload: admin tenta anexar executável, HTML com nome de imagem e arquivo grande; recusado e nada anexado", async () => {
    await admin.goto(`/admin/contents/${st.idRev}?client=${st.clientId}`);
    // Em revisao, salvar o material cria o rascunho da versao 2; so entao da para anexar arquivos.
    await admin.getByLabel("Legenda").fill("Reel com a receita do bolo de fubá (versão 2).");
    await admin.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(admin.getByText("Rascunho salvo.")).toBeVisible();
    await chooseFile(admin, "Arquivo da versão", { name: "foto.jpg.exe", mimeType: "image/jpeg", buffer: png() });
    await expect(admin.getByText(/não é permitido por segurança/)).toBeVisible();
    await chooseFile(admin, "Arquivo da versão", { name: "grande.png", mimeType: "image/png", buffer: png(1024 * 1024 + 10) });
    await expect(admin.getByText(/mais que o limite de 1 MB/)).toBeVisible();
    await chooseFile(admin, "Arquivo da versão", { name: "logo.png", mimeType: "image/png", buffer: htmlAsPng() });
    await admin.getByRole("button", { name: "Enviar e anexar à versão" }).click();
    await expect(admin.getByText(/O servidor recusou/)).toBeVisible();
    await expect(admin.getByRole("list", { name: "Arquivos" })).toHaveCount(0); // nada anexado: so existe a lista quando ha arquivo
  });

  test("isolamento: cliente A tenta ids, URL, API e arquivo do cliente B e é bloqueado", async () => {
    const b = st.b!;
    const adminB = `/api/admin/clients/${b.clientId}`;
    // Pagina do portal: id de outro cliente = "nao encontrado" (mesma tela de id inexistente).
    await owner.goto(`/portal/contents/${b.contents.awaiting}`);
    await expect(owner.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
    await owner.goto(`/portal/scripts/${b.scriptId}`);
    await expect(owner.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
    // ?client= no portal nao escolhe cliente: continua o do A.
    await owner.goto(`/portal/plan?client=${b.clientId}`);
    await expect(owner.getByText(planName)).toBeVisible();
    await expect(owner.getByText(b.planName)).toHaveCount(0);
    // Area de agencia: acesso negado para pessoa de cliente, mesmo com o id do B.
    await owner.goto(`/admin/contents?client=${b.clientId}`);
    await expect(owner.getByRole("heading", { level: 1, name: "Acesso negado" })).toBeVisible();
    // API.
    for (const path of [`/api/portal/contents/${b.contents.awaiting}`, `/api/portal/scripts/${b.scriptId}`, `/api/portal/assets/${b.pdfAssetId}`]) {
      expect((await apiCall(owner, "GET", path)).status, path).toBe(404);
    }
    expect((await apiCall(owner, "POST", `/api/portal/assets/${b.pdfAssetId}/download`, {})).status).toBe(404);
    expect((await apiCall(owner, "POST", `/api/portal/contents/${b.contents.awaiting}/versions/${crypto.randomUUID()}/decision`, { decision: "APROVADO" })).status).toBe(404);
    expect([401, 403, 404]).toContain((await apiCall(owner, "GET", `${adminB}/contents`)).status);
    // Link assinado do B (emitido para o admin) nao serve para o A.
    const link = (await apiOk(admin, "POST", `${adminB}/assets/${b.pdfAssetId}/download`, {})).path as string;
    const stolen = await owner.request.fetch(`http://127.0.0.1:3101${link}`);
    expect([403, 404]).toContain(stolen.status());
    // Baixar o arquivo do proprio cliente: sempre como anexo, tipo validado, nunca inline.
    const mine = await apiOk(owner, "GET", `/api/portal/scripts/${st.scriptId}`);
    const asset = (mine.assets as { asset: { id: string } }[])[0].asset.id;
    const own = (await apiOk(owner, "POST", `/api/portal/assets/${asset}/download`, {})).path as string;
    const ok = await owner.request.fetch(`http://127.0.0.1:3101${own}`);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-disposition"]).toMatch(/^attachment/);
    expect(ok.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("staff sem permissão de escrita só lê; staff não atribuído não encontra o cliente", async ({ browser }) => {
    const staff = await login(browser, st.staffRestricted!.email, "other");
    await staff.goto("/admin/plans");
    await expect(staff.getByRole("heading", { level: 1, name: "Planos" })).toBeVisible();
    await expect(staff.getByRole("button", { name: "Novo plano" })).toHaveCount(0);
    await staff.goto(`/admin/subscriptions?client=${st.clientId}`);
    await expect(staff.getByRole("button", { name: "Nova assinatura" })).toHaveCount(0);
    await staff.goto(`/admin/contents?client=${st.clientId}`);
    await expect(staff.getByRole("link", { name: titleOk })).toBeVisible();
    await expect(staff.getByRole("button", { name: "Nova peça" })).toHaveCount(0);
    await staff.goto(`/admin/contents/${st.idStale}?client=${st.clientId}`);
    await expect(staff.getByRole("heading", { level: 1, name: titleStale })).toBeVisible();
    for (const name of ["Salvar rascunho", "Salvar como nova versão", "Enviar para aprovação", "Cancelar peça", "Compartilhar com o cliente"]) {
      await expect(staff.getByRole("button", { name })).toHaveCount(0);
    }
    const denied = await apiCall(staff, "POST", `/api/admin/clients/${st.clientId}/contents/${st.idStale}/status`, { to: "CANCELADO", cancelReason: "tentativa sem permissão" });
    expect(denied.status).toBe(403);

    // Nao atribuido a nenhum cliente: nao ve o A (mesma tela de "nao encontrado").
    const free = await login(browser, st.staffFree!.email, "other");
    await free.goto(`/admin/contents?client=${st.clientId}`);
    await expect(free.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
    expect((await apiCall(free, "GET", `/api/admin/clients/${st.clientId}/contents`)).status).toBe(404);
  });

  test("P1 no portal: plano, vigência e progresso do mês; admin publica e o progresso sobe", async () => {
    // Admin publica a peca aprovada na versao 2? Precisa aprovar de novo: cliente aprova a versao 2 e a agencia publica.
    await owner.goto(`/portal/contents/${st.idOk}`);
    await owner.getByRole("button", { name: "Aprovar versão 2" }).click();
    await owner.getByRole("dialog", { name: "Aprovar a versão 2" }).getByRole("button", { name: "Confirmar aprovação" }).click();
    await expect(owner.getByText("Versão aprovada.")).toBeVisible();

    await admin.goto(`/admin/contents/${st.idOk}?client=${st.clientId}`);
    await admin.getByRole("button", { name: "Registrar publicação" }).click();
    const d = admin.getByRole("dialog", { name: "Registrar publicação" });
    await d.getByLabel("Data da publicação").fill(t.iso);
    await d.getByLabel("URL da publicação").fill("http://insegura.example/post");
    await d.getByRole("button", { name: "Registrar publicação" }).click();
    await expect(d.getByText(/URL HTTPS/)).toBeVisible(); // http:// recusado pelo servidor
    await d.getByLabel("URL da publicação").fill("https://www.instagram.com/p/exemplo-ficticio-1/");
    await d.getByRole("button", { name: "Registrar publicação" }).click();
    await expect(admin.getByText("Publicação registrada. Nada foi publicado automaticamente.")).toBeVisible();
    await expect(admin.getByTestId("progress-summary")).toContainText("1 de 12 publicadas (8%)");

    await owner.goto("/portal/plan");
    await expect(owner.getByRole("heading", { name: planName })).toBeVisible();
    await expect(owner.getByTestId("progress-summary")).toContainText("1 de 12 publicadas (8%)");
    await expect(owner.getByTestId("plan-consumption")).toContainText("Entregas consumidas: 1. Restantes: 11.");
    const link = owner.locator("a[href^='https://www.instagram.com']");
    await owner.goto(`/portal/contents/${st.idOk}`);
    await expect(link.first()).toHaveAttribute("rel", /noopener noreferrer nofollow/);
    await expect(link.first()).toHaveAttribute("target", "_blank");
  });
});
