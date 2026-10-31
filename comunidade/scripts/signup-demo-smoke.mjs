import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const url = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1]
  .trim()
  .replace(/^['"]|['"]$/g, "");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  let attempts = 0;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(url + "/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/auth/v1/signup") {
      attempts++;
      const body = route.request().postDataJSON();
      assert.equal(body.email, "signup@example.com");
      assert.equal(body.password, "Password-test-123");
      assert.ok(!body.data?.role);
      assert.match(route.request().url(), /signup/);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "demo-test", identities: [] },
          session: null,
        }),
      });
    } else
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: "{}",
      });
  });
  await page.goto("http://localhost:5173/app");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill("signup@example.com");
  await page.getByLabel("Senha", { exact: true }).fill("Password-test-123");
  await page
    .getByLabel("Confirmar senha", { exact: true })
    .fill("Different-test-123");
  await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
  await page
    .getByText("As senhas precisam ser iguais.", { exact: true })
    .waitFor();
  assert.equal(attempts, 0);
  await page
    .getByLabel("Confirmar senha", { exact: true })
    .fill("Password-test-123");
  await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
  await page
    .getByText(
      "Confira seu e-mail para confirmar o cadastro. Depois, entre com sua senha.",
      { exact: true },
    )
    .waitFor();
  assert.equal(attempts, 1);
  await page.getByRole("button", { name: "Entrar", exact: true }).waitFor();
  mkdirSync("test-results/public-signup", { recursive: true });
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.screenshot({
    path: "test-results/public-signup/signup.png",
    fullPage: true,
  });
  const demo = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  let remote = 0;
  await demo.route(url + "/**", async (route) => {
    remote++;
    await route.abort();
  });
  const app = await demo.newPage();
  app.on("pageerror", (e) => errors.push(e.message));
  await app.goto("http://localhost:5173/demo?perfil=membro");
  await app
    .getByText("Olá, Lucas. Que bom ter você aqui.", { exact: true })
    .waitFor();
  assert.equal(
    await app.getByRole("button", { name: "Gestão", exact: true }).count(),
    0,
  );
  await app.screenshot({
    path: "test-results/public-signup/member-menu.png",
    fullPage: true,
  });
  await app.goto("http://localhost:5173/demo?perfil=gestor&tab=manage");
  await app
    .getByRole("heading", { name: "Gestão da igreja", exact: true })
    .waitFor();
  await app.screenshot({
    path: "test-results/public-signup/management-menu.png",
    fullPage: true,
  });
  await app
    .getByRole("button", { name: "Gestão de registros", exact: true })
    .click();
  await app.getByText("R$ 1.250,00", { exact: true }).first().waitFor();
  await app.screenshot({
    path: "test-results/public-signup/management-desktop.png",
    fullPage: true,
  });
  await app.getByRole("button", { name: "Membros", exact: true }).click();
  await app
    .getByRole("button", { name: "Cadastrar membro", exact: true })
    .first()
    .click();
  await app.getByLabel("Nome completo").fill("Pessoa apenas da demonstração");
  await app
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await app
    .getByText("Pessoa apenas da demonstração", { exact: true })
    .waitFor();
  assert.equal(remote, 0, "Demonstração não faz requisições ao Supabase");
  assert.deepEqual(errors, []);
  await app.setViewportSize({ width: 1440, height: 1000 });
  await app.getByRole("button", { name: "Visão geral", exact: true }).click();
  await app.screenshot({
    path: "test-results/public-signup/management-desktop.png",
    fullPage: true,
  });
  await app
    .getByRole("link", { name: "Voltar ao acesso real", exact: true })
    .click();
  await app.getByRole("button", { name: "Entrar", exact: true }).waitFor();
  assert.equal(
    await app
      .getByText("Olá, Ana. Que bom ter você aqui.", { exact: true })
      .count(),
    0,
  );
  console.log(
    "OK: cadastro por e-mail simulado, confirmação de senha/e-mail, menus por perfil, gestão e edição fictícia sem chamadas ao backend, retorno ao login real.",
  );
  await context.close();
  await demo.close();
} finally {
  await browser.close();
}
