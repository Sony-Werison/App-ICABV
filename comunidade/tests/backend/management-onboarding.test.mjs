import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
test("gestão sem onboarding pessoal: escopo, bloqueios e ausência de consentimento fictício", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;",
    );
    const dir = new URL("../../backend/supabase/migrations/", import.meta.url);
    for (const name of (await readdir(dir))
      .filter((n) => n.endsWith(".sql") && n < "202610220014")
      .sort())
      await db.exec(await readFile(new URL(name, dir), "utf8"));
    const users = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000004",
    ];
    for (const id of users)
      await db.query("insert into auth.users(id) values($1)", [id]);
    const people = (
      await db.query("select id from public.persons order by auth_user_id")
    ).rows.map((p) => p.id);
    for (const [i, role] of [
      "admin",
      "secretary",
      "leader",
      "member",
    ].entries())
      await db.query(
        "insert into public.role_assignments(person_id,role) values($1,$2)",
        [people[i], role],
      );
    async function actor(i) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        users[i],
      ]);
      await db.exec("set role authenticated");
    }
    await actor(0);
    const group = (
      await db.query(
        "select public.save_community_unit(null,'group','Grupo QA','Teste','Quarta 19h','Local QA',false) id",
      )
    ).rows[0].id;
    const department = (
      await db.query(
        "select public.save_community_unit(null,'department','Equipe QA','Teste','Quarta 19h','Local QA',false) id",
      )
    ).rows[0].id;
    const family = (
      await db.query("select public.create_managed_family('Família QA') id")
    ).rows[0].id;
    assert.ok(family);
    await assert.rejects(db.query("select public.create_managed_family('x')"));
    await assert.rejects(
      db.query("select public.create_family('Família pessoal')"),
    );
    await assert.rejects(
      db.query("select public.create_prayer('Teste','private',false)"),
    );
    const start = new Date(Date.now() + 86400000).toISOString(),
      end = new Date(Date.now() + 90000000).toISOString();
    const shift = (
      await db.query(
        "select public.save_service_shift(null,$1,'Escala QA',$2,$3,2,false) id",
        [department, start, end],
      )
    ).rows[0].id;
    assert.ok(shift);
    const meeting = (
      await db.query(
        "select public.save_group_meeting(null,$1,'Encontro QA','Tema','Local QA',$2,$3,'draft') id",
        [group, start, end],
      )
    ).rows[0].id;
    assert.ok(meeting);
    assert.equal(
      (await db.query("select * from public.group_meeting_page($1,0)", [group]))
        .rows.length,
      1,
    );
    assert.equal(
      (
        await db.query("select * from public.group_meeting_roster($1,0)", [
          meeting,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query("select * from public.group_meeting_report($1,2026)", [
          group,
        ])
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query("select * from public.group_chat_page($1,null,false)", [
          group,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.service_exchange_page(0)")).rows
        .length,
      0,
    );
    await actor(1);
    assert.ok(
      (
        await db.query(
          "select public.create_managed_family('Família secretaria') id",
        )
      ).rows[0].id,
    );
    await db.query(
      "select public.save_community_unit($1,'group','Grupo atualizado','Teste','Quarta','Local',false)",
      [group],
    );
    await assert.rejects(
      db.query("select public.request_community_membership($1,true)", [group]),
    );
    for (const i of [2, 3]) {
      await actor(i);
      await assert.rejects(
        db.query("select public.create_managed_family('Proibida')"),
      );
      await assert.rejects(
        db.query(
          "select public.save_community_unit(null,'group','Proibido','Teste','Dia','Local',false)",
        ),
      );
      await assert.rejects(
        db.query("select public.create_prayer('Teste','private',false)"),
      );
      await assert.rejects(
        db.query("select * from public.group_meeting_page($1,0)", [group]),
      );
      await assert.rejects(
        db.query("select * from public.group_chat_page($1,null,false)", [
          group,
        ]),
      );
    }
    await db.exec("reset role");
    assert.equal(
      (await db.query("select count(*)::int n from public.consent_events"))
        .rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.persons where onboarded_at is not null",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.family_members where family_id=$1",
          [family],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
