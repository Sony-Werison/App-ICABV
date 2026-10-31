import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("encontros: escopo, rascunhos privados, confirmação própria, presença e histórico, resumo e paginação", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;",
    );
    for (const file of [
      "202610200001_foundation.sql",
      "202610200002_core.sql",
      "202610210007_community.sql",
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
      (_, i) => `92000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
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
    const group = (
      await call(
        "select public.save_community_unit(null,'group','Grupo fictício','','','',true) id",
      )
    )[0].id;
    const other = (
      await call(
        "select public.save_community_unit(null,'group','Outro grupo','','','',true) id",
      )
    )[0].id;
    const dept = (
      await call(
        "select public.save_community_unit(null,'department','Equipe','','','',true) id",
      )
    )[0].id;
    await call("select public.set_community_leader($1,$2,true)", [
      group,
      people[3],
    ]);
    const save =
      "select public.save_group_meeting($1,$2,'Estudo fictício','Tema','Local',now()+interval '2 days',now()+interval '2 days 1 hour',$3) id";
    await assert.rejects(
      db.query(save, [null, dept, "draft"]),
      /group_required/,
    );
    const draft = (await call(save, [null, group, "draft"]))[0].id;
    const meeting = (await call(save, [null, group, "published"]))[0].id;
    for (let i = 0; i < roles.length; i++) {
      await actor(i);
      if (![3, 4, 7].includes(i)) {
        await assert.rejects(
          db.query(save, [null, group, "published"]),
          /unauthorized/,
        );
        await assert.rejects(
          db.query("select * from public.group_meeting_page($1,0)", [group]),
          /unauthorized/,
        );
        await assert.rejects(
          db.query("select * from public.group_meeting_roster($1,0)", [
            meeting,
          ]),
          /unauthorized/,
        );
        await assert.rejects(
          db.query("select * from public.group_meeting_report($1,2026)", [
            group,
          ]),
          /unauthorized/,
        );
        await assert.rejects(
          db.query("select public.set_group_meeting_attendance($1,$2,true)", [
            meeting,
            people[0],
          ]),
          /unauthorized/,
        );
      }
      await assert.rejects(
        db.query("select * from public.group_meetings"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select * from public.group_meeting_participants"),
        /permission denied/,
      );
    }
    await actor(3);
    await assert.rejects(
      db.query("select * from public.group_meeting_page($1,0)", [other]),
      /unauthorized/,
    );
    for (const i of [0, 1]) {
      await actor(i);
      await call("select public.request_community_membership($1,true)", [
        group,
      ]);
      await actor(7);
      await call("select public.decide_community_membership($1,$2,true)", [
        group,
        people[i],
      ]);
    }
    await actor(0);
    const visible = await call(
      "select * from public.group_meeting_page($1,0)",
      [group],
    );
    assert.deepEqual(
      visible.map((m) => m.id),
      [meeting],
    );
    assert.equal(visible[0].going_count, null);
    assert.equal(visible[0].present_count, null);
    await assert.rejects(
      db.query("select public.respond_group_meeting($1,true)", [draft]),
      /meeting_closed/,
    );
    await call("select public.respond_group_meeting($1,true)", [meeting]);
    await call("select public.respond_group_meeting($1,true)", [meeting]);
    await actor(3);
    assert.equal(
      (await call("select * from public.group_meeting_roster($1,0)", [meeting]))
        .length,
      1,
    );
    await assert.rejects(
      db.query("select public.set_group_meeting_attendance($1,$2,true)", [
        meeting,
        people[0],
      ]),
      /attendance_unavailable/,
    );
    await assert.rejects(
      db.query(save, [meeting, group, "draft"]),
      /participants_exist/,
    );
    await assert.rejects(
      db.query(
        "select public.save_group_meeting($1,$2,'Estudo','Tema','Novo local',now()+interval '2 days',now()+interval '2 days 1 hour','published')",
        [meeting, group],
      ),
      /participants_exist/,
    );
    // Exact timestamps are preserved during text-only editing.
    await call(
      "select public.save_group_meeting(id,unit_id,'Título revisado',topic,location,starts_at,ends_at,status) from public.group_meeting_page($1,0) m join (select $1::uuid unit_id) u on true where id=$2",
      [group, meeting],
    );
    await db.exec("reset role");
    await db.query(
      "update public.group_meetings set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",
      [meeting],
    );
    await actor(3);
    await call("select public.set_group_meeting_attendance($1,$2,true)", [
      meeting,
      people[0],
    ]);
    await assert.rejects(
      db.query("select public.set_group_meeting_attendance($1,$2,true)", [
        meeting,
        people[1],
      ]),
      /confirmation_required/,
    );
    await assert.rejects(
      db.query(save, [meeting, group, "canceled"]),
      /meeting_started/,
    );
    await actor(0);
    await assert.rejects(
      db.query("select public.respond_group_meeting($1,false)", [meeting]),
      /meeting_closed/,
    );
    assert.equal(
      (await call("select * from public.group_meeting_page($1,0)", [group]))[0]
        .my_present,
      true,
    );
    await actor(3);
    const future = (await call(save, [null, group, "published"]))[0].id;
    await actor(0);
    await call("select public.respond_group_meeting($1,true)", [future]);
    await actor(3);
    await call("select public.decide_community_membership($1,$2,false)", [
      group,
      people[0],
    ]);
    await actor(0);
    await assert.rejects(
      db.query("select * from public.group_meeting_page($1,0)", [group]),
      /unauthorized/,
    );
    await db.exec("reset role");
    const history = await call(
      "select meeting_id,status,present from public.group_meeting_participants where person_id=$1",
      [people[0]],
    );
    assert.equal(history.find((p) => p.meeting_id === meeting).present, true);
    assert.equal(
      history.find((p) => p.meeting_id === future).status,
      "canceled",
    );
    await actor(1);
    await call("select public.respond_group_meeting($1,true)", [future]);
    await actor(3);
    await call(
      "select public.save_group_meeting(id,$1,title,topic,location,starts_at,ends_at,'canceled') from public.group_meeting_page($1,0) where id=$2",
      [group, future],
    );
    await actor(1);
    assert.equal(
      (
        await call("select * from public.group_meeting_page($1,0)", [group])
      ).find((m) => m.id === future).my_status,
      "canceled",
    );
    await actor(3);
    await assert.rejects(
      db.query(save, [future, group, "published"]),
      /meeting_closed/,
    );
    await db.exec("reset role");
    await db.query(
      "insert into public.group_meetings(unit_id,title,starts_at,ends_at,status) values($1,'Limite anterior','2050-01-01T02:59:00Z','2050-01-01T03:30:00Z','published'),($1,'Limite atual','2050-01-01T03:00:00Z','2050-01-01T04:00:00Z','published'),($2,'Outro grupo','2050-01-01T03:00:00Z','2050-01-01T04:00:00Z','published')",
      [group, other],
    );
    await actor(3);
    assert.equal(
      Number(
        (
          await call("select * from public.group_meeting_report($1,2050)", [
            group,
          ])
        )[0].planned,
      ),
      1,
    );
    assert.equal(
      Number(
        (
          await call("select * from public.group_meeting_report($1,2049)", [
            group,
          ])
        )[0].planned,
      ),
      1,
    );
    await assert.rejects(
      db.query("select * from public.group_meeting_report($1,2101)", [group]),
      /invalid_year/,
    );
    for (let i = 0; i < 30; i++) await call(save, [null, group, "draft"]);
    assert.equal(
      (await call("select * from public.group_meeting_page($1,0)", [group]))
        .length,
      21,
    );
    assert.equal(
      (await call("select * from public.group_meeting_page($1,1)", [group]))
        .length,
      15,
    );
    await assert.rejects(
      db.query("select * from public.group_meeting_page($1,-1)", [group]),
      /invalid_page/,
    );
    await actor(7);
    await call("select public.set_community_leader($1,$2,false)", [
      group,
      people[3],
    ]);
    await actor(3);
    await assert.rejects(
      db.query("select * from public.group_meeting_roster($1,0)", [meeting]),
      /unauthorized/,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select * from public.group_meeting_page($1,0)", [group]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
