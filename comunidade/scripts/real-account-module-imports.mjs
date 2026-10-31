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
const browser = await chromium.launch({ headless: true }),
  context = await browser.newContext();
await context.addInitScript(
  ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
  { key: `sb-${ref}-auth-token`, session: verified.data.session },
);
const page = await context.newPage();
const results = [];
const person = await actor.rpc("register_person", {
  display_name: tag + " Pessoa",
});
assert.ok(!person.error);
let songId;
async function remove(table, key, ids) {
  if (!ids.length) return;
  const r = await service.from(table).delete().in(key, ids);
  assert.ok(!r.error, table + ": " + r.error?.message);
  const check = await service.from(table).select(key).in(key, ids);
  assert.equal(check.data.length, 0);
}
try {
  const song = await actor
    .from("worship_songs")
    .insert({
      title: tag + " Música",
      artist: "Autor preservado",
      musical_key: "C",
    })
    .select("id")
    .single();
  assert.ok(!song.error);
  songId = song.data.id;
  await page.goto("http://localhost:5173/gestao?tab=louvor");
  await page.getByRole("heading", { name: "Louvor", exact: true }).waitFor();
  await page
    .getByRole("navigation", { name: "Áreas do Louvor" })
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  const csv =
    "title;key;timesPlayedQuarterly;timesPlayedTotal\n" +
    tag +
    " Música;D;4;12";
  await page
    .locator('input[accept=".json,.txt,.csv"]')
    .setInputFiles({
      name: "repertorio.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/rest/v1/worship_songs") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: "Confirmar importação do repertório",
      exact: true,
    })
    .click();
  assert.ok((await saved).ok());
  const actual = await actor
    .from("worship_songs")
    .select("musical_key,artist,legacy_quarterly,legacy_total")
    .eq("id", songId)
    .single();
  assert.ok(!actual.error);
  assert.deepEqual(actual.data, {
    musical_key: "D",
    artist: "Autor preservado",
    legacy_quarterly: 4,
    legacy_total: 12,
  });
  results.push("CSV real: atualizar tom e contagens preservando artista");
  await page.goto("http://localhost:5173/gestao?tab=ebd");
  await page
    .getByRole("heading", { name: "Painel EBD", exact: true })
    .waitFor();
  await page
    .getByRole("navigation", { name: "Áreas da EBD" })
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  const backup = {
    profiles: [
      {
        id: tag + "-person",
        name: tag + " Pessoa",
        classId: tag + "-class",
        role: "student",
        moduleId: 1,
      },
    ],
    classes: [
      {
        id: tag + "-class",
        name: tag + " Turma",
        type: "youth",
        gradingCriteria: [{ label: "Presença" }],
      },
    ],
    curriculum: {
      1: {
        title: tag + " Módulo",
        dailyActivityLimit: 2,
        schedule: [
          {
            title: tag + " Questão",
            question: "Pergunta",
            options: ["A", "B"],
            correct: 1,
            type: "quiz",
          },
        ],
      },
    },
    submissions: [
      {
        id: tag + "-history",
        user_id: tag + "-person",
        moduleId: 1,
        contentLabel: tag + " Histórico",
        answer: "B",
        score: 8,
        status: "graded",
        createdAt: "2026-10-22T12:00:00Z",
      },
    ],
    classRecordings: [],
  };
  const importer = page
    .locator("section.icabv-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Importar backup do Portal EBD",
        exact: true,
      }),
    })
    .first();
  await importer
    .locator("input[type=file]")
    .setInputFiles({
      name: "ebd.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await importer.locator("select").first().selectOption(person.data);
  await importer.locator("input[type=checkbox]").check();
  const imported = page.waitForResponse((r) =>
    r.url().endsWith("/rpc/import_module_backup"),
  );
  await importer
    .getByRole("button", { name: "Confirmar importação completa", exact: true })
    .click();
  const response = await imported;
  assert.ok(response.ok(), await response.text());
  const rows = await actor
    .from("ebd_legacy_history")
    .select("id")
    .like("title", tag + "%");
  assert.equal(rows.data.length, 1);
  const study = await actor
    .from("ebd_modules")
    .select("daily_limit")
    .like("title", tag + "%");
  assert.equal(study.data[0].daily_limit, 2);
  results.push(
    "UI real: importar EBD, vincular pessoa existente e preservar histórico/plano de estudo",
  );
} finally {
  await context.close();
  await browser.close();
  const mappings = await service
    .from("legacy_mapping")
    .select("*")
    .eq("source_system", "ebd")
    .like("legacy_id", tag + "%");
  assert.ok(!mappings.error);
  const ids = (kind) =>
    mappings.data
      .filter((m) => m.entity_type === kind)
      .map((m) => m.canonical_id);
  const classes = ids("class"),
    activities = ids("activity");
  await remove("ebd_legacy_history", "id", ids("history"));
  await remove("ebd_activity_starts", "activity_id", activities);
  await remove("ebd_submissions", "activity_id", activities);
  await remove("ebd_attendance", "class_id", classes);
  await remove("ebd_recordings", "class_id", classes);
  await remove("ebd_class_members", "class_id", classes);
  await remove("ebd_activities", "id", activities);
  await remove("ebd_modules", "id", ids("module"));
  await remove("ebd_classes", "id", classes);
  if (mappings.data.length) {
    const r = await service
      .from("legacy_mapping")
      .delete()
      .eq("source_system", "ebd")
      .like("legacy_id", tag + "%");
    assert.ok(!r.error);
  }
  if (songId) await remove("worship_songs", "id", [songId]);
  await remove("person_contacts", "person_id", [person.data]);
  await remove("persons", "id", [person.data]);
  await actor.auth.signOut({ scope: "local" });
  mkdirSync("test-results/modules", { recursive: true });
  writeFileSync(
    "test-results/modules/imports.json",
    JSON.stringify({ operations: results, cleanup: true }, null, 2),
  );
  console.log(JSON.stringify({ operations: results, cleanup: true }));
}
