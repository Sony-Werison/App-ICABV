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
const created = { events: [], event_items: [], content_links: [] };
const report = { operations: [], cleanup: false };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(
  ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
  { key: `sb-${ref}-auth-token`, session: verified.data.session },
);
const page = await context.newPage();
const pending = [];
page.on("response", (r) => {
  const name = new URL(r.url()).pathname.split("/").at(-1);
  const table = {
    save_event_item: "event_items",
    save_content_link: "content_links",
  }[name];
  if (table && r.ok() && r.url().startsWith(url)) {
    pending.push(
      (async () => {
        const body = r.request().postDataJSON();
        if (!JSON.stringify(body).includes(tag)) return;
        const id = await r.json();
        if (typeof id === "string" && !created[table].includes(id))
          created[table].push(id);
      })(),
    );
  }
});
try {
  const start = new Date(Date.now() + 86400000).toISOString(),
    end = new Date(Date.now() + 90000000).toISOString();
  const event = await actor.rpc("save_event", {
    resource: null,
    title: tag + " Evento",
    description: "Evento temporário",
    location: "Local de revisão",
    starts_at: start,
    ends_at: end,
    capacity: 5,
    audience: "authenticated",
    status: "draft",
    category: "Outros",
  });
  assert.ok(!event.error, event.error?.message);
  created.events.push(event.data);
  await page.goto("http://localhost:5173/gestao");
  await page
    .getByRole("navigation", { name: "Áreas de gestão" })
    .getByRole("button", { name: "Eventos e conteúdos", exact: true })
    .click();
  await page.getByRole("button", { name: "Eventos", exact: true }).click();
  const card = page
    .locator("section.icabv-card")
    .filter({
      has: page.getByText(tag + " Evento · Rascunho", { exact: true }),
    })
    .first();
  await card
    .getByRole("button", { name: "Gerenciar itens e presença", exact: true })
    .click();
  const items = page
    .locator("section.icabv-card")
    .filter({
      has: page.getByText("Itens: " + tag + " Evento", { exact: true }),
    })
    .first();
  await items.getByLabel("Nome do item", { exact: true }).fill(tag + " Item");
  await items.getByLabel("Quantidade total", { exact: true }).fill("3");
  await items
    .getByRole("button", { name: "Adicionar item", exact: true })
    .click();
  await items
    .getByText(tag + " Item", { exact: false })
    .first()
    .waitFor();
  report.operations.push("UI: gerenciar itens do evento e consultar presença");
  await card
    .getByRole("button", { name: "Editar evento", exact: true })
    .click();
  await page.locator("textarea").first().fill("Descrição temporária revisada");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await page.getByText("Salvo com sucesso.", { exact: true }).first().waitFor();
  const persisted = await actor
    .from("events")
    .select("description,starts_at,ends_at")
    .eq("id", event.data)
    .single();
  assert.ok(!persisted.error);
  assert.equal(persisted.data.description, "Descrição temporária revisada");
  assert.equal(
    new Date(persisted.data.starts_at).getTime(),
    new Date(start).getTime(),
  );
  assert.equal(
    new Date(persisted.data.ends_at).getTime(),
    new Date(end).getTime(),
  );
  report.operations.push("UI: editar evento preservando os horários originais");
  await page.getByRole("button", { name: "Links", exact: true }).click();
  await page.getByLabel("Título", { exact: true }).fill(tag + " Devocional");
  await page
    .getByRole("button", { name: "Vídeo do YouTube", exact: true })
    .click();
  await page
    .getByLabel("Endereço HTTPS oficial", { exact: true })
    .fill("https://int.odbm.org/pt/devocional");
  await page
    .getByRole("button", { name: "Salvar rascunho", exact: true })
    .click();
  await page.getByText(tag + " Devocional", { exact: true }).waitFor();
  report.operations.push("UI: cadastrar link devocional em rascunho");
  await Promise.all(pending);
  assert.equal(created.content_links.length, 1);
  assert.equal(created.event_items.length, 1);
} finally {
  await Promise.allSettled(pending);
  await context.close();
  await browser.close();
  for (const table of ["event_items", "events", "content_links"]) {
    if (created[table].length) {
      const existing = await service
        .from(table)
        .select("*")
        .in("id", created[table]);
      assert.ok(existing.data.every((r) => JSON.stringify(r).includes(tag)));
      const del = await service.from(table).delete().in("id", created[table]);
      assert.ok(!del.error);
      const rest = await service
        .from(table)
        .select("id")
        .in("id", created[table]);
      assert.equal(rest.data.length, 0);
    }
  }
  await actor.auth.signOut({ scope: "local" });
  report.cleanup = true;
  mkdirSync("test-results/real-account", { recursive: true });
  writeFileSync(
    "test-results/real-account/content-operations.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
