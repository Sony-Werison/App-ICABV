import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("comunidade e serviço: oito perfis, escopo de liderança, adesão, lotação e confirmação individual", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;",
    );
    for (const name of [
      "202610200001_foundation.sql",
      "202610200002_core.sql",
      "202610210007_community.sql",
      "202610210009_group_meetings.sql",
    ])
      await db.exec(
        await readFile(
          new URL(`../../backend/supabase/migrations/${name}`, import.meta.url),
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
      (_, i) => `90000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    for (const user of users)
      await db.query("insert into auth.users(id) values($1)", [user]);
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
    await actor(7);
    const unit = (
      await db.query(
        "select public.save_community_unit(null,'department','Equipe fictícia','Teste','Domingo','Local fictício',true) as id",
      )
    ).rows[0].id;
    const other = (
      await db.query(
        "select public.save_community_unit(null,'department','Outra equipe','Teste','','',false) as id",
      )
    ).rows[0].id;
    await db.query("select public.set_community_leader($1,$2,true)", [
      unit,
      people[3],
    ]);
    for (let i = 0; i < roles.length; i++) {
      await actor(i);
      if ([3, 4, 7].includes(i))
        await db.query("select * from public.community_roster($1,0)", [unit]);
      else
        await assert.rejects(
          db.query("select * from public.community_roster($1,0)", [unit]),
          /unauthorized/,
        );
      if (![4, 7].includes(i))
        await assert.rejects(
          db.query("select public.set_community_leader($1,$2,true)", [
            other,
            people[i],
          ]),
          /unauthorized/,
        );
      if (![4, 7].includes(i))
        await assert.rejects(
          db.query("select * from public.community_leader_options($1,'',0)", [
            unit,
          ]),
          /unauthorized/,
        );
      await assert.rejects(
        db.query("update public.community_members set status='active'"),
        /permission denied/,
      );
    }
    await actor(3);
    await assert.rejects(
      db.query("select * from public.community_roster($1,0)", [other]),
      /unauthorized/,
    );
    assert.equal(
      (await db.query("select * from public.community_page('department','',0)"))
        .rows.length,
      1,
    );
    for (const i of [0, 1]) {
      await actor(i);
      await db.query("select public.request_community_membership($1,true)", [
        unit,
      ]);
    }
    await actor(0);
    assert.equal(
      (await db.query("select status from public.community_members")).rows[0]
        .status,
      "requested",
    );
    await assert.rejects(
      db.query("select public.decide_community_membership($1,$2,true)", [
        unit,
        people[0],
      ]),
      /unauthorized/,
    );
    await assert.rejects(
      db.query("select public.request_community_membership($1,false)", [other]),
      /unit_unavailable/,
    );
    await actor(3);
    for (const person of people.slice(0, 2))
      await db.query("select public.decide_community_membership($1,$2,true)", [
        unit,
        person,
      ]);
    await actor(7);
    assert.ok(
      (
        await db.query(
          "select * from public.community_leader_options($1,'',0)",
          [unit],
        )
      ).rows.some((r) => r.person_id === people[3] && r.assigned),
    );
    await db.query(
      "select public.save_community_unit($1,'department','Equipe fictícia','Teste','Domingo','Local fictício',false)",
      [unit],
    );
    await actor(0);
    assert.equal(
      (await db.query("select id from public.community_units")).rows.length,
      1,
      "Participante ativo continua vendo sua equipe retirada da lista pública",
    );
    await actor(2);
    assert.equal(
      (await db.query("select id from public.community_units")).rows.length,
      0,
      "Não participante não vê equipe não publicada",
    );
    await actor(7);
    await db.query(
      "select public.save_community_unit($1,'department','Equipe fictícia','Teste','Domingo','Local fictício',true)",
      [unit],
    );
    await actor(3);
    const shift = (
      await db.query(
        "select public.save_service_shift(null,$1,'Serviço fictício',now()+interval '3 days',now()+interval '3 days 2 hours',1,false) as id",
        [unit],
      )
    ).rows[0].id;
    const assignment = (
      await db.query("select public.assign_service_shift($1,$2) as id", [
        shift,
        people[0],
      ])
    ).rows[0].id;
    assert.equal(
      (
        await db.query("select public.assign_service_shift($1,$2) as id", [
          shift,
          people[0],
        ])
      ).rows[0].id,
      assignment,
    );
    await assert.rejects(
      db.query("select public.assign_service_shift($1,$2)", [shift, people[1]]),
      /shift_full/,
    );
    await assert.rejects(
      db.query("select public.respond_service_assignment($1,true)", [
        assignment,
      ]),
      /unauthorized/,
    );
    await actor(1);
    assert.equal(
      (await db.query("select * from public.service_assignments")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query("select private.unit_active($1,$2) as active", [
          unit,
          people[0],
        ])
      ).rows[0].active,
      false,
    );
    await assert.rejects(
      db.query("select public.respond_service_assignment($1,true)", [
        assignment,
      ]),
      /unauthorized/,
    );
    await actor(0);
    await db.query("select public.respond_service_assignment($1,true)", [
      assignment,
    ]);
    assert.equal(
      (await db.query("select * from public.my_service_assignments(0)")).rows[0]
        .status,
      "confirmed",
    );
    await actor(3);
    await db.query("select public.set_service_attendance($1,true)", [
      assignment,
    ]);
    await actor(0);
    await db.query("select public.respond_service_assignment($1,false)", [
      assignment,
    ]);
    await assert.rejects(
      db.query("select public.respond_service_assignment($1,true)", [
        assignment,
      ]),
      /new_assignment_required/,
    );
    await actor(3);
    const second = (
      await db.query("select public.assign_service_shift($1,$2) as id", [
        shift,
        people[1],
      ])
    ).rows[0].id;
    await db.exec("reset role");
    const past = (
      await db.query(
        "insert into public.service_shifts(unit_id,title,starts_at,ends_at,capacity) values($1,'Histórico fictício',now()-interval '2 days',now()-interval '1 day',1) returning id",
        [unit],
      )
    ).rows[0].id;
    const historic = (
      await db.query(
        "insert into public.service_assignments(shift_id,person_id,status,attended) values($1,$2,'confirmed',true) returning id",
        [past, people[1]],
      )
    ).rows[0].id;
    await actor(1);
    await db.query("select public.request_community_membership($1,false)", [
      unit,
    ]);
    const preserved = (
      await db.query(
        "select status,attended from public.service_assignments where id=$1",
        [historic],
      )
    ).rows[0];
    assert.equal(preserved.status, "confirmed");
    assert.equal(preserved.attended, true);
    assert.equal(
      (
        await db.query(
          "select status from public.service_assignments where id=$1",
          [second],
        )
      ).rows[0].status,
      "declined",
    );
    await actor(3);
    await assert.rejects(
      db.query(
        "select public.save_service_shift($1,$2,'Histórico fictício',now()-interval '2 days',now()-interval '1 day',1,true)",
        [past, unit],
      ),
      /shift_closed/,
    );
    await assert.rejects(
      db.query("select public.decide_community_membership($1,$2,true)", [
        unit,
        people[1],
      ]),
      /membership_required/,
    );
    await assert.rejects(
      db.query("select public.assign_service_shift($1,$2)", [shift, people[1]]),
      /active_membership_required/,
    );
    await db.query("select public.assign_service_shift($1,$2)", [
      shift,
      people[0],
    ]);
    await db.query(
      "select public.save_service_shift($1,$2,'Serviço fictício',now()+interval '3 days',now()+interval '3 days 2 hours',1,true)",
      [shift, unit],
    );
    await actor(0);
    await assert.rejects(
      db.query("select public.respond_service_assignment($1,true)", [
        assignment,
      ]),
      /shift_closed/,
    );
    await actor(7);
    await db.query("select public.set_community_leader($1,$2,false)", [
      unit,
      people[3],
    ]);
    await actor(3);
    await assert.rejects(
      db.query("select * from public.community_roster($1,0)", [unit]),
      /unauthorized/,
    );
    await db.exec(
      "reset role;select set_config('request.jwt.claim.sub','',false);set role anon",
    );
    await assert.rejects(
      db.query("select * from public.community_units"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from public.community_page('department','',0)"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec(
      "insert into public.community_units(kind,title,published) select 'group','Grupo fictício '||i,true from generate_series(1,30) i",
    );
    await actor(0);
    const page0 = (
      await db.query("select * from public.community_page('group','',0)")
    ).rows;
    const page1 = (
      await db.query("select * from public.community_page('group','',1)")
    ).rows;
    assert.deepEqual([page0.length, page1.length], [21, 10]);
    assert.equal(
      new Set([...page0.slice(0, 20), ...page1].map((r) => r.id)).size,
      30,
    );
    await db.exec("reset role");
    assert.equal(
      (await db.query("select * from public.consent_events")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
