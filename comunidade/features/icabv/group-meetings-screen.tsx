import { useRef, useState } from "react";
import { LoadingState } from "./presentation";
import { View } from "./web-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pt } from "../../packages/shared/src";
import { supabase } from "./supabase";
import { Action, Body, Card, Field, Title } from "./ui";
import { displayBrasilia, formatBrasilia, parseBrasilia } from "./event-format";

const f = pt.meetingCopy;
const gap = { gap: 8 };
type Meeting = {
  id: string;
  title: string;
  topic: string;
  location: string;
  starts_at: string;
  ends_at: string;
  status: "draft" | "published" | "canceled";
  my_status: "going" | "canceled" | null;
  my_present: boolean;
  going_count: number | null;
  present_count: number | null;
};
type Participant = {
  person_id: string;
  full_name: string;
  status: "going" | "canceled";
  present: boolean;
};
type Report = {
  planned: number;
  held: number;
  canceled: number;
  confirmations: number;
  presences: number;
};
async function rpc<T>(name: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error("unconfigured");
  const result = await supabase.rpc(name, args);
  if (result.error) throw result.error;
  return result.data as T;
}
function usePage<T>(name: string, args: Record<string, unknown>) {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["community", name, args, page],
    queryFn: () => rpc<T[]>(name, { ...args, page }),
  });
  return {
    ...query,
    data: query.data?.slice(0, 20),
    hasNext: (query.data?.length ?? 0) > 20,
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
  setPage: (page: number) => void;
  hasNext: boolean;
  isFetching: boolean;
}) {
  return page || hasNext ? (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
      }}
    >
      <Action
        secondary
        disabled={!page || isFetching}
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
  ) : null;
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
  retry: () => void;
}) {
  return pending ? (
    <LoadingState label={pt.loading} />
  ) : error ? (
    <>
      <Body>{f.loadError}</Body>
      <Action secondary onPress={retry}>
        {f.retry}
      </Action>
    </>
  ) : empty ? (
    <Body>{f.empty}</Body>
  ) : null;
}
function useAction() {
  const client = useQueryClient(),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const run = async (name: string, args: Record<string, unknown>) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await rpc(name, args);
      setMessage(f.saved);
      await client.invalidateQueries({ queryKey: ["community"] });
      return true;
    } catch (e) {
      const reason =
        e && typeof e === "object" && "message" in e ? String(e.message) : "";
      setMessage(
        reason.includes("participants_exist")
          ? f.participantsExist
          : /meeting_|attendance_|future_required/.test(reason)
            ? f.closed
            : f.error,
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, message, run };
}
export function GroupMeetings({
  unit,
  manager = false,
  participant = false,
}: {
  unit: string;
  manager?: boolean;
  participant?: boolean;
}) {
  const meetings = usePage<Meeting>("group_meeting_page", { unit });
  const action = useAction();
  const [form, setForm] = useState(false),
    [editing, setEditing] = useState<Meeting | null>(null);
  const [title, setTitle] = useState(""),
    [topic, setTopic] = useState(""),
    [location, setLocation] = useState("");
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [invalid, setInvalid] = useState(false);
  const [canceling, setCanceling] = useState<string | null>(null),
    [roster, setRoster] = useState<string | null>(null),
    [report, setReport] = useState(false);
  const reset = () => {
    setForm(false);
    setEditing(null);
    setTitle("");
    setTopic("");
    setLocation("");
    setStart("");
    setEnd("");
    setInvalid(false);
  };
  const saveExisting = (m: Meeting, status: Meeting["status"]) =>
    action.run("save_group_meeting", {
      resource: m.id,
      unit,
      title: m.title,
      topic: m.topic,
      location: m.location,
      starts_at: m.starts_at,
      ends_at: m.ends_at,
      status,
    });
  return (
    <View style={gap}>
      <Title>{f.title}</Title>
      <Body>{f.privacy}</Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Action
          secondary
          disabled={meetings.isFetching || action.busy}
          onPress={() => void meetings.refetch()}
        >
          {f.refresh}
        </Action>
        {manager && (
          <>
            <Action
              secondary
              onPress={() => {
                reset();
                setForm(true);
              }}
            >
              {f.create}
            </Action>
            <Action
              secondary
              selected={report}
              onPress={() => setReport(!report)}
            >
              {f.report}
            </Action>
          </>
        )}
      </View>
      {manager && report && <GroupMeetingReport unit={unit} />}
      {action.message ? <Body>{action.message}</Body> : null}
      {manager && form && (
        <Card>
          <Title>{editing ? f.edit : f.newTitle}</Title>
          <Field
            label={f.name}
            value={title}
            maxLength={160}
            onChangeText={setTitle}
          />
          <Field
            label={f.topic}
            value={topic}
            maxLength={1000}
            multiline
            onChangeText={setTopic}
          />
          <Field
            label={f.location}
            value={location}
            maxLength={240}
            onChangeText={setLocation}
          />
          <Field label={f.start} value={start} onChangeText={setStart} />
          <Field label={f.end} value={end} onChangeText={setEnd} />
          {invalid && <Body>{f.invalid}</Body>}
          <Action
            disabled={action.busy}
            onPress={() => {
              const starts_at =
                  editing && start === formatBrasilia(editing.starts_at)
                    ? editing.starts_at
                    : parseBrasilia(start),
                ends_at =
                  editing && end === formatBrasilia(editing.ends_at)
                    ? editing.ends_at
                    : parseBrasilia(end);
              if (
                title.trim().length < 2 ||
                !starts_at ||
                !ends_at ||
                new Date(ends_at) <= new Date(starts_at)
              ) {
                setInvalid(true);
                return;
              }
              setInvalid(false);
              void action
                .run("save_group_meeting", {
                  resource: editing?.id ?? null,
                  unit,
                  title: title.trim(),
                  topic,
                  location,
                  starts_at,
                  ends_at,
                  status: editing?.status ?? "draft",
                })
                .then((ok) => {
                  if (ok) reset();
                });
            }}
          >
            {editing ? f.saveChanges : f.save}
          </Action>
          <Action secondary disabled={action.busy} onPress={reset}>
            {f.back}
          </Action>
        </Card>
      )}
      <Load
        pending={meetings.isPending}
        error={meetings.error}
        empty={!meetings.data?.length}
        retry={() => void meetings.refetch()}
      />
      {meetings.data?.map((m) => (
        <Card key={m.id}>
          <Body>
            {m.title} · {f[m.status]}
          </Body>
          {m.topic ? <Body>{m.topic}</Body> : null}
          <Body>
            {displayBrasilia(m.starts_at)} — {displayBrasilia(m.ends_at)} ·{" "}
            {pt.timeZoneShort}
          </Body>
          {m.location ? <Body>{m.location}</Body> : null}
          {m.my_status && (
            <Body>{m.my_status === "going" ? f.going : f.notGoing}</Body>
          )}
          {m.my_status === "going" && new Date(m.starts_at) <= new Date() && (
            <Body>{m.my_present ? f.present : f.absent}</Body>
          )}
          {participant &&
            m.status === "published" &&
            new Date(m.starts_at) > new Date() && (
              <Action
                requiresProfile
                secondary={m.my_status === "going"}
                disabled={action.busy}
                onPress={() =>
                  void action.run("respond_group_meeting", {
                    meeting: m.id,
                    participate: m.my_status !== "going",
                  })
                }
              >
                {m.my_status === "going" ? f.withdraw : f.confirm}
              </Action>
            )}
          {manager && (
            <>
              <Body>
                {f.goingCount}: {m.going_count ?? 0} · {f.presentCount}:{" "}
                {m.present_count ?? 0}
              </Body>
              {m.status !== "canceled" && (
                <>
                  <Action
                    secondary
                    disabled={action.busy}
                    onPress={() => {
                      setEditing(m);
                      setTitle(m.title);
                      setTopic(m.topic);
                      setLocation(m.location);
                      setStart(formatBrasilia(m.starts_at));
                      setEnd(formatBrasilia(m.ends_at));
                      setForm(true);
                      setInvalid(false);
                    }}
                  >
                    {f.edit}
                  </Action>
                  {new Date(m.starts_at) > new Date() && (
                    <>
                      <Action
                        secondary
                        disabled={action.busy}
                        onPress={() =>
                          void saveExisting(
                            m,
                            m.status === "draft" ? "published" : "draft",
                          )
                        }
                      >
                        {m.status === "draft" ? f.publish : f.unpublish}
                      </Action>
                      {canceling === m.id ? (
                        <>
                          <Body>{f.cancelHint}</Body>
                          <Action
                            disabled={action.busy}
                            onPress={() =>
                              void saveExisting(m, "canceled").then((ok) => {
                                if (ok) setCanceling(null);
                              })
                            }
                          >
                            {f.confirmCancel}
                          </Action>
                          <Action
                            secondary
                            disabled={action.busy}
                            onPress={() => setCanceling(null)}
                          >
                            {f.back}
                          </Action>
                        </>
                      ) : (
                        <Action
                          secondary
                          disabled={action.busy}
                          onPress={() => setCanceling(m.id)}
                        >
                          {f.cancel}
                        </Action>
                      )}
                    </>
                  )}
                </>
              )}
              <Action
                secondary
                onPress={() => setRoster(roster === m.id ? null : m.id)}
              >
                {roster === m.id ? f.back : f.roster}
              </Action>
              {roster === m.id && <MeetingRoster key={m.id} meeting={m} />}
            </>
          )}
        </Card>
      ))}
      <Pages {...meetings} />
    </View>
  );
}
function MeetingRoster({ meeting }: { meeting: Meeting }) {
  const roster = usePage<Participant>("group_meeting_roster", {
    meeting: meeting.id,
  });
  const action = useAction();
  return (
    <View style={gap}>
      <Body>{f.attendanceHint}</Body>
      {action.message ? <Body>{action.message}</Body> : null}
      <Load
        pending={roster.isPending}
        error={roster.error}
        empty={!roster.data?.length}
        retry={() => void roster.refetch()}
      />
      {roster.data?.map((p) => (
        <Card key={p.person_id}>
          <Body>
            {p.full_name} · {p.status === "going" ? f.goingCount : f.notGoing}
          </Body>
          <Body>{p.present ? f.present : f.absent}</Body>
          {p.status === "going" &&
            meeting.status === "published" &&
            new Date(meeting.starts_at) <= new Date() && (
              <Action
                secondary
                disabled={action.busy}
                onPress={() =>
                  void action.run("set_group_meeting_attendance", {
                    meeting: meeting.id,
                    person: p.person_id,
                    present: !p.present,
                  })
                }
              >
                {p.present ? f.unmark : f.mark}
              </Action>
            )}
        </Card>
      ))}
      <Pages {...roster} />
    </View>
  );
}
function GroupMeetingReport({ unit }: { unit: string }) {
  const [year, setYear] = useState(() =>
    Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
      }).format(new Date()),
    ),
  );
  const [input, setInput] = useState(String(year));
  const [invalid, setInvalid] = useState(false);
  const report = useQuery({
    queryKey: ["community", "group_meeting_report", unit, year],
    queryFn: () => rpc<Report[]>("group_meeting_report", { unit, year }),
  });
  return (
    <Card>
      <Title>{f.report}</Title>
      <Field
        label={f.year}
        value={input}
        keyboardType="number-pad"
        maxLength={4}
        onChangeText={setInput}
      />
      <Action
        secondary
        onPress={() => {
          if (
            !/^\d{4}$/.test(input) ||
            Number(input) < 2000 ||
            Number(input) > 2100
          ) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          setYear(Number(input));
        }}
      >
        {f.showReport}
      </Action>
      {invalid && <Body>{pt.invalidData}</Body>}
      <Body>{f.reportHint}</Body>
      <Load
        pending={report.isPending}
        error={report.error}
        empty={!report.data?.length}
        retry={() => void report.refetch()}
      />
      {report.data?.map((r, i) => (
        <View key={i} style={gap}>
          <Body>
            {f.year}: {year}
          </Body>
          {(
            [
              "planned",
              "held",
              "canceled",
              "confirmations",
              "presences",
            ] as const
          ).map((k) => (
            <Body key={k}>
              {k === "canceled" ? f.canceledCount : f[k]}: {r[k]}
            </Body>
          ))}
        </View>
      ))}
    </Card>
  );
}
