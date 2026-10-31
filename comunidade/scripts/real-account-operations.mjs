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
const created = new Map();
const keep = (table, id) => {
  if (!created.has(table)) created.set(table, new Set());
  created.get(table).add(id);
};
const results = [],
  errors = [],
  apiErrors = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(
  ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
  { key: `sb-${ref}-auth-token`, session: verified.data.session },
);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", async (r) => {
  if (r.url().startsWith(url) && r.status() >= 400) {
    let data = {};
    try {
      data = await r.json();
    } catch {}
    apiErrors.push({
      path: new URL(r.url()).pathname,
      status: r.status(),
      message: data.message,
    });
  }
});
page.on("dialog", (d) => d.accept());
const mapping = {
  create_managed_family: "families",
  register_person: "persons",
  save_community_unit: "community_units",
  save_group_meeting: "group_meetings",
  save_service_shift: "service_shifts",
  save_management_record: "management_records",
  save_announcement: "announcements",
  save_event: "events",
  save_content_link: "content_links",
  save_event_item: "event_items",
};
const pending = new Set();
page.on("response", (r) => {
  const path = new URL(r.url()).pathname;
  const name = path.split("/").at(-1);
  if (r.url().startsWith(url) && mapping[name] && r.ok()) {
    const task = (async () => {
      let body;
      try {
        body = r.request().postDataJSON();
      } catch {
        return;
      }
      if (!JSON.stringify(body).includes(tag)) return;
      const id = await r.json();
      if (typeof id === "string") keep(mapping[name], id);
    })();
    pending.add(task);
    task.finally(() => pending.delete(task));
  }
});
async function call(name, args, table) {
  const r = await actor.rpc(name, args);
  assert.ok(!r.error, `${name}: ${r.error?.message}`);
  if (table) keep(table, r.data);
  results.push(name);
  return r.data;
}
async function nav(label) {
  await page
    .getByRole("navigation", { name: "Áreas de gestão" })
    .getByRole("button", { name: label, exact: true })
    .click();
}
try {
  await page.goto("http://localhost:5173/app");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Famílias", exact: true }).click();
  await page
    .getByRole("button", { name: "Cadastrar família", exact: true })
    .waitFor();
  await page
    .getByLabel("Nome da família", { exact: true })
    .fill(tag + " Família");
  await page
    .getByRole("button", { name: "Cadastrar família", exact: true })
    .click();
  await page.getByText(tag + " Família", { exact: true }).waitFor();
  results.push("UI: cadastrar família administrativa");
  await page.goto("http://localhost:5173/gestao");
  await nav("Pessoas e papéis");
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("heading", { name: "Cadastrar pessoa", exact: true }),
    });
  await form.getByLabel("Nome completo", { exact: true }).fill(tag + " Pessoa");
  await form.getByRole("button", { name: "Salvar", exact: true }).click();
  await page
    .getByText(tag + " Pessoa", { exact: true })
    .first()
    .waitFor();
  results.push("UI: cadastrar pessoa");
  const roleform = page
    .locator("form")
    .filter({
      has: page.getByRole("heading", {
        name: "Permissões de acesso",
        exact: true,
      }),
    });
  await roleform
    .locator("select[name=person]")
    .selectOption({ label: tag + " Pessoa" });
  await roleform.locator("select[name=role]").selectOption("leader");
  await roleform.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByText("Salvo com sucesso.", { exact: true }).waitFor();
  await Promise.all([...pending]);
  const pid = [...created.get("persons")][0];
  assert.ok(
    (
      await service
        .from("role_assignments")
        .select("role")
        .eq("person_id", pid)
        .eq("role", "leader")
    ).data.length,
  );
  await roleform.locator("select[name=operation]").selectOption("revoke");
  await roleform.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(
    (
      await service
        .from("role_assignments")
        .select("role")
        .eq("person_id", pid)
        .eq("role", "leader")
    ).data.length,
    0,
  );
  results.push("UI: conceder e revogar perfil somente à pessoa temporária");
  await nav("Eventos e conteúdos");
  await page.getByLabel("Título", { exact: true }).fill(tag + " Aviso");
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Aviso temporário privado em rascunho.");
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await page.getByText(tag + " Aviso · Rascunho", { exact: true }).waitFor();
  results.push("UI: salvar aviso rascunho");
  await nav("Grupos e encontros");
  await page
    .getByRole("button", { name: "Criar rascunho", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: true }).fill(tag + " Grupo");
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Grupo temporário de revisão");
  await page
    .getByLabel("Horários dos encontros", { exact: true })
    .fill("Quarta, 19h");
  await page
    .getByLabel("Ponto de encontro público", { exact: true })
    .fill("Local de revisão");
  await page
    .getByRole("button", { name: "Criar rascunho", exact: true })
    .click();
  await page.getByText(tag + " Grupo · Rascunho", { exact: true }).waitFor();
  results.push("UI: criar grupo rascunho");
  const groupCard = page
    .locator("section.icabv-card")
    .filter({ has: page.getByText(tag + " Grupo · Rascunho", { exact: true }) })
    .first();
  await groupCard
    .getByRole("button", { name: "Ver encontros e estudos", exact: true })
    .click();
  await groupCard
    .getByRole("button", { name: "Planejar encontro", exact: true })
    .click();
  await groupCard
    .getByLabel("Título do encontro", { exact: true })
    .fill(tag + " Encontro");
  await groupCard
    .getByLabel("Tema ou roteiro do estudo", { exact: true })
    .fill("Revisão de interface");
  await groupCard
    .getByLabel("Local do encontro", { exact: true })
    .fill("Local de revisão");
  const format = (d) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(d)
      .replace(",", "");
  const starts = new Date(Date.now() + 3 * 86400000),
    ends = new Date(starts.getTime() + 3600000);
  await groupCard
    .getByLabel("Início — DD/MM/AAAA HH:MM (Brasília)", { exact: true })
    .fill(format(starts));
  await groupCard
    .getByLabel("Fim — DD/MM/AAAA HH:MM (Brasília)", { exact: true })
    .fill(format(ends));
  await groupCard
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await groupCard
    .getByText(tag + " Encontro", { exact: false })
    .first()
    .waitFor();
  results.push("UI: planejar encontro avulso");
  await groupCard
    .getByRole("button", { name: "Resumo do grupo", exact: true })
    .click();
  await groupCard.getByLabel("Ano do resumo", { exact: true }).waitFor();
  results.push("UI: resumo anual do grupo");
  await groupCard
    .getByRole("button", { name: "Fechar encontros", exact: true })
    .click();
  await groupCard
    .getByRole("button", { name: "Abrir conversa", exact: true })
    .click();
  await groupCard
    .getByRole("heading", { name: "Conversa do grupo", exact: true })
    .waitFor();
  await groupCard
    .getByRole("button", { name: "Moderação", exact: true })
    .click();
  assert.equal(
    await groupCard
      .getByText("Não foi possível carregar a conversa.", { exact: false })
      .count(),
    0,
  );
  results.push("UI: conversa e moderação sem enviar mensagens");
  await call(
    "save_community_unit",
    {
      resource: null,
      kind: "department",
      title: tag + " Equipe",
      description: "Revisão",
      schedule: "Quarta 19h",
      meeting_point: "Local de revisão",
      published: false,
    },
    "community_units",
  );
  await nav("Equipes e escalas");
  await page
    .getByLabel("Buscar pelo nome ou descrição", { exact: true })
    .fill(tag + " Equipe");
  const teamCard = page
    .locator("section.icabv-card")
    .filter({
      has: page.getByText(tag + " Equipe · Rascunho", { exact: true }),
    })
    .first();
  await teamCard
    .getByRole("button", { name: "Participantes e escalas", exact: true })
    .click();
  await teamCard
    .getByLabel("Atividade ou função", { exact: true })
    .fill(tag + " Escala");
  await teamCard
    .getByLabel("Início: DD/MM/AAAA HH:mm (Brasília)", { exact: true })
    .fill(format(starts));
  await teamCard
    .getByLabel("Fim: DD/MM/AAAA HH:mm (Brasília)", { exact: true })
    .fill(format(ends));
  await teamCard
    .getByRole("button", { name: "Criar escala", exact: true })
    .click();
  await teamCard
    .getByText(tag + " Escala", { exact: false })
    .first()
    .waitFor();
  results.push("UI: criar escala da equipe");
  const event = await call(
    "save_event",
    {
      resource: null,
      title: tag + " Evento",
      description: "Revisão",
      location: "Local de revisão",
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      capacity: 5,
      audience: "authenticated",
      status: "draft",
      category: "Outros",
    },
    "events",
  );
  await call(
    "save_event_item",
    { resource: null, event, name: tag + " Item", quantity: 2 },
    "event_items",
  );
  await nav("Registros e finanças");
  await page.getByRole("button", { name: "Finanças", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo lançamento", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Descrição", { exact: false })
    .fill(tag + " Lançamento");
  await dialog.getByLabel("Valor (R$)", { exact: false }).fill("1,23");
  await dialog
    .getByLabel("Categoria", { exact: false })
    .fill("Revisão temporária");
  await dialog
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await page.getByText(tag + " Lançamento", { exact: true }).waitFor();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV", exact: true }).click();
  assert.ok((await download).suggestedFilename().endsWith(".csv"));
  results.push("UI: lançamento financeiro real temporário e exportação CSV");
  await page.goto("http://localhost:5173/app");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Oração", exact: true }).click();
  await page
    .getByLabel("Seu pedido de oração", { exact: true })
    .fill("Teste que não será enviado");
  assert.ok(
    await page
      .getByRole("button", { name: "Enviar pedido", exact: true })
      .isEnabled(),
  );
  results.push(
    "UI: participação pessoal disponível sem onboarding adicional",
  );
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({
    path: "test-results/real-account/operation-failure.png",
    fullPage: true,
  });
  console.log(JSON.stringify({ apiErrors }, null, 2));
  throw error;
} finally {
  await Promise.allSettled([...pending]);
  await context.close();
  await browser.close();
  for (const table of [
    "management_records",
    "event_items",
    "events",
    "announcements",
    "content_links",
    "group_meetings",
    "service_shifts",
    "community_units",
    "families",
    "persons",
  ]) {
    const ids = [...(created.get(table) ?? [])];
    if (!ids.length) continue;
    if (table === "families")
      await service.from("family_members").delete().in("family_id", ids);
    if (table === "persons")
      await service.from("role_assignments").delete().in("person_id", ids);
    const check = await service.from(table).select("*").in("id", ids);
    assert.ok(!check.error);
    assert.ok(
      check.data.every((row) => JSON.stringify(row).includes(tag)),
      `Limpeza restrita: ${table}`,
    );
    const deleted = await service.from(table).delete().in("id", ids);
    assert.ok(!deleted.error, `Limpeza: ${table}`);
    const remaining = await service.from(table).select("id").in("id", ids);
    assert.equal(remaining.data.length, 0);
  }
  await actor.auth.signOut({ scope: "local" });
  const report = {
    account: email,
    operations: results,
    temporaryRecords: [...created.values()].reduce((n, s) => n + s.size, 0),
    cleanup: "verified",
    pageErrors: errors,
  };
  mkdirSync("test-results/real-account", { recursive: true });
  writeFileSync(
    "test-results/real-account/operations.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}

