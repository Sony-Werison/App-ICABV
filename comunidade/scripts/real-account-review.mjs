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
const report = {
  account: email,
  administrator: true,
  onboarded: !!profile.data.onboarded_at,
  screens: [],
  apiErrors: [],
  pageErrors: [],
  operations: [],
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
page.on("response", async (r) => {
  if (r.url().startsWith(url) && r.status() >= 400) {
    let d = {};
    try {
      d = await r.json();
    } catch {}
    report.apiErrors.push({
      path: new URL(r.url()).pathname,
      status: r.status(),
      code: d.code,
      message: d.message,
    });
  }
});
mkdirSync("test-results/real-account", { recursive: true });
async function shot(name) {
  await page.waitForLoadState("networkidle", { timeout: 15000 });
  await page.waitForTimeout(250);
  await page.waitForFunction(
    () => ![...document.querySelectorAll("main p, main option")].some(
      (element) => element.textContent?.trim().startsWith("Carregando"),
    ),
    undefined,
    { timeout: 20000 },
  );
  await page.waitForLoadState("networkidle", { timeout: 15000 });
  report.screens.push({
    name,
    overflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    alerts: await page.getByRole("alert").allTextContents(),
  });
  await page.screenshot({
    path: `test-results/real-account/${name}.png`,
    fullPage: true,
  });
}
try {
  await page.goto("http://localhost:5173/app");
  await page.getByRole("button", { name: "Menu", exact: true }).waitFor();
  await shot("app-home");
  for (const label of [
    "Agenda",
    "Conteúdos",
    "Grupos",
    "Ministérios",
    "Minhas escalas",
    "Oração",
    "Células",
    "Famílias",
    "Ofertas de teste",
    "Perfil",
  ]) {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: label, exact: true }).last().click();
    await shot(
      "app-" +
        label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replaceAll(" ", "-")
          .toLowerCase(),
    );
  }
  await page.goto("http://localhost:5173/gestao");
  await page
    .getByRole("heading", { name: "Gestão da igreja", exact: true })
    .waitFor();
  await shot("management-overview");
  for (const label of [
    "Pessoas e papéis",
    "Eventos e conteúdos",
    "Grupos e encontros",
    "Equipes e escalas",
    "Financeiro de teste",
  ]) {
    await page
      .getByRole("navigation", { name: "Áreas de gestão" })
      .getByRole("button", { name: label, exact: true })
      .click();
    await shot(
      "management-" +
        label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replaceAll(" ", "-")
          .toLowerCase(),
    );
  }
  await page
    .getByRole("navigation", { name: "Áreas de gestão" })
    .getByRole("button", { name: "Registros e finanças", exact: true })
    .click();
  await page.getByRole("button", { name: "Membros", exact: true }).waitFor();
  for (const label of [
    "Visão geral",
    "Membros",
    "Finanças",
    "Escalas",
    "Eventos",
    "Avisos",
    "Conteúdos",
    "Células",
    "Orações",
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await shot(
      "records-" +
        label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replaceAll(" ", "-")
          .toLowerCase(),
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem("icabv-theme", "dark"));
  await page.goto("http://localhost:5173/app");
  await page.getByRole("button", { name: "Menu", exact: true }).waitFor();
  await shot("mobile-dark-home");
  for (const label of [
    "Agenda",
    "Conteúdos",
    "Grupos",
    "Ministérios",
    "Minhas escalas",
    "Oração",
    "Células",
    "Famílias",
    "Ofertas de teste",
    "Perfil",
  ]) {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: label, exact: true }).last().click();
    await shot(
      "mobile-dark-" +
        label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replaceAll(" ", "-")
          .toLowerCase(),
    );
  }
  await page.goto("http://localhost:5173/gestao");
  await page
    .getByRole("heading", { name: "Gestão da igreja", exact: true })
    .waitFor();
  await shot("mobile-dark-management");
  for (const label of [
    "Pessoas e papéis",
    "Eventos e conteúdos",
    "Grupos e encontros",
    "Equipes e escalas",
    "Financeiro de teste",
  ]) {
    await page
      .getByRole("navigation", { name: "Áreas de gestão" })
      .getByRole("button", { name: label, exact: true })
      .click();
    await shot(
      "mobile-dark-management-" +
        label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replaceAll(" ", "-")
          .toLowerCase(),
    );
  }
  await page
    .getByRole("navigation", { name: "Áreas de gestão" })
    .getByRole("button", { name: "Registros e finanças", exact: true })
    .click();
  await page.getByRole("button", { name: "Membros", exact: true }).waitFor();
  for (const label of [
    "Visão geral",
    "Membros",
    "Finanças",
    "Escalas",
    "Eventos",
    "Avisos",
    "Conteúdos",
    "Células",
    "Orações",
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await shot(
      "mobile-dark-records-" +
        label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replaceAll(" ", "-")
          .toLowerCase(),
    );
  }
} finally {
  await context.close();
  await browser.close();
  await actor.auth.signOut({ scope: "local" });
  writeFileSync(
    "test-results/real-account/discovery.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        account: email,
        screens: report.screens.length,
        overflow: report.screens.filter((s) => s.overflow),
        alerts: report.screens.filter((s) => s.alerts.length),
        apiErrors: report.apiErrors,
        pageErrors: report.pageErrors,
      },
      null,
      2,
    ),
  );
}
