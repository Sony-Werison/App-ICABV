import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("substituições: consentimento de ambas as partes, aprovação independente, privacidade e preservação de vagas", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;",
    );
    for (const file of [
      "202610200001_foundation.sql",
      "202610200002_core.sql",
      "202610210007_community.sql",
      "202610210008_service_exchanges.sql",
      "202610210009_group_meetings.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../../backend/supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
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
    const users = roles.map(
      (_, i) => `91000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    for (const id of users)
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.exec(
      "update public.persons set full_name='Pessoa fictícia',onboarded_at=now()",
    );
    const people = (
      await db.query("select id from public.persons order by auth_user_id")
    ).rows.map((r) => r.id);
    for (let i = 0; i < roles.length; i++)
      await db.query(
        "insert into public.role_assignments(person_id,role) values($1,$2)",
        [people[i], roles[i]],
      );
    const actor = async (i) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        users[i],
      ]);
      await db.exec("set role authenticated");
    };
    const call = async (sql, args = []) => (await db.query(sql, args)).rows;
    await actor(7);
    const unit = (
      await call(
        "select public.save_community_unit(null,'department','Equipe fictícia','','','',true) id",
      )
    )[0].id;
    const other = (
      await call(
        "select public.save_community_unit(null,'department','Outra equipe','','','',true) id",
      )
    )[0].id;
    await call("select public.set_community_leader($1,$2,true)", [
      unit,
      people[3],
    ]);
    for (const i of [0, 1, 2, 3]) {
      await actor(i);
      await call("select public.request_community_membership($1,true)", [unit]);
      await actor(7);
      await call("select public.decide_community_membership($1,$2,true)", [
        unit,
        people[i],
      ]);
    }
    const shift = (
      await call(
        "select public.save_service_shift(null,$1,'Atividade',now()+interval '2 days',now()+interval '2 days 1 hour',1,false) id",
        [unit],
      )
    )[0].id;
    const assignment = (
      await call("select public.assign_service_shift($1,$2) id", [
        shift,
        people[0],
      ])
    )[0].id;
    await actor(0);
    await assert.rejects(
      db.query("select public.request_service_exchange($1)", [assignment]),
      /shift_closed/,
    );
    await call("select public.respond_service_assignment($1,true)", [
      assignment,
    ]);
    const exchange = (
      await call("select public.request_service_exchange($1) id", [assignment])
    )[0].id;
    assert.equal(
      (
        await call("select public.request_service_exchange($1) id", [
          assignment,
        ])
      )[0].id,
      exchange,
    );
    // Other roles do not get membership or team authority from their global role.
    for (let i = 0; i < roles.length; i++) {
      await actor(i);
      if (![0, 1, 2, 3, 4, 7].includes(i))
        assert.equal(
          (await call("select * from public.service_exchange_page(0)")).length,
          0,
        );
      if (![3, 4, 7].includes(i))
        await assert.rejects(
          db.query("select public.service_exchange_action($1,'approve')", [
            exchange,
          ]),
          /unauthorized/,
        );
      await assert.rejects(
        db.query("select * from public.service_exchanges"),
        /permission denied/,
      );
    }
    await actor(0);
    await assert.rejects(
      db.query("select public.service_exchange_action($1,'accept')", [
        exchange,
      ]),
      /unauthorized/,
    );
    await actor(7);
    await assert.rejects(
      db.query("select public.service_exchange_action($1,'approve')", [
        exchange,
      ]),
      /acceptance_required/,
    );
    await actor(1);
    const visible = (
      await call("select * from public.service_exchange_page(0)")
    )[0];
    assert.equal(visible.source_name, null);
    assert.equal(visible.target_name, null);
    assert.equal(visible.is_source, false);
    await call("select public.service_exchange_action($1,'accept')", [
      exchange,
    ]);
    await actor(2);
    assert.equal(
      (await call("select * from public.service_exchange_page(0)")).length,
      0,
    );
    await assert.rejects(
      db.query("select public.service_exchange_action($1,'accept')", [
        exchange,
      ]),
      /unauthorized/,
    );
    await actor(1);
    await call("select public.service_exchange_action($1,'withdraw')", [
      exchange,
    ]);
    await actor(3);
    await call("select public.service_exchange_action($1,'accept')", [
      exchange,
    ]);
    // The candidate is a designated leader but cannot approve their own replacement.
    await assert.rejects(
      db.query("select public.service_exchange_action($1,'approve')", [
        exchange,
      ]),
      /unauthorized/,
    );
    await actor(7);
    await call("select public.service_exchange_action($1,'approve')", [
      exchange,
    ]);
    await assert.rejects(
      db.query("select public.service_exchange_action($1,'approve')", [
        exchange,
      ]),
      /exchange_closed/,
    );
    await db.exec("reset role");
    const assignments = await call(
      "select person_id,status,attended from public.service_assignments where shift_id=$1",
      [shift],
    );
    assert.equal(assignments.filter((a) => a.status !== "declined").length, 1);
    assert.equal(
      assignments.find((a) => a.person_id === people[0]).status,
      "declined",
    );
    assert.equal(
      assignments.find((a) => a.person_id === people[3]).status,
      "confirmed",
    );
    assert.equal(
      assignments.every((a) => !a.attended),
      true,
    );
    // Changed schedules and revoked memberships must invalidate approval.
    await actor(3);
    const own = (
      await call("select * from public.my_service_assignments(0)")
    )[0].id;
    const next = (
      await call("select public.request_service_exchange($1) id", [own])
    )[0].id;
    await actor(1);
    await call("select public.service_exchange_action($1,'accept')", [next]);
    await actor(7);
    await call("select public.decide_community_membership($1,$2,false)", [
      unit,
      people[1],
    ]);
    await assert.rejects(
      db.query("select public.service_exchange_action($1,'approve')", [next]),
      /active_membership_required/,
    );
    await call("select public.request_community_membership($1,true)", [other]);
    await actor(3);
    await call("select public.service_exchange_action($1,'cancel')", [next]);
    const changed = (
      await call("select public.request_service_exchange($1) id", [own])
    )[0].id;
    await actor(2);
    await call("select public.service_exchange_action($1,'accept')", [changed]);
    await actor(7);
    await call(
      "select public.save_service_shift($1,$2,'Atividade',now()+interval '3 days',now()+interval '3 days 1 hour',1,false)",
      [shift, unit],
    );
    await assert.rejects(
      db.query("select public.service_exchange_action($1,'approve')", [
        changed,
      ]),
      /exchange_unavailable/,
    );
    assert.equal(
      (await call("select * from public.service_exchange_page(0)")).find(
        (r) => r.id === changed,
      ).available,
      false,
    );
    await call("select public.service_exchange_action($1,'reject')", [changed]);
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select * from public.service_exchange_page(0)"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
