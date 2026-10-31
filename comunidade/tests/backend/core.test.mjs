import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("Fase 2: RLS, lotação, reservas, cancelamento e privacidade de oração", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
    );
    for (const name of [
      "202610200001_foundation.sql",
      "202610200002_core.sql",
      "202610200003_core_privacy.sql",
      "202610200004_core_content.sql",
      "202610200005_core_items.sql",
    ])
      await db.exec(
        await readFile(
          new URL(`../../backend/supabase/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
    const ids = Array.from(
      { length: 4 },
      (_, i) => `50000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    for (const id of ids)
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.exec(
      "update public.persons set full_name='Fictício',onboarded_at=now()",
    );
    const people = (
      await db.query("select id from public.persons order by auth_user_id")
    ).rows.map((r) => r.id);
    await db.query(
      "insert into public.role_assignments(person_id,role) values($1,'admin'),($2,'member'),($3,'member'),($4,'elder')",
      people,
    );
    const actor = async (index) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ids[index],
      ]);
      await db.exec("set role authenticated");
    };
    await actor(0);
    await db.exec(
      "select public.save_announcement(null,'Aviso fictício','Apenas homologação','public',true)",
    );
    await db.exec(
      "select public.save_announcement(null,'Rascunho','Não publicar','public',false)",
    );
    const event = (
      await db.query(
        "select public.save_event(null,'Encontro fictício','Teste','Local fictício',now()+interval '5 days',now()+interval '5 days 2 hours',1,'public','published') as id",
      )
    ).rows[0].id;
    const item = (
      await db.query(
        "select public.save_event_item(null,$1,'Item fictício',1) as id",
        [event],
      )
    ).rows[0].id;
    await db.exec(
      "reset role; select set_config('request.jwt.claim.sub','',false); set role anon",
    );
    assert.equal(
      (await db.query("select * from public.announcements")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from public.event_availability()")).rows.length,
      1,
    );
    await assert.rejects(
      db.query("select * from public.event_registrations"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select id from public.prayer_requests"),
      /permission denied/,
    );
    await actor(1);
    await assert.rejects(
      db.query("select public.save_announcement(null,'Xx','Xx','public',true)"),
      /unauthorized/,
    );
    await db.query("select public.register_event($1,true)", [event]);
    await db.query("select public.register_event($1,true)", [event]);
    assert.equal(
      (await db.query("select * from public.event_registrations")).rows.length,
      1,
    );
    await db.query("select public.reserve_event_item($1,1)", [item]);
    await db.query("select public.set_event_reminder($1,true)", [event]);
    await actor(2);
    await assert.rejects(
      db.query("select public.register_event($1,true)", [event]),
      /event_full/,
    );
    assert.equal(
      (await db.query("select * from public.event_registrations")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("insert into public.item_reservations values($1,$2,1)", [
        item,
        people[2],
      ]),
      /permission denied/,
    );
    await actor(0);
    await db.query(
      "select public.save_event($1,'Encontro fictício','Teste','Local',now()+interval '5 days',now()+interval '5 days 2 hours',2,'public','published')",
      [event],
    );
    await db.query("select public.save_event_item($1,$2,'Item fictício',2)", [
      item,
      event,
    ]);
    await actor(1);
    await db.query("select public.reserve_event_item($1,2)", [item]);
    await actor(0);
    await assert.rejects(
      db.query("select public.save_event_item($1,$2,'Item fictício',1)", [
        item,
        event,
      ]),
      /quantity_below_reservations/,
    );
    assert.equal(
      (
        await db.query("select quantity from public.event_items where id=$1", [
          item,
        ])
      ).rows[0].quantity,
      2,
    );
    await actor(1);
    await db.query("select public.reserve_event_item($1,1)", [item]);
    await actor(0);
    await db.query("select public.save_event_item($1,$2,'Item fictício',1)", [
      item,
      event,
    ]);
    await actor(2);
    await assert.rejects(
      db.query("select public.save_event_item($1,$2,'Alteração proibida',2)", [
        item,
        event,
      ]),
      /unauthorized/,
    );
    await db.query("select public.register_event($1,true)", [event]);
    await assert.rejects(
      db.query("select public.reserve_event_item($1,1)", [item]),
      /item_full/,
    );
    await assert.rejects(
      db.query("select public.reserve_event_item($1,-1)", [item]),
      /invalid_quantity/,
    );
    await actor(1);
    await db.query("select public.register_event($1,false)", [event]);
    assert.equal(
      (await db.query("select * from public.event_reminders")).rows[0].enabled,
      false,
    );
    await actor(2);
    await db.query("select public.reserve_event_item($1,1)", [item]);
    const mine = (
      await db.query(
        "select public.create_prayer('Pedido privado fictício','private') as id",
      )
    ).rows[0].id;
    const community = (
      await db.query(
        "select public.create_prayer('Pedido comunitário fictício','community',true) as id",
      )
    ).rows[0].id;
    const leadership = (
      await db.query(
        "select public.create_prayer('Pedido à liderança fictício','leadership') as id",
      )
    ).rows[0].id;
    await actor(1);
    assert.equal(
      (await db.query("select id from public.prayer_requests")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select public.support_prayer($1)", [mine]),
      /unauthorized/,
    );
    await assert.rejects(
      db.query("select public.answer_prayer($1,true)", [mine]),
      /unauthorized/,
    );
    await actor(3);
    assert.deepEqual(
      new Set(
        (await db.query("select id from public.prayer_requests")).rows.map(
          (r) => r.id,
        ),
      ),
      new Set([leadership, community]),
    );
    await db.query("select public.moderate_prayer($1,true)", [community]);
    await actor(1);
    assert.equal(
      (await db.query("select id from public.prayer_requests")).rows.length,
      1,
    );
    await db.query("select public.support_prayer($1)", [community]);
    await db.query("select public.support_prayer($1)", [community]);
    assert.equal(
      (await db.query("select * from public.prayer_support")).rows.length,
      1,
    );
    const feed = (await db.query("select * from public.prayer_feed()")).rows;
    assert.equal(feed[0].display_name, "An\u00f4nimo");
    assert.equal("person_id" in feed[0], false);
    await assert.rejects(
      db.query("select person_id from public.prayer_requests"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from public.event_roster($1)", [event]),
      /unauthorized/,
    );
    assert.equal(
      (await db.query("select * from public.core_notifications")).rows.length,
      0,
    );
    await actor(2);
    const notifications = (
      await db.query("select * from public.core_notifications")
    ).rows;
    assert.equal(notifications.length, 1);
    await db.query("select public.read_core_notification($1)", [
      notifications[0].id,
    ]);
    await actor(0);
    await db.query("select public.set_event_attendance($1,$2,true)", [
      event,
      people[2],
    ]);
    assert.equal(
      (
        await db.query("select * from public.event_roster($1)", [event])
      ).rows.find((r) => r.person_id === people[2]).attended,
      true,
    );
    await assert.rejects(
      db.query(
        "select public.save_event($1,'Alteração','Teste','Local',now()+interval '6 days',now()+interval '6 days 2 hours',0,'public','published','Culto')",
        [event],
      ),
      /capacity_below_registrations/,
    );
    await db.query(
      "select public.save_event($1,'Título alterado','Nova descrição','Novo local',now()+interval '6 days',now()+interval '6 days 2 hours',2,'authenticated','published','Culto')",
      [event],
    );
    assert.equal(
      (
        await db.query("select category from public.events where id=$1", [
          event,
        ])
      ).rows[0].category,
      "Culto",
    );
    await actor(0);
    await db.query(
      "select public.save_event($1,'Cancelado fictício','Teste','Local',now()+interval '5 days',now()+interval '5 days 2 hours',2,'public','canceled')",
      [event],
    );
    assert.equal(
      (
        await db.query(
          "select * from public.event_registrations where status='registered'",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.item_reservations where quantity>0",
        )
      ).rows.length,
      0,
    );
    await db.exec("reset role");
    await db.exec(
      "insert into public.content_links(kind,title,url,published,preacher,topic) select 'youtube','Vídeo '||i,'https://www.youtube.com/watch?v=ficticio',true,'Pregador fictício','Esperança' from generate_series(1,45) i",
    );
    await db.query(
      "insert into public.prayer_requests(person_id,body,visibility) select $1,'Pedido fictício '||i,'private' from generate_series(1,45) i",
      [people[2]],
    );
    await actor(2);
    const prayerPages = [];
    for (let page = 0; page < 3; page++)
      prayerPages.push(
        (await db.query("select * from public.prayer_feed_page($1)", [page]))
          .rows,
      );
    assert.deepEqual(
      prayerPages.map((p) => p.length),
      [21, 21, 8],
    );
    assert.equal(
      new Set(prayerPages.flatMap((p) => p.slice(0, 20).map((r) => r.id))).size,
      48,
    );
    assert.ok(
      prayerPages.flat().every((r) => r.is_mine && !("person_id" in r)),
    );
    await actor(1);
    assert.equal(
      (await db.query("select * from public.prayer_feed_page(1)")).rows.length,
      0,
      "Página posterior não revela pedidos privados de terceiros",
    );
    await actor(0);
    const link = (
      await db.query(
        "select public.save_content_link(null,'youtube','Culto fictício','https://youtu.be/ficticio',false,'Pessoa fictícia','Fé','2026-10-20') as id",
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query("select topic from public.content_links where id=$1", [
          link,
        ])
      ).rows[0].topic,
      "Fé",
    );
    await actor(1);
    await assert.rejects(
      db.query(
        "select public.save_content_link($1,'youtube','Alterado','https://youtu.be/ficticio',true,'Outra pessoa','Outro tema',null)",
        [link],
      ),
      /unauthorized/,
    );
    await assert.rejects(
      db.query("select * from public.prayer_feed_page(-1)"),
      /invalid_page/,
    );
    await assert.rejects(
      db.query("select * from public.event_roster_page($1,0)", [event]),
      /unauthorized/,
    );
    await db.exec(
      "reset role; select set_config('request.jwt.claim.sub','',false); set role anon",
    );
    const pages = [];
    for (let page = 0; page < 3; page++)
      pages.push(
        (
          await db.query("select * from public.browse_links($1,'esperança')", [
            page,
          ])
        ).rows,
      );
    assert.deepEqual(
      pages.map((p) => p.length),
      [21, 21, 5],
    );
    assert.equal(
      new Set(pages.flatMap((p) => p.slice(0, 20).map((r) => r.id))).size,
      45,
    );
    assert.equal(
      (await db.query("select * from public.browse_links(0,'Fé')")).rows.length,
      0,
      "Rascunho não pode vazar pela busca",
    );
    assert.equal(
      (await db.query("select * from public.browse_events(0,'','',true)")).rows
        .length,
      0,
    );
    await assert.rejects(
      db.query("select * from public.prayer_feed_page(0)"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec(
      "insert into auth.users(id) select gen_random_uuid() from generate_series(1,241)",
    );
    await db.query(
      "insert into public.event_items(event_id,name,quantity) select $1,'Item fictício '||i,1 from generate_series(1,45) i",
      [event],
    );
    await db.query(
      "insert into public.event_registrations(event_id,person_id,status) select $1,p.id,'registered' from public.persons p where p.auth_user_id<>all($2::uuid[])",
      [event, ids],
    );
    await actor(0);
    const itemPages = [];
    for (let page = 0; page < 3; page++)
      itemPages.push(
        (
          await db.query("select * from public.item_availability_page($1,$2)", [
            event,
            page,
          ])
        ).rows,
      );
    assert.deepEqual(
      itemPages.map((p) => p.length),
      [21, 21, 6],
    );
    assert.equal(
      new Set(itemPages.flatMap((p) => p.slice(0, 20).map((r) => r.id))).size,
      46,
    );
    assert.ok(itemPages.flat().every((r) => !("person_id" in r)));
    const rosterPages = [];
    for (let page = 0; page < 13; page++)
      rosterPages.push(
        (
          await db.query("select * from public.event_roster_page($1,$2)", [
            event,
            page,
          ])
        ).rows,
      );
    assert.equal(
      new Set(
        rosterPages.flatMap((p) => p.slice(0, 20).map((r) => r.person_id)),
      ).size,
      243,
    );
    assert.equal(
      rosterPages[10].length,
      21,
      "Lista de presença permite consultar além do antigo limite de 200",
    );
    await db.exec("reset role");
    assert.equal(
      (await db.query("select * from public.legal_documents where published"))
        .rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.consent_events")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
