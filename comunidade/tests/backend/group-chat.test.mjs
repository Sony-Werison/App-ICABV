import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";

test("mensagens de grupo: oito perfis, revisão, retirada, denúncias privadas, idempotência e cursor", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;",
    );
    for (const file of [
      "202610200001_foundation.sql",
      "202610200002_core.sql",
      "202610210007_community.sql",
      "202610210010_group_chat.sql",
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
      (_, i) => `93000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
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
    const feed = async (unit, cursor = null, review = false) =>
      call("select * from public.group_chat_page($1,$2,$3)", [
        unit,
        cursor,
        review,
      ]);
    const send = async (unit, body, nonce = randomUUID()) =>
      (
        await call("select public.send_group_message($1,$2,$3) id", [
          unit,
          body,
          nonce,
        ])
      )[0].id;
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
    for (let i = 0; i < roles.length; i++) {
      await actor(i);
      if (![3, 4, 7].includes(i)) {
        await assert.rejects(feed(group), /unauthorized/);
        await assert.rejects(send(group, "Teste"), /unauthorized/);
      }
      await assert.rejects(
        db.query("select * from public.group_chat_messages"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select * from public.group_chat_reports"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select private.group_chat_access($1)", [group]),
        /permission denied/,
      );
    }
    await actor(3);
    await assert.rejects(feed(other), /unauthorized/);
    await assert.rejects(send(dept, "Teste"), /unauthorized/);
    for (const i of [0, 1, 2]) {
      await actor(i);
      await call("select public.request_community_membership($1,true)", [
        group,
      ]);
      await assert.rejects(feed(group), /unauthorized/);
      await actor(7);
      await call("select public.decide_community_membership($1,$2,true)", [
        group,
        people[i],
      ]);
    }
    await actor(0);
    const nonce = randomUUID(),
      message = await send(group, "Mensagem fictícia", nonce);
    assert.equal(await send(group, "Mensagem fictícia", nonce), message);
    await assert.rejects(
      send(group, "Outro conteúdo", nonce),
      /nonce_conflict/,
    );
    assert.equal((await feed(group))[0].status, "pending");
    await assert.rejects(feed(group, null, true), /unauthorized/);
    await assert.rejects(send(group, " ".repeat(10)), /invalid_message/);
    await assert.rejects(send(group, "X".repeat(2001)), /invalid_message/);
    await actor(1);
    assert.equal((await feed(group)).length, 0);
    await assert.rejects(feed(group, message), /invalid_cursor/);
    await assert.rejects(
      db.query("select public.withdraw_group_message($1)", [message]),
      /unauthorized/,
    );
    await assert.rejects(
      db.query("select public.moderate_group_message($1,true)", [message]),
      /unauthorized/,
    );
    await assert.rejects(
      db.query("select public.report_group_message($1,'spam')", [message]),
      /unauthorized/,
    );
    await actor(3);
    assert.equal((await feed(group, null, true)).length, 1);
    await call("select public.moderate_group_message($1,true)", [message]);
    await actor(1);
    let visible = (await feed(group))[0];
    assert.equal(visible.body, "Mensagem fictícia");
    assert.equal(visible.report_count, null);
    assert.equal(visible.report_reasons, null);
    assert.ok(!("author_id" in visible));
    await call("select public.report_group_message($1,'privacy')", [message]);
    await call("select public.report_group_message($1,'spam')", [message]);
    await actor(3);
    const reported = (await feed(group, null, true))[0];
    assert.equal(Number(reported.report_count), 1);
    assert.deepEqual(reported.report_reasons, ["privacy"]);
    assert.ok(!("person_id" in reported));
    await call("select public.moderate_group_message($1,false)", [message]);
    assert.equal(Number((await feed(group, null, true))[0].report_count), 0);
    await actor(1);
    assert.equal((await feed(group)).length, 0);
    await actor(0);
    await call("select public.withdraw_group_message($1)", [message]);
    await actor(1);
    visible = (await feed(group))[0];
    assert.equal(visible.body, null);
    assert.equal(visible.author_name, null);
    assert.equal(visible.status, "withdrawn");
    await actor(3);
    await assert.rejects(
      db.query("select public.moderate_group_message($1,true)", [message]),
      /message_withdrawn/,
    );
    const managerMessage = await send(group, "Mensagem do responsável");
    assert.equal(
      (await feed(group)).find((m) => m.id === managerMessage).status,
      "published",
    );
    await actor(0);
    const privateMessage = await send(group, "Rascunho retirado");
    await call("select public.withdraw_group_message($1)", [privateMessage]);
    await actor(1);
    assert.equal(
      (await feed(group)).some((m) => m.id === privateMessage),
      false,
    );
    // A cursor stays stable if a newer message is inserted between requests.
    await db.exec("reset role");
    await db.query(
      "insert into public.group_chat_messages(unit_id,author_id,client_nonce,body,status,ever_published,created_at) select $1,$2,gen_random_uuid(),'Página '||i,'published',true,now()-make_interval(secs=>i) from generate_series(1,35) i",
      [group, people[3]],
    );
    await actor(1);
    const first = (await feed(group)).slice(0, 20);
    assert.equal(first.length, 20);
    await db.exec("reset role");
    await db.query(
      "insert into public.group_chat_messages(unit_id,author_id,client_nonce,body,status,ever_published) values($1,$2,gen_random_uuid(),'Nova publicação','published',true)",
      [group, people[3]],
    );
    await actor(1);
    const second = (await feed(group, first.at(-1).id)).slice(0, 20);
    assert.equal(
      second.some((m) => first.some((p) => p.id === m.id)),
      false,
    );
    await assert.rejects(feed(group, randomUUID()), /invalid_cursor/);
    await actor(2);
    for (let i = 0; i < 5; i++) await send(group, "Limite " + i);
    await assert.rejects(send(group, "Excesso"), /message_rate_limit/);
    await actor(3);
    await call("select public.decide_community_membership($1,$2,false)", [
      group,
      people[1],
    ]);
    await actor(1);
    await assert.rejects(feed(group), /unauthorized/);
    await assert.rejects(send(group, "Sem acesso"), /unauthorized/);
    await actor(7);
    await call("select public.set_community_leader($1,$2,false)", [
      group,
      people[3],
    ]);
    await actor(3);
    await assert.rejects(feed(group, null, true), /unauthorized/);
    await db.exec("reset role;set role anon");
    await assert.rejects(feed(group), /permission denied/);
  } finally {
    await db.close();
  }
});
