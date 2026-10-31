import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
test("Louvor/EBD: identidade única, participação sem onboarding e permissões por turma", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;",
    );
    const dir = new URL("../../backend/supabase/migrations/", import.meta.url);
    for (const name of (await readdir(dir))
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(new URL(name, dir), "utf8"));
    const users = Array.from(
      { length: 6 },
      (_, i) => `20000000-0000-4000-8000-00000000000${i + 1}`,
    );
    for (const id of users)
      await db.query("insert into auth.users(id) values($1)", [id]);
    const people = (
      await db.query("select id from public.persons order by auth_user_id")
    ).rows.map((r) => r.id);
    await db.query(
      "insert into public.role_assignments(person_id,role) values($1,'admin')",
      [people[0]],
    );
    async function actor(i) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        users[i] ?? "",
      ]);
      await db.exec(i === -1 ? "set role anon" : "set role authenticated");
    }
    const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
    await actor(0);
    const c = (
      await one(
        "insert into public.ebd_classes(name) values('Jovens QA') returning id",
      )
    ).id;
    const c2 = (
      await one(
        "insert into public.ebd_classes(name) values('Outra QA') returning id",
      )
    ).id;
    const m = (
      await one(
        "insert into public.ebd_modules(class_id,title) values($1,'Módulo QA') returning id",
        [c],
      )
    ).id;
    const m2 = (
      await one(
        "insert into public.ebd_modules(class_id,title) values($1,'Outro módulo') returning id",
        [c2],
      )
    ).id;
    for (const [i, role] of [
      [1, "teacher"],
      [2, "student"],
    ])
      await db.query(
        "insert into public.ebd_class_members(class_id,person_id,role,module_id) values($1,$2,$3,$4)",
        [c, people[i], role, m],
      );
    await db.query(
      "insert into public.ebd_class_members(class_id,person_id,role) values($1,$2,'student')",
      [c2, people[4]],
    );
    await db.query(
      "insert into public.ebd_guardians(student_id,guardian_id) values($1,$2)",
      [people[2], people[3]],
    );
    await db.query(
      "insert into public.module_access(person_id,module,role) values($1,'ebd','observer')",
      [people[5]],
    );
    const song = (
      await one(
        "insert into public.worship_songs(title,chords) values('Canção QA','C  G/B  Am') returning id",
      )
    ).id;
    const versions=[{id:'a0000000-0000-4000-8000-000000000001',name:'v.1',musical_key:'C',chords:'[C]Canção',lyrics:'Canção'},{id:'a0000000-0000-4000-8000-000000000002',name:'Violão',musical_key:'G',chords:'[G]Canção',lyrics:'Canção'}];
    await db.query('update public.worship_songs set chord_versions=$1 where id=$2',[JSON.stringify(versions),song]);
    await assert.rejects(()=>db.query('update public.worship_songs set chord_versions=$1 where id=$2',[JSON.stringify([versions[0],versions[0]]),song]));
    await assert.rejects(()=>db.query('update public.worship_songs set chord_versions=$1 where id=$2',[JSON.stringify([{...versions[0],name:''}]),song]));
    await actor(2);
    assert.deepEqual((await one('select chord_versions from public.worship_songs where id=$1',[song])).chord_versions,versions);
    assert.equal((await db.query("update public.worship_songs set chord_versions='[]' where id=$1 returning id",[song])).rows.length,0,'Membro pode ler, mas não renomear versões');
    await actor(0);
    versions[1].name='Violão acústico';
    await db.query('select public.sync_operation($1,$2)', ['a0000000-0000-4000-8000-000000000003',JSON.stringify({kind:'table',target:'worship_songs',method:'PATCH',body:{chord_versions:versions},filters:{id:{op:'eq',value:song}}})]);
    assert.equal((await one('select chord_versions from public.worship_songs where id=$1',[song])).chord_versions[1].name,'Violão acústico');
    assert.equal((await one('select count(*)::integer as n from public.worship_songs')).n,1,'Versões não criam músicas');
    await db.query(
      "insert into public.worship_members(person_id,roles) values($1,array['Abertura'])",
      [people[1]],
    );
    const service = (
      await one(
        "insert into public.worship_services(title,starts_at,assignments,playlist) values('Culto QA',now(),$1,$2) returning id",
        [JSON.stringify({ Abertura: [people[1]] }), [song]],
      )
    ).id;
    await actor(1);
    const data = {
      module_id: m,
      title: "Pergunta QA",
      kind: "quiz",
      questions: [
        { prompt: "Qual alternativa?", type: "choice", options: ["A", "B"] },
      ],
      published: true,
    };
    const activity = (
      await one("select public.save_ebd_activity(null,$1,$2) id", [
        data,
        { 0: 1 },
      ])
    ).id;
    await assert.rejects(
      db.query("select public.save_ebd_activity(null,$1,$2)", [
        { ...data, module_id: m2 },
        { 0: 1 },
      ]),
    );
    await assert.rejects(
      db.query(
        "insert into public.ebd_class_members(class_id,person_id,role) values($1,$2,'teacher')",
        [c2, people[1]],
      ),
    );
    await db.query("select public.set_worship_live($1,$2)", [
      service,
      { song_id: song, transpose: 2 },
    ]);
    await actor(2);
    assert.equal(
      (await one("select count(*)::int n from public.ebd_activity_keys")).n,
      0,
    );
    assert.equal(
      (await one("select count(*)::int n from public.ebd_classes")).n,
      1,
    );
    await assert.rejects(
      db.query("select * from public.ebd_directory($1)", [c2]),
    );
    await assert.rejects(db.query("select public.module_people('ebd')"));
    await assert.rejects(
      db.query("insert into public.worship_songs(title) values('Forbidden')"),
    );
    await assert.rejects(
      db.query("select public.set_worship_live($1,$2)", [
        service,
        { song_id: song },
      ]),
    );
    await db.query("select public.start_ebd_activity($1)", [activity]);
    const submission = (
      await one("select public.submit_ebd_activity($1,$2) id", [
        activity,
        { 0: 1 },
      ])
    ).id;
    assert.equal(
      Number(
        (
          await one("select score from public.ebd_submissions where id=$1", [
            submission,
          ])
        ).score,
      ),
      10,
    );
    await assert.rejects(
      db.query("select public.submit_ebd_activity($1,$2)", [
        activity,
        { 0: 0 },
      ]),
    );
    await assert.rejects(
      db.query("select public.grade_ebd_submission($1,1,'forged')", [
        submission,
      ]),
    );
    await db.query(
      "select public.create_prayer('Oração sem onboarding','private',false)",
    );
    await db.query("select public.create_family('Família pessoal')");
    await actor(4);
    assert.equal(
      (await one("select count(*)::int n from public.ebd_submissions")).n,
      0,
    );
    await actor(3);
    assert.equal(
      (await one("select count(*)::int n from public.ebd_submissions")).n,
      1,
    );
    await assert.rejects(
      db.query("select public.reply_ebd_submission($1,'forged')", [submission]),
    );
    await actor(1);
    await db.query("select public.grade_ebd_submission($1,8,'Revisado')", [
      submission,
    ]);
    await db.query(
      "insert into public.ebd_attendance(class_id,person_id,lesson_date,present) values($1,$2,current_date,true)",
      [c, people[2]],
    );
    await assert.rejects(
      db.query(
        "insert into public.ebd_attendance(class_id,person_id,lesson_date,present) values($1,$2,current_date,true)",
        [c2, people[4]],
      ),
    );
    await actor(5);
    assert.equal(
      (await one("select count(*)::int n from public.ebd_submissions")).n,
      1,
    );
    await assert.rejects(
      db.query("select public.grade_ebd_submission($1,1,'forged')", [
        submission,
      ]),
    );
    await actor(2);
    await db.query("select public.reply_ebd_submission($1,'Obrigado')", [
      submission,
    ]);
    await actor(0);
    await db.query("update public.ebd_modules set daily_limit=1 where id=$1", [
      m,
    ]);
    const nextModule = (
      await one(
        "insert into public.ebd_modules(class_id,title) values($1,'Próximo módulo') returning id",
        [c],
      )
    ).id;
    await db.query(
      "update public.ebd_class_members set next_module_id=$1 where class_id=$2 and person_id=$3",
      [nextModule, c, people[2]],
    );
    await actor(1);
    const second = (
      await one("select public.save_ebd_activity(null,$1,$2) id", [
        { ...data, title: "Segunda atividade" },
        { 0: 1 },
      ])
    ).id;
    await actor(2);
    await db.query("select public.start_ebd_activity($1)", [second]);
    await assert.rejects(
      db.query("select public.submit_ebd_activity($1,$2)", [second, { 0: 1 }]),
      /study_limit_reached/,
    );
    await assert.rejects(
      db.query("select public.advance_ebd_module($1)", [c]),
      /module_incomplete/,
    );
    await actor(1);
    await db.query("select public.save_ebd_activity($1,$2,$3)", [
      second,
      { ...data, title: "Segunda atividade", published: false },
      { 0: 1 },
    ]);
    await actor(2);
    await db.query("select public.advance_ebd_module($1)", [c]);
    assert.equal(
      (
        await one(
          "select module_id from public.ebd_class_members where class_id=$1 and person_id=$2",
          [c, people[2]],
        )
      ).module_id,
      nextModule,
    );
    await assert.rejects(
      db.query("select public.import_module_backup('louvor',$1)", [
        { people: [] },
      ]),
    );
    await actor(0);
    const bundle = {
      people: [
        {
          legacy_id: "legacy-student",
          name: "Aluno legado",
          person_id: people[2],
        },
      ],
      classes: [
        {
          legacy_id: "legacy-class",
          name: "Turma importada",
          criteria: ["Presença"],
        },
      ],
      modules: [
        {
          legacy_id: "legacy-module",
          class_legacy_id: "legacy-class",
          title: "Módulo legado",
        },
      ],
      enrollments: [
        {
          person_legacy_id: "legacy-student",
          class_legacy_id: "legacy-class",
          role: "student",
          module_legacy_id: "legacy-module",
        },
      ],
      activities: [
        {
          legacy_id: "legacy-activity",
          module_legacy_id: "legacy-module",
          title: "Questão legada",
          kind: "quiz",
          questions: [
            { prompt: "Pergunta", type: "choice", options: ["A", "B"] },
          ],
          answer_key: { 0: 1 },
        },
      ],
      history: [
        {
          legacy_id: "old-response",
          person_legacy_id: "legacy-student",
          class_legacy_id: "legacy-class",
          title: "Entrega antiga",
          score: 7,
          created_at: "2026-01-01T12:00:00Z",
        },
      ],
    };
    await db.query("select public.import_module_backup('ebd',$1)", [bundle]);
    await db.query("select public.import_module_backup('ebd',$1)", [bundle]);
    assert.equal(
      (await one("select count(*)::int n from public.ebd_legacy_history")).n,
      1,
    );
    assert.equal(
      (await one("select count(*)::int n from public.persons")).n,
      6,
    );
    assert.equal(
      (
        await one(
          "select count(*)::int n from public.role_assignments where role='admin'",
        )
      ).n,
      1,
    );
    const bad = {
      ...bundle,
      people: [{ legacy_id: "rollback-person", name: "Reverter" }],
      activities: [
        {
          ...bundle.activities[0],
          legacy_id: "invalid-activity",
          answer_key: { 0: 20 },
        },
      ],
    };
    await assert.rejects(
      db.query("select public.import_module_backup('ebd',$1)", [bad]),
    );
    assert.equal(
      (await one("select count(*)::int n from public.persons")).n,
      6,
    );
    const worshipBackup = {
      people: [
        {
          legacy_id: "legacy-musician",
          name: "Músico legado",
          person_id: people[1],
          roles: ["Abertura"],
        },
      ],
      songs: [
        { legacy_id: "legacy-song", title: "Música legada", legacy_total: 9 },
      ],
      services: [
        {
          legacy_id: "legacy-service",
          title: "Culto legado",
          starts_at: "2026-01-01T19:00:00-03:00",
          period: "noite",
          assignments: { Abertura: ["legacy-musician"] },
          playlist: ["legacy-song"],
        },
      ],
    };
    await db.query("select public.import_module_backup('louvor',$1)", [
      worshipBackup,
    ]);
    await db.query("select public.import_module_backup('louvor',$1)", [
      worshipBackup,
    ]);
    assert.equal(
      (
        await one(
          "select count(*)::int n from public.worship_songs where title='Música legada'",
        )
      ).n,
      1,
    );
    await actor(-1);
    await assert.rejects(db.query("select * from public.worship_songs"));
    await assert.rejects(
      db.query("select public.submit_ebd_activity($1,$2)", [activity, {}]),
    );
    await db.exec("reset role");
    assert.equal(
      (await one("select count(*)::int n from public.consent_events")).n,
      0,
    );
    assert.equal(
      (
        await one(
          "select count(*)::int n from public.persons where onboarded_at is not null",
        )
      ).n,
      0,
    );
    await db.query("insert into public.duty_rosters(title,source_name,source_sha256,groups,dates) values('Limpeza','Fonte teste.pdf',repeat('a',64),'[]','[]')");
    await actor(1);
    assert.equal((await one("select count(*)::int n from public.duty_rosters")).n,1);
    await assert.rejects(db.query("delete from public.duty_rosters"));
    await assert.rejects(db.query("update public.duty_rosters set title='Mudança'"));
    await actor(0);
    await assert.rejects(db.query("insert into public.duty_rosters(title,source_name,source_sha256,groups,dates) values('Outra','Fonte teste.pdf',repeat('b',64),'[]','[]')"));
    await actor(-1);
    await assert.rejects(db.query("select * from public.duty_rosters"));
  } finally {
    await db.close();
  }
});
