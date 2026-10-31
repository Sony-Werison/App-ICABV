import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const ref = "ynkfmuseiancpnyloraf",
  email = "pereirawerison@gmail.com",
  url = `https://${ref}.supabase.co`;
const keys = JSON.parse(
  execFileSync(
    "C:/Users/perei/apps/App Igreja/node_modules/supabase/bin/supabase.exe",
    ["projects", "api-keys", "--project-ref", ref, "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
);
const secret =
  keys.find((k) => k.name === "service_role")?.api_key ||
  keys.find((k) => k.type === "secret")?.api_key;
const publicKey =
  keys.find((k) => k.type === "publishable")?.api_key ||
  keys.find((k) => k.name === "anon")?.api_key;
assert.ok(secret && publicKey);
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const service = createClient(url, secret, options),
  actor = createClient(url, publicKey, options);
const link = await service.auth.admin.generateLink({
  type: "magiclink",
  email,
});
assert.ok(!link.error, "Geração da sessão isolada");
assert.equal(link.data.user.email, email);
assert.ok(link.data.user.email_confirmed_at);
const verified = await actor.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: "magiclink",
});
assert.ok(
  !verified.error && verified.data.session,
  "Sessão temporária da conta verificada",
);
const roles = await actor.rpc("my_roles");
assert.ok(!roles.error && roles.data.includes("admin"));
const profile = await actor
  .from("persons")
  .select("id,onboarded_at,full_name")
  .eq("auth_user_id", verified.data.user.id)
  .single();
assert.ok(!profile.error);

const tag = "[REVISÃO TEMPORÁRIA " + crypto.randomUUID().slice(0, 8) + "]";
const report = {
  operations: [],
  screens: [],
  apiErrors: [],
  pageErrors: [],
  cleanup: false,
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(
  ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
  { key: `sb-${ref}-auth-token`, session: verified.data.session },
);
const page = await context.newPage();
page.on("pageerror", (e) => report.pageErrors.push(e.message));
page.on("dialog", (d) => d.accept());
page.on("response", async (r) => {
  if (r.url().startsWith(url) && r.status() >= 400) {
    const data = await r.json().catch(() => ({}));
    report.apiErrors.push({
      path: new URL(r.url()).pathname,
      status: r.status(),
      message: data.message,
    });
  }
});
mkdirSync("test-results/modules", { recursive: true });
const editor = (title) =>
  page
    .locator("section.module-editor")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .first();
const nav = (module) =>
  page
    .getByRole("navigation", { name: "Áreas de gestão" })
    .getByRole("button", { name: module, exact: true })
    .click();
const tab = (label) =>
  page
    .getByRole("navigation", { name: /Áreas d[oa]/ })
    .last()
    .getByRole("button", { name: label, exact: true })
    .click();
async function save(form, table) {
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/rest/v1/" + table) && r.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Salvar", exact: true }).click();
  const r = await response;
  assert.ok(r.ok(), await r.text());
  await page.waitForTimeout(500);
}
async function find(table, column = "title") {
  const r = await service
    .from(table)
    .select("*")
    .like(column, tag + "%");
  assert.ok(!r.error);
  return r.data;
}
async function screenshot(name) {
  await page.waitForTimeout(300);
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("main p")].some((e) =>
        e.textContent?.trim().startsWith("Carregando"),
      ),
    undefined,
    { timeout: 20000 },
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  report.screens.push({ name, overflow });
  await page.screenshot({
    path: "test-results/modules/" + name + ".png",
    fullPage: true,
  });
}
let tempPerson;
try {
  const p = await actor.rpc("register_person", {
    display_name: tag + " Pessoa",
  });
  assert.ok(!p.error);
  tempPerson = p.data;
  const family = await actor.rpc("create_family", {
    family_name: tag + " Família pessoal",
  });
  assert.ok(!family.error, family.error?.message);
  const prayer = await actor.rpc("create_prayer", {
    content: tag + " Pedido privado",
    visibility: "private",
    is_anonymous: false,
  });
  assert.ok(!prayer.error, prayer.error?.message);
  report.operations.push("Conta real sem onboarding: família e oração privada");
  await page.goto("http://localhost:5173/gestao");
  await nav("Louvor");
  await page.getByRole("button", { name: "Nova música", exact: true }).click();
  let form = editor("Cadastrar música");
  await form.locator("[name=title]").fill(tag + " Canção");
  await form.locator("[name=artist]").fill("Revisão");
  await form.locator("[name=musical_key]").fill("C");
  await form.locator("[name=category]").selectOption("Louvor");
  await form.locator("[name=chords]").fill("C  G/B  Am\nLetra de revisão");
  await save(form, "worship_songs");
  const song = (await find("worship_songs"))[0];
  assert.ok(song);
  report.operations.push("UI: cadastrar música");
  await page
    .getByRole("button", { name: "Letra e cifra", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Tom +", exact: true }).click();
  await page.getByRole("button", { name: "Tom +", exact: true }).click();
  assert.ok(
    (await page.locator(".song-sheet pre").first().innerText()).includes(
      "D  A/C#  Bm",
    ),
  );
  report.operations.push("UI: transpor cifra e baixo invertido");
  await page
    .getByRole("button", { name: "Fechar música", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Editar músicas em lote", exact: true })
    .click();
  await page
    .getByLabel("Músicas selecionadas", { exact: true })
    .selectOption([song.id]);
  form = editor("Alterações para as músicas selecionadas");
  await form.locator("[name=artist]").fill("Revisão em lote");
  const bulkResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/rest/v1/worship_songs") &&
      r.request().method() === "PATCH",
  );
  await form.getByRole("button", { name: "Salvar", exact: true }).click();
  assert.ok((await bulkResponse).ok());
  report.operations.push("UI: editar músicas em lote com seleção explícita");
  await tab("Equipe");
  form = editor("Vincular pessoa à equipe");
  await form.locator("[name=person_id]").selectOption(tempPerson);
  await form.locator("[name=roles]").fill("Abertura, Multimídia");
  await save(form, "worship_members");
  report.operations.push("UI: vincular pessoa canônica à equipe");
  await tab("Escalas");
  await page
    .getByRole("button", { name: "Nova escala de culto", exact: true })
    .click();
  await page
    .getByLabel("Abertura", { exact: false })
    .selectOption([tempPerson]);
  await page
    .getByLabel("Adicionar música", { exact: true })
    .selectOption(song.id);
  await page
    .getByRole("button", { name: "Adicionar ao repertório", exact: true })
    .click();
  form = editor("Dados do culto");
  await form.locator("[name=title]").fill(tag + " Culto");
  await form.locator("[name=starts_at]").fill("25/10/2026 19:00");
  await save(form, "worship_services");
  const worshipService = (await find("worship_services"))[0];
  assert.ok(worshipService);
  report.operations.push("UI: salvar escala com equipe e repertório");
  await tab("Sala ao vivo");
  await page
    .getByLabel("Culto", { exact: true })
    .selectOption(worshipService.id);
  await page
    .getByLabel("Música na tela", { exact: true })
    .selectOption(song.id);
  await page.getByRole("heading", { name: song.title, exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Subir tom da sala", exact: true })
    .click();
  await page.waitForTimeout(2500);
  assert.ok(
    (await page.locator(".song-sheet pre").first().innerText()).includes("C#"),
  );
  report.operations.push("UI: sala ao vivo sincronizada");
  await tab("Ensaios");
  await page
    .getByLabel("Adicionar música", { exact: true })
    .selectOption(song.id);
  await page
    .getByRole("button", { name: "Adicionar ao repertório", exact: true })
    .click();
  form = editor("Salvar ensaio");
  await form.locator("[name=title]").fill(tag + " Ensaio");
  await save(form, "worship_rehearsals");
  report.operations.push("UI: salvar ensaio pessoal");
  await nav("Painel EBD");
  await tab("Turmas e pessoas");
  form = editor("Cadastrar turma");
  await form.locator("[name=name]").fill(tag + " Turma");
  await save(form, "ebd_classes");
  const schoolClass = (await find("ebd_classes", "name"))[0];
  assert.ok(schoolClass);
  report.operations.push("UI: cadastrar turma EBD");
  await tab("Módulos e atividades");
  form = editor("Novo módulo");
  await form.locator("[name=title]").fill(tag + " Módulo");
  await save(form, "ebd_modules");
  const lessonModule = (await find("ebd_modules"))[0];
  assert.ok(lessonModule);
  await page
    .getByRole("button", { name: "Nova atividade", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar pergunta", exact: true })
    .click();
  await page
    .getByLabel("Enunciado", { exact: true })
    .fill("Qual a segunda alternativa?");
  await page
    .getByLabel("Tipo de resposta", { exact: true })
    .selectOption("choice");
  await page
    .getByLabel("Alternativas (uma por linha)", { exact: true })
    .fill("Primeira\nSegunda");
  await page
    .getByLabel("Alternativa correta", { exact: true })
    .selectOption("1");
  form = editor("Conteúdo e publicação");
  await form.locator("[name=module_id]").selectOption(lessonModule.id);
  await form.locator("[name=title]").fill(tag + " Questionário");
  await form.locator("[name=kind]").selectOption("quiz");
  await form.locator("[name=published]").check();
  const rpcResponse = page.waitForResponse((r) =>
    r.url().endsWith("/rpc/save_ebd_activity"),
  );
  await form.getByRole("button", { name: "Salvar", exact: true }).click();
  assert.ok((await rpcResponse).ok());
  await page
    .getByRole("button", { name: "Nova atividade", exact: true })
    .waitFor();
  report.operations.push(
    "UI: criar módulo e questionário com gabarito privado",
  );
  await tab("Turmas e pessoas");
  form = editor("Vincular pessoa à turma");
  await form.locator("[name=person_id]").selectOption(profile.data.id);
  await form.locator("[name=module_id]").selectOption(lessonModule.id);
  await save(form, "ebd_class_members");
  report.operations.push("UI: vincular a própria conta à turma temporária");
  await tab("Atividades");
  await page
    .getByRole("button", { name: "Iniciar atividade", exact: true })
    .click();
  await page
    .getByText("Você já pode enviar suas respostas.", { exact: true })
    .waitFor();
  await page.getByLabel("Segunda", { exact: true }).check();
  const answerResponse = page.waitForResponse((r) =>
    r.url().endsWith("/rpc/submit_ebd_activity"),
  );
  await page
    .getByRole("button", { name: "Enviar atividade", exact: true })
    .click();
  assert.ok((await answerResponse).ok());
  await page
    .getByRole("heading", { name: "Atividade enviada", exact: true })
    .waitFor();
  report.operations.push(
    "UI: responder atividade e corrigir automaticamente no servidor",
  );
  await tab("Histórico");
  await page
    .getByText(/Nota 10/)
    .first()
    .waitFor();
  await tab("Correções");
  await page
    .getByLabel("Apenas atividades sem correção", { exact: true })
    .uncheck();
  form = editor("Avaliação do professor");
  await form.locator("[name=grade]").fill("9");
  await form.locator("[name=comment]").fill(tag + " Correção conferida");
  const gradeResponse = page.waitForResponse((r) =>
    r.url().endsWith("/rpc/grade_ebd_submission"),
  );
  await form.getByRole("button", { name: "Salvar", exact: true }).click();
  assert.ok((await gradeResponse).ok());
  report.operations.push("UI: revisar nota e comentário do professor");
  await tab("Diário e presença");
  form = page
    .locator("section.module-editor")
    .filter({ has: page.locator("[name=present]") })
    .first();
  await form.locator("[name=present]").check();
  await form.locator("[name=criterion_0]").check();
  await form.locator("[name=note]").fill(tag + " Diário");
  await save(form, "ebd_attendance");
  report.operations.push("UI: salvar diário e presença");
  await tab("Gravações");
  form = editor("Cadastrar gravação de aula");
  await form.locator("[name=title]").fill(tag + " Aula");
  await form
    .locator("[name=url]")
    .fill("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  await save(form, "ebd_recordings");
  report.operations.push("UI: cadastrar gravação em rascunho");
  await tab("Relatórios");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar relatório CSV", exact: true })
    .click();
  const file = await download;
  assert.ok(file.suggestedFilename().endsWith(".csv"));
  report.operations.push("UI: relatório EBD e exportação CSV");
  for (const moduleName of ["Louvor", "Painel EBD"]) {
    await nav(moduleName);
    const labels =
      moduleName === "Louvor"
        ? [
            "Biblioteca",
            "Escalas",
            "Calendário mensal",
            "Ensaios",
            "Sala ao vivo",
            "Histórico",
            "Equipe",
            "Configurações",
          ]
        : [
            "Meu painel",
            "Atividades",
            "Gravações",
            "Bíblia",
            "Histórico",
            "Relatórios",
            "Diário e presença",
            "Correções",
            "Módulos e atividades",
            "Turmas e pessoas",
            "Configurações",
          ];
    for (const label of labels) {
      await tab(label);
      await screenshot(
        (moduleName === "Louvor" ? "louvor-" : "ebd-") +
          label
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replaceAll(" ", "-")
            .toLowerCase(),
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const label of labels) {
      await tab(label);
      await screenshot(
        "mobile-" +
          (moduleName === "Louvor" ? "louvor-" : "ebd-") +
          label
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replaceAll(" ", "-")
            .toLowerCase(),
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(report.apiErrors, []);
  assert.deepEqual(report.pageErrors, []);
  assert.ok(report.screens.every((s) => !s.overflow));
} catch (error) {
  await page.screenshot({
    path: "test-results/modules/failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await context.close();
  await browser.close();
  const classes = await find("ebd_classes", "name"),
    classIds = classes.map((c) => c.id),
    modules = await find("ebd_modules"),
    activities = await find("ebd_activities"),
    activityIds = activities.map((a) => a.id),
    songs = await find("worship_songs"),
    services = await find("worship_services");
  async function remove(table, key, ids) {
    if (!ids.length) return;
    const r = await service.from(table).delete().in(key, ids);
    assert.ok(!r.error, "Limpeza de " + table + ": " + r.error?.message);
    const remaining = await service.from(table).select(key).in(key, ids);
    assert.ok(!remaining.error);
    assert.equal(remaining.data.length, 0);
  }
  await remove("ebd_activity_starts", "activity_id", activityIds);
  await remove("ebd_submissions", "activity_id", activityIds);
  await remove("ebd_attendance", "class_id", classIds);
  await remove("ebd_recordings", "class_id", classIds);
  await remove("ebd_class_members", "class_id", classIds);
  await remove("ebd_activities", "id", activityIds);
  await remove(
    "ebd_modules",
    "id",
    modules.map((m) => m.id),
  );
  await remove("ebd_classes", "id", classIds);
  await remove(
    "worship_live",
    "service_id",
    services.map((s) => s.id),
  );
  await remove(
    "worship_services",
    "id",
    services.map((s) => s.id),
  );
  await remove(
    "worship_rehearsals",
    "id",
    (await find("worship_rehearsals")).map((r) => r.id),
  );
  await remove(
    "worship_songs",
    "id",
    songs.map((s) => s.id),
  );
  if (tempPerson) {
    await remove("worship_members", "person_id", [tempPerson]);
    await remove("persons", "id", [tempPerson]);
  }
  const families = await find("families", "name");
  await remove(
    "family_members",
    "family_id",
    families.map((f) => f.id),
  );
  await remove(
    "families",
    "id",
    families.map((f) => f.id),
  );
  await remove(
    "prayer_requests",
    "id",
    (await find("prayer_requests", "body")).map((p) => p.id),
  );
  await actor.auth.signOut({ scope: "local" });
  report.cleanup = true;
  writeFileSync(
    "test-results/modules/report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
