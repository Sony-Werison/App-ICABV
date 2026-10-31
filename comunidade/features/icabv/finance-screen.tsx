import { useRef, useState } from "react";
import { LoadingState } from "./presentation";
import { View } from "./web-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
const randomUUID = () => crypto.randomUUID();
import { pt } from "../../packages/shared/src";
import { supabase } from "./supabase";
import { displayBrasilia } from "./event-format";
import { Action, Body, Card, Field, Title } from "./ui";
import { brl, parseBRL, type DemoLedgerRow } from "./finance-format";

const f = pt.financeCopy;
const gap = { gap: 8 };
type Campaign = {
  id: string;
  title: string;
  description: string;
  goal_cents: number;
  active: boolean;
};
type Contribution = {
  id: string;
  campaign_id: string;
  amount_cents: number;
  status: keyof typeof f.status;
  created_at: string;
};
async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  if (!supabase) throw new Error("unconfigured");
  const r = await supabase.rpc(name, args);
  if (r.error) throw r.error;
  return r.data as T;
}
function usePage<T>(name: string, args: Record<string, unknown> = {}) {
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["finance-demo", name, args, page],
    queryFn: () => rpc<T[]>(name, { ...args, page }),
  });
  return {
    ...q,
    data: q.data?.slice(0, 20),
    hasNext: (q.data?.length ?? 0) > 20,
    page,
    setPage,
  };
}
function Pages({
  page,
  setPage,
  hasNext,
  isFetching,
}: {
  page: number;
  setPage: (p: number) => void;
  hasNext: boolean;
  isFetching: boolean;
}) {
  if (!page && !hasNext) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Action
        secondary
        disabled={page === 0 || isFetching}
        onPress={() => setPage(page - 1)}
      >
        {f.previous}
      </Action>
      <Body>
        {f.page} {page + 1}
      </Body>
      <Action
        secondary
        disabled={!hasNext || isFetching}
        onPress={() => setPage(page + 1)}
      >
        {f.next}
      </Action>
    </View>
  );
}
function Load({
  pending,
  error,
  empty,
  retry,
}: {
  pending: boolean;
  error: unknown;
  empty: boolean;
  retry: () => unknown;
}) {
  return pending ? (
    <LoadingState label={pt.loading} />
  ) : error ? (
    <>
      <Body>{f.loadError}</Body>
      <Action secondary onPress={() => void retry()}>
        {f.retry}
      </Action>
    </>
  ) : empty ? (
    <Body>{f.empty}</Body>
  ) : null;
}
function useAction() {
  const cache = useQueryClient();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (name: string, args: Record<string, unknown>) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await rpc(name, args);
      setMessage(f.saved);
      await cache.invalidateQueries({ queryKey: ["finance-demo"] });
      return true;
    } catch {
      setMessage(f.error);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, message, run };
}
export function FinanceDemoScreen({
  management = false,
  canWrite = false,
}: {
  management?: boolean;
  canWrite?: boolean;
}) {
  const enabled = useQuery({
    queryKey: ["finance-demo", "enabled"],
    queryFn: () => rpc<boolean>("finance_demo_enabled"),
  });
  return (
    <View style={gap}>
      <Title>{management ? pt.finance : pt.offerings}</Title>
      <Body>{f.notice}</Body>
      <Body>{f.realPending}</Body>
      <Load
        pending={enabled.isPending}
        error={enabled.error}
        empty={false}
        retry={() => enabled.refetch()}
      />
      {enabled.data === false && <Body>{f.disabled}</Body>}
      {enabled.data === true &&
        (management ? <Management canWrite={canWrite} /> : <Offerings />)}
    </View>
  );
}
function Offerings() {
  const campaigns = usePage<Campaign>("demo_campaign_page", {
    include_inactive: false,
  });
  const history = usePage<Contribution>("my_demo_contributions");
  const progress = useQuery({
    queryKey: ["finance-demo", "progress", campaigns.data?.map((c) => c.id)],
    enabled: Boolean(campaigns.data?.length),
    queryFn: () =>
      rpc<{ campaign_id: string; total_cents: number }[]>(
        "demo_campaign_progress",
        { campaigns: campaigns.data?.map((c) => c.id) ?? [] },
      ),
  });
  const action = useAction();
  const [amount, setAmount] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const request = useRef<{
    campaign: string;
    amount: number;
    id: string;
  } | null>(null);
  const events = useRef(new Map<string, string>());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const validYear = /^20\d{2}$/.test(year) || year === "2100";
  const annual = useQuery({
    queryKey: ["finance-demo", "year", year],
    enabled: validYear,
    queryFn: () =>
      rpc<
        { received_cents: number; refunded_cents: number; net_cents: number }[]
      >("my_demo_year", { year: Number(year) }),
  });
  const cents = parseBRL(amount);
  const simulate = (p: Contribution, status: "settled" | "refunded") => {
    const key = `${p.id}:${status}`;
    const id = events.current.get(key) ?? randomUUID();
    events.current.set(key, id);
    void action.run("simulate_finance_event", {
      contribution: p.id,
      event: id,
      new_status: status,
    });
  };
  return (
    <View style={gap}>
      <Title>{f.campaigns}</Title>
      <Load
        pending={campaigns.isPending}
        error={campaigns.error}
        empty={!campaigns.data?.length}
        retry={() => campaigns.refetch()}
      />
      {campaigns.data?.map((c) => (
        <Card key={c.id}>
          <Body>{c.title}</Body>
          <Body>{c.description}</Body>
          <Body>
            {f.goal}: {brl(c.goal_cents)} · {f.raised}:{" "}
            {progress.isPending || progress.error
              ? "—"
              : brl(
                  progress.data?.find((p) => p.campaign_id === c.id)
                    ?.total_cents ?? 0,
                )}
          </Body>
          <Action
            secondary={selected !== c.id}
            selected={selected === c.id}
            onPress={() => setSelected(c.id)}
          >
            {selected === c.id ? f.selectedCampaign : f.selectCampaign}
          </Action>
        </Card>
      ))}
      <Pages {...campaigns} />
      <Field
        label={f.amount}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={12}
      />
      <Action
        disabled={action.busy || !selected || !cents || cents > 10000000}
        onPress={() => {
          if (!selected || !cents) return;
          if (
            request.current?.campaign !== selected ||
            request.current?.amount !== cents
          )
            request.current = {
              campaign: selected,
              amount: cents,
              id: randomUUID(),
            };
          void action
            .run("create_demo_contribution", {
              campaign: selected,
              amount: cents,
              request: request.current.id,
            })
            .then((ok) => {
              if (ok) {
                request.current = null;
                setAmount("");
                history.setPage(0);
              }
            });
        }}
      >
        {f.create}
      </Action>
      {action.message ? <Body>{action.message}</Body> : null}
      <Title>{f.history}</Title>
      <Load
        pending={history.isPending}
        error={history.error}
        empty={!history.data?.length}
        retry={() => history.refetch()}
      />
      {history.data?.map((p) => (
        <Card key={p.id}>
          <Body>
            {brl(p.amount_cents)} · {f.status[p.status]}
          </Body>
          <Body>
            {displayBrasilia(p.created_at)} · {pt.timeZoneShort}
          </Body>
          {p.status === "pending" && (
            <Action
              secondary
              disabled={action.busy}
              onPress={() => simulate(p, "settled")}
            >
              {f.settle}
            </Action>
          )}
          {p.status === "settled" && (
            <Action
              secondary
              disabled={action.busy}
              onPress={() => simulate(p, "refunded")}
            >
              {f.refund}
            </Action>
          )}
          {p.status !== "pending" && (
            <Action
              secondary
              onPress={() => setReceipt(receipt === p.id ? null : p.id)}
            >
              {f.receipt}
            </Action>
          )}
          {receipt === p.id && (
            <>
              <Body>{f.notice}</Body>
              <Body>
                {p.id} · {brl(p.amount_cents)} · {f.status[p.status]}
              </Body>
              <Body>{f.noFiscal}</Body>
            </>
          )}
        </Card>
      ))}
      <Pages {...history} />
      <Title>{f.yearly}</Title>
      <Field
        label={f.year}
        value={year}
        onChangeText={setYear}
        keyboardType="number-pad"
        maxLength={4}
      />
      <Body>{f.noFiscal}</Body>
      {validYear && (
        <>
          <Load
            pending={annual.isPending}
            error={annual.error}
            empty={false}
            retry={() => annual.refetch()}
          />
          {annual.data?.map((a, i) => (
            <Body key={i}>
              {f.received}: {brl(a.received_cents)} · {f.refunded}:{" "}
              {brl(a.refunded_cents)} · {f.balance}: {brl(a.net_cents)}
            </Body>
          ))}
        </>
      )}
    </View>
  );
}
function Management({ canWrite }: { canWrite: boolean }) {
  const action = useAction();
  const campaigns = usePage<Campaign>("demo_campaign_page", {
    include_inactive: true,
  });
  const ledger = usePage<DemoLedgerRow>("demo_finance_report");
  const totals = useQuery({
    queryKey: ["finance-demo", "totals"],
    queryFn: () =>
      rpc<
        { income_cents: number; expense_cents: number; balance_cents: number }[]
      >("demo_finance_totals"),
  });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState("income");
  const [exportError, setExportError] = useState("");
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const cents = parseBRL(amount);
  const goalCents = parseBRL(goal);
  return (
    <View style={gap}>
      <Title>{f.report}</Title>
      <Load
        pending={totals.isPending}
        error={totals.error}
        empty={false}
        retry={() => totals.refetch()}
      />
      {totals.data?.map((t, i) => (
        <Body key={i}>
          {f.income}: {brl(t.income_cents)} · {f.expense}:{" "}
          {brl(t.expense_cents)} · {f.balance}: {brl(t.balance_cents)}
        </Body>
      ))}
      {canWrite && (
        <>
          <Field
            label={f.campaignTitle}
            value={title}
            onChangeText={setTitle}
            maxLength={160}
          />
          <Field
            label={f.description}
            value={description}
            onChangeText={setDescription}
            maxLength={2000}
            multiline
          />
          <Field
            label={f.campaignGoal}
            value={goal}
            onChangeText={setGoal}
            keyboardType="decimal-pad"
          />
          <Action
            disabled={action.busy || title.trim().length < 2 || !goalCents}
            onPress={() =>
              void action
                .run("save_demo_campaign", {
                  resource: null,
                  title: title.trim(),
                  description,
                  goal: goalCents,
                  active: false,
                })
                .then((ok) => {
                  if (ok) {
                    setTitle("");
                    setDescription("");
                    setGoal("");
                    campaigns.setPage(0);
                  }
                })
            }
          >
            {f.campaignSave}
          </Action>
        </>
      )}
      <Load
        pending={campaigns.isPending}
        error={campaigns.error}
        empty={!campaigns.data?.length}
        retry={() => campaigns.refetch()}
      />
      {campaigns.data?.map((c) => (
        <Card key={c.id}>
          <Body>
            {c.title} · {brl(c.goal_cents)}
          </Body>
          {canWrite && (
            <Action
              secondary
              disabled={action.busy}
              onPress={() =>
                void action.run("save_demo_campaign", {
                  resource: c.id,
                  title: c.title,
                  description: c.description,
                  goal: c.goal_cents,
                  active: !c.active,
                })
              }
            >
              {c.active ? f.deactivate : f.activate}
            </Action>
          )}
        </Card>
      ))}
      <Pages {...campaigns} />
      {canWrite && (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Action
              selected={direction === "income"}
              secondary={direction !== "income"}
              onPress={() => setDirection("income")}
            >
              {f.income}
            </Action>
            <Action
              selected={direction === "expense"}
              secondary={direction !== "expense"}
              onPress={() => setDirection("expense")}
            >
              {f.expense}
            </Action>
          </View>
          <Field
            label={f.amount}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <Field
            label={f.description}
            value={note}
            onChangeText={setNote}
            maxLength={240}
          />
          <Field
            label={f.category}
            value={category}
            onChangeText={setCategory}
            maxLength={80}
          />
          <Action
            disabled={
              action.busy ||
              !cents ||
              note.trim().length < 2 ||
              category.trim().length < 2
            }
            onPress={() => {
              const fingerprint = JSON.stringify([
                direction,
                cents,
                note.trim(),
                category.trim(),
              ]);
              if (request.current?.fingerprint !== fingerprint)
                request.current = { fingerprint, id: randomUUID() };
              void action
                .run("record_demo_cash", {
                  direction,
                  amount: cents,
                  description: note.trim(),
                  category: category.trim(),
                  request: request.current.id,
                })
                .then((ok) => {
                  if (ok) {
                    request.current = null;
                    setAmount("");
                    setNote("");
                    setCategory("");
                    ledger.setPage(0);
                  }
                });
            }}
          >
            {f.record}
          </Action>
        </>
      )}
      {action.message ? <Body>{action.message}</Body> : null}
      <Load
        pending={ledger.isPending}
        error={ledger.error}
        empty={!ledger.data?.length}
        retry={() => ledger.refetch()}
      />
      {ledger.data?.map((r) => (
        <Card key={r.id}>
          <Body>
            {brl(r.amount_cents)} · {f.kinds[r.kind]}
            {r.category ? ` · ${r.category}` : ""}
            {r.description ? ` · ${r.description}` : ""}
          </Body>
          <Body>
            {displayBrasilia(r.created_at)} · {pt.timeZoneShort}
          </Body>
          {canWrite && ["income", "expense"].includes(r.kind) && (
            <Action
              secondary
              disabled={action.busy}
              onPress={() =>
                void action.run("reverse_demo_cash", { entry: r.id })
              }
            >
              {f.reverse}
            </Action>
          )}
        </Card>
      ))}
      <Pages {...ledger} />
      <Action
        secondary
        disabled={!ledger.data?.length || ledger.isFetching}
        onPress={() => {
          setExportError("");
          void import("./export-finance")
            .then((m) => m.exportDemoFinance(ledger.data ?? []))
            .catch(() => setExportError(f.exportError));
        }}
      >
        {f.export}
      </Action>
      {exportError ? <Body>{exportError}</Body> : null}
    </View>
  );
}
