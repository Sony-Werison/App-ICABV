import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
const migration = await readFile(
  new URL(
    "../../backend/supabase/migrations/202610200001_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const seed = await readFile(
  new URL("../../backend/supabase/seed.sql", import.meta.url),
  "utf8",
);
test("migration real: signup, RLS, consentimento, família e RBAC dos oito perfis", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
    );
    await db.exec(migration);
    await db.exec(seed);
    await db.exec(seed);
    assert.equal(
      (await db.query("select * from public.persons")).rows.length,
      3,
    );
    const roles = [
      "visitor",
      "member",
      "volunteer",
      "leader",
      "secretary",
      "treasurer",
      "elder",
      "admin",
    ];
    const ids = roles.map(
      (_, i) => `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    for (let i = 0; i < roles.length; i++) {
      await db.query(
        `insert into auth.users(id,raw_user_meta_data) values($1,'{"role":"admin","membership_status":"leader"}')`,
        [ids[i]],
      );
      if (i)
        await db.query(
          `insert into public.role_assignments(person_id,role) select id,$2 from public.persons where auth_user_id=$1`,
          [ids[i], roles[i]],
        );
    }
    const people = (
      await db.query("select id,auth_user_id from public.persons")
    ).rows;
    const actor = async (index) => {
      await db.exec("reset role");
      await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
        ids[index],
      ]);
      await db.exec("set role authenticated");
    };
    await actor(0);
    assert.deepEqual(
      (await db.query("select public.my_roles() as roles")).rows[0].roles,
      ["visitor"],
    );
    const own = (await db.query("select * from public.persons")).rows;
    assert.equal(own.length, 1);
    assert.equal(own[0].membership_status, "visitor");
    assert.equal(own[0].full_name, "");
    await assert.rejects(
      db.query(`update public.persons set membership_status='leader'`),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        `insert into public.role_assignments(person_id,role) values($1,'admin')`,
        [own[0].id],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        `select public.complete_onboarding('Ana Martins','2026-10-20.v1',true,true,true,false)`,
      ),
      /legal_not_published/,
    );
    await db.exec("reset role");
    await db.exec(`update public.legal_documents set published=true`);
    await actor(0);
    await assert.rejects(
      db.query(
        `select public.complete_onboarding('Ana Martins','2026-10-20.v1',true,false,true,false)`,
      ),
      /consent_required/,
    );
    await db.exec(
      `select public.complete_onboarding('Ana Martins','2026-10-20.v1',true,true,true,false)`,
    );
    assert.equal(
      (await db.query("select * from public.consent_events")).rows.length,
      4,
    );
    const family = (
      await db.query(`select public.create_family('Família Martins') as id`)
    ).rows[0].id;
    assert.equal(
      (await db.query("select * from public.family_members")).rows[0].verified,
      false,
    );
    await assert.rejects(
      db.query(`select public.link_family($1,$2)`, [family, people[0].id]),
      /forbidden/,
    );
    for (let i = 0; i < roles.length; i++) {
      await actor(i);
      assert.equal(
        (await db.query("select * from public.persons")).rows.length,
        ["secretary", "admin"].includes(roles[i]) ? 11 : 1,
        roles[i],
      );
      assert.equal(
        (await db.query("select * from public.consent_events")).rows.length,
        i === 0 ? 4 : 0,
      );
      assert.equal(
        (
          await db
            .query("select * from public.legacy_mapping")
            .catch(() => ({ rows: [] }))
        ).rows.length,
        0,
      );
      const p = (await db.query("select private.person_id() as id")).rows[0].id;
      if (!["secretary", "admin"].includes(roles[i]))
        await assert.rejects(
          db.query(`select public.register_person('Pessoa Teste')`),
          /forbidden/,
        );
      if (roles[i] !== "admin")
        await assert.rejects(
          db.query(`select public.grant_role($1,'admin')`, [p]),
          /forbidden/,
        );
    }
    await actor(4);
    await db.query(`select public.link_family($1,$2)`, [family, people[0].id]);
    await actor(0);
    assert.equal(
      (await db.query("select * from public.family_members")).rows.length,
      1,
      "vínculo familiar não expõe parentes",
    );
    await db.exec("select public.withdraw_analytics()");
    assert.equal(
      (await db.query("select * from public.consent_events")).rows.length,
      5,
    );
    await actor(7);
    const registered = (
      await db.query(`select public.register_person('Pessoa Exemplo') as id`)
    ).rows[0].id;
    await db.query(`select public.set_membership($1,'member')`, [registered]);
    await db.query(`select public.grant_role($1,'volunteer')`, [registered]);
    await db.query(`select public.revoke_role($1,'volunteer')`, [registered]);
    const adminPerson = (await db.query("select private.person_id() as id"))
      .rows[0].id;
    await assert.rejects(
      db.query(`select public.revoke_role($1,'admin')`, [adminPerson]),
      /last_admin/,
    );
    assert.ok(
      (await db.query("select * from public.audit_log")).rows.length >= 4,
    );
    await db.exec("reset role; set role anon");
    assert.equal(
      (await db.query("select * from public.legal_documents")).rows.length,
      1,
    );
    await assert.rejects(
      db.query("select * from public.persons"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.my_roles()"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
