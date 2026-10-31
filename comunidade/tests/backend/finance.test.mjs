import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("financeiro simulado: oito perfis, privacidade, idempotência, eventos fora de ordem e estornos", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
    );
    for (const name of [
      "202610200001_foundation.sql",
      "202610200002_core.sql",
      "202610200006_finance_demo.sql",
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
      (_, i) => `70000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    for (const user of users)
      await db.query("insert into auth.users(id) values($1)", [user]);
    await db.exec(
      "update public.persons set onboarded_at=now(),full_name='Pessoa fictícia'",
    );
    for (let i = 0; i < roles.length; i++)
      await db.query(
        "insert into public.role_assignments(person_id,role) select id,$1 from public.persons where auth_user_id=$2",
        [roles[i], users[i]],
      );
    const actor = async (i) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        users[i],
      ]);
      await db.exec("set role authenticated");
    };
    await actor(0);
    await assert.rejects(
      db.query(
        "select public.create_demo_contribution(gen_random_uuid(),2500,gen_random_uuid())",
      ),
      /demo_disabled/,
    );
    await assert.rejects(
      db.query("update public.finance_demo_settings set enabled=true"),
      /permission denied/,
    );
    await db.exec(
      "reset role; update public.finance_demo_settings set enabled=true",
    );
    await actor(7);
    const campaign = (
      await db.query(
        "select public.save_demo_campaign(null,'Campanha fictícia','Somente demonstração',500000,true) as id",
      )
    ).rows[0].id;
    const request = "71000000-0000-4000-8000-000000000001";
    await actor(0);
    const donation = (
      await db.query(
        "select public.create_demo_contribution($1,2500,$2) as id",
        [campaign, request],
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query(
          "select public.create_demo_contribution($1,2500,$2) as id",
          [campaign, request],
        )
      ).rows[0].id,
      donation,
    );
    await assert.rejects(
      db.query("select public.create_demo_contribution($1,2501,$2)", [
        campaign,
        request,
      ]),
      /idempotency_conflict/,
    );
    const event = "72000000-0000-4000-8000-000000000001";
    await db.query("select public.simulate_finance_event($1,$2,'settled')", [
      donation,
      event,
    ]);
    await db.query("select public.simulate_finance_event($1,$2,'settled')", [
      donation,
      event,
    ]);
    assert.equal(
      (await db.query("select * from public.demo_campaign_progress()")).rows[0]
        .total_cents,
      2500,
    );
    await assert.rejects(
      db.query("select public.simulate_finance_event($1,$2,'refunded')", [
        donation,
        event,
      ]),
      /idempotency_conflict/,
    );
    await db.query(
      "select public.simulate_finance_event($1,gen_random_uuid(),'refunded')",
      [donation],
    );
    await db.query(
      "select public.simulate_finance_event($1,gen_random_uuid(),'settled')",
      [donation],
    );
    assert.equal(
      (
        await db.query(
          "select status from public.finance_demo_contributions where id=$1",
          [donation],
        )
      ).rows[0].status,
      "refunded",
    );
    assert.equal(
      (await db.query("select * from public.demo_campaign_progress()")).rows[0]
        .total_cents,
      0,
    );
    const late = (
      await db.query(
        "select public.create_demo_contribution($1,5000,gen_random_uuid()) as id",
        [campaign],
      )
    ).rows[0].id;
    await db.query(
      "select public.simulate_finance_event($1,gen_random_uuid(),'refunded')",
      [late],
    );
    await db.query(
      "select public.simulate_finance_event($1,gen_random_uuid(),'settled')",
      [late],
    );
    assert.equal(
      (await db.query("select * from public.demo_campaign_progress()")).rows[0]
        .total_cents,
      0,
    );
    const annual = (
      await db.query(
        "select * from public.my_demo_year(extract(year from now() at time zone 'America/Sao_Paulo')::integer)",
      )
    ).rows[0];
    assert.equal(annual.received_cents, 7500);
    assert.equal(annual.refunded_cents, 7500);
    assert.equal(annual.net_cents, 0);
    assert.equal(
      (await db.query("select * from public.my_demo_contributions(0)")).rows
        .length,
      2,
    );
    await assert.rejects(
      db.query("select * from public.my_demo_year(1999)"),
      /invalid_year/,
    );
    for (let i = 0; i < roles.length; i++) {
      await actor(i);
      const canRead = i >= 5,
        canWrite = i === 5 || i === 7;
      if (canRead)
        assert.equal(
          (await db.query("select * from public.demo_finance_report(0)")).rows
            .length,
          4,
        );
      else
        await assert.rejects(
          db.query("select * from public.demo_finance_report(0)"),
          /unauthorized/,
        );
      if (i > 0 && !canRead)
        assert.equal(
          (await db.query("select * from public.finance_demo_contributions"))
            .rows.length,
          0,
        );
      if (!canWrite)
        await assert.rejects(
          db.query(
            "select public.record_demo_cash('income',1000,'Fictício','Teste',gen_random_uuid())",
          ),
          /unauthorized/,
        );
      if (i > 0)
        await assert.rejects(
          db.query(
            "select public.simulate_finance_event($1,gen_random_uuid(),'settled')",
            [donation],
          ),
          /unauthorized/,
        );
      await assert.rejects(
        db.query("delete from public.finance_demo_ledger"),
        /permission denied/,
      );
      await assert.rejects(
        db.query(
          "update public.finance_demo_contributions set status='settled'",
        ),
        /permission denied/,
      );
    }
    await actor(5);
    const cash = (
      await db.query(
        "select public.record_demo_cash('expense',1250,'Despesa fictícia','Teste',$1) as id",
        [request],
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query(
          "select public.record_demo_cash('expense',1250,'Despesa fictícia','Teste',$1) as id",
          [request],
        )
      ).rows[0].id,
      cash,
    );
    await db.query("select public.reverse_demo_cash($1)", [cash]);
    await db.query("select public.reverse_demo_cash($1)", [cash]);
    assert.equal(
      (await db.query("select * from public.demo_finance_totals()")).rows[0]
        .balance_cents,
      0,
    );
    await db.exec(
      "reset role;select set_config('request.jwt.claim.sub','',false);set role anon",
    );
    await assert.rejects(
      db.query("select * from public.finance_demo_contributions"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.finance_demo_enabled()"),
      /permission denied/,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select * from public.finance_demo_ledger where contribution_id=$1",
          [donation],
        )
      ).rows.length,
      2,
    );
    assert.equal(
      (await db.query("select * from public.consent_events")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
