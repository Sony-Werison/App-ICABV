import { useEffect, useRef, useState } from "react";
import { LoadingState } from "./presentation";
import { ScheduleBoard } from "./schedule-board";
import { loadSchedulePages, scheduleDate } from "./schedule-model";
import { View } from "./web-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pt } from "../../packages/shared/src";
import { supabase } from "./supabase";
import { Action, Body, Card, Field, Title } from "./ui";
import { displayBrasilia, parseBrasilia } from "./event-format";
import { GroupMeetings } from "./group-meetings-screen";
import { GroupChat } from "./group-chat-screen";
import {RecordTitle} from "./record-title";
import {Clock,MapPin} from 'lucide-react';
const x = pt.exchangeCopy;
const f = pt.communityCopy,
  gap = { gap: 8 };
type MemberStatus = keyof typeof f.membership;
type AssignmentStatus = keyof typeof f.assignment;
type Unit = {
  id: string;
  title: string;
  description: string;
  schedule: string;
  meeting_point: string;
  published: boolean;
  my_status: MemberStatus | null;
  is_manager: boolean;
};
type Shift = {
  id: string;
  unit_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  canceled: boolean;
};
type Member = { person_id: string; full_name: string; status: MemberStatus };
type Assignment = {
  id: string;
  person_id: string;
  full_name: string;
  status: AssignmentStatus;
  attended: boolean;
};
type Mine = {
  id: string;
  unit_title: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: AssignmentStatus;
  attended: boolean;
  canceled: boolean;
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
    queryKey: ["community", name, args, page],
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
  setPage: (n: number) => void;
  hasNext: boolean;
  isFetching: boolean;
}) {
  return !page && !hasNext ? null : (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
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
        reason.includes("shift_full")
          ? f.full
          : reason.includes("active_membership_required")
            ? f.membershipRequired
            : reason.includes("capacity_below_assignments")
              ? f.capacityTooSmall
              : reason.includes("shift_closed")
                ? f.closed
                : reason.includes("already_assigned")
                  ? x.alreadyAssigned
                  : reason.includes("exchange_")
                    ? x.changed
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
export function CommunityScreen({
  kind,
  canCreate = false,
}: {
  kind: "group" | "department";
  canCreate?: boolean;
}) {
  const [view, setView] = useState<"units" | "mine" | "exchanges">("units");
  return (
    <View style={gap}>
      <Title>{kind === "group" ? f.groups : f.departments}</Title>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Action
          secondary={view !== "units"}
          selected={view === "units"}
          onPress={() => setView("units")}
        >
          {kind === "group" ? f.groups : f.departments}
        </Action>
        <Action
          secondary={view !== "mine"}
          selected={view === "mine"}
          onPress={() => setView("mine")}
        >
          {f.myShifts}
        </Action>
        <Action
          secondary={view !== "exchanges"}
          selected={view === "exchanges"}
          onPress={() => setView("exchanges")}
        >
          {x.title}
        </Action>
      </View>
      {view === "exchanges" ? (
        <ServiceExchanges />
      ) : view === "mine" ? (
        <MyServiceShifts />
      ) : (
        <Units key={kind} kind={kind} canCreate={canCreate} />
      )}
    </View>
  );
}
function Units({
  kind,
  canCreate,
}: {
  kind: "group" | "department";
  canCreate: boolean;
}) {
  const [search, setSearch] = useState(""),
    [expanded, setExpanded] = useState<string | null>(null),
    [leaving, setLeaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<Unit | null>(null),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [schedule, setSchedule] = useState(""),
    [meeting, setMeeting] = useState("");
  const [creating, setCreating] = useState(false);
  const [meetingsUnit, setMeetingsUnit] = useState<string | null>(null);
  const [chatUnit, setChatUnit] = useState<string | null>(null);
  const units = usePage<Unit>("community_page", { kind, search });
  const action = useAction();
  const reset = () => {
    setEditing(null);
    setCreating(false);
    setTitle("");
    setDescription("");
    setSchedule("");
    setMeeting("");
  };
  return (
    <View style={gap}>
      <Field
        label={f.search}
        value={search}
        onChangeText={(v) => {
          setSearch(v);
          units.setPage(0);
        }}
        maxLength={160}
        placeholder={kind==='group'?'Buscar grupo…':'Buscar equipe…'}
      />
      {canCreate && !creating && !editing && (
        <Action onPress={() => setCreating(true)}>
          {kind==='group'?"Novo grupo":"Nova equipe"}
        </Action>
      )}
      {canCreate && (creating || editing) && (
        <Card>
          <Field
            label={f.title}
            value={title}
            onChangeText={setTitle}
            maxLength={160}
          />
          <Field
            label={f.description}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={2000}
          />
          <Field
            label={f.schedule}
            value={schedule}
            onChangeText={setSchedule}
            maxLength={240}
          />
          <Field
            label={f.meetingPoint}
            value={meeting}
            onChangeText={setMeeting}
            maxLength={240}
          />
          <Action
            disabled={action.busy || title.trim().length < 2}
            onPress={() =>
              void action
                .run("save_community_unit", {
                  resource: editing?.id ?? null,
                  kind,
                  title: title.trim(),
                  description,
                  schedule,
                  meeting_point: meeting,
                  published: editing?.published ?? false,
                })
                .then((ok) => {
                  if (ok) reset();
                })
            }
          >
            {editing ? f.save : f.create}
          </Action>
          <Action secondary disabled={action.busy} onPress={reset}>
            {f.cancelEdit}
          </Action>
        </Card>
      )}
      {action.message ? <Body>{action.message}</Body> : null}
      <Load
        pending={units.isPending}
        error={units.error}
        empty={!units.data?.length}
        retry={() => units.refetch()}
      />
      {units.data?.map(u=><Card key={u.id}>
        <div className="community-unit-heading"><h3><RecordTitle title={u.title}/></h3><span className="publication-badge">{u.published?'Publicado':'Rascunho'}</span></div>
        {u.description&&<Body>{u.description}</Body>}
        <dl className="community-unit-facts">{u.schedule&&<div><dt><Clock size={16}/>Horário</dt><dd>{u.schedule}</dd></div>}{u.meeting_point&&<div><dt><MapPin size={16}/>Local</dt><dd>{u.meeting_point}</dd></div>}</dl>
        {u.my_status&&<Body>{f.membership[u.my_status]}</Body>}
        <div className="community-primary-actions">
          {kind==='group'&&(u.is_manager||u.my_status==='active')?<Action onPress={()=>{setChatUnit(null);setMeetingsUnit(meetingsUnit===u.id?null:u.id);}}>{meetingsUnit===u.id?pt.meetingCopy.close:pt.meetingCopy.open}</Action>:u.is_manager?<Action onPress={()=>setExpanded(expanded===u.id?null:u.id)}>{expanded===u.id?f.back:f.manage}</Action>:u.published&&!u.my_status?<Action requiresProfile disabled={action.busy} onPress={()=>void action.run('request_community_membership',{unit:u.id,participate:true})}>{f.join}</Action>:null}
          <details className="community-card-options"><summary>Mais opções</summary><div>
            {canCreate&&<><Action secondary disabled={action.busy} onPress={()=>{setEditing(u);setTitle(u.title);setDescription(u.description);setSchedule(u.schedule);setMeeting(u.meeting_point);}}>{f.edit}</Action><Action secondary disabled={action.busy} onPress={()=>{if(u.published&&!window.confirm('Retirar este '+(kind==='group'?'grupo':'equipe')+' da lista publicada? Os participantes e o histórico serão preservados.'))return;void action.run('save_community_unit',{resource:u.id,kind,title:u.title,description:u.description,schedule:u.schedule,meeting_point:u.meeting_point,published:!u.published});}}>{u.published?f.unpublish:f.publish}</Action></>}
            {kind==='group'&&(u.is_manager||u.my_status==='active')&&<Action secondary onPress={()=>{setMeetingsUnit(null);setChatUnit(chatUnit===u.id?null:u.id);}}>{chatUnit===u.id?pt.chatCopy.close:pt.chatCopy.open}</Action>}
            {u.is_manager&&kind==='group'&&<Action secondary onPress={()=>setExpanded(expanded===u.id?null:u.id)}>{expanded===u.id?f.back:f.manage}</Action>}
            {!canCreate&&!u.is_manager&&(u.my_status==='active'||u.my_status==='requested')&&<Action secondary disabled={action.busy} onPress={()=>setLeaving(u.id)}>{u.my_status==='requested'?f.cancelRequest:f.leave}</Action>}
            {!canCreate&&!u.is_manager&&u.my_status==='inactive'&&u.published&&<Action secondary requiresProfile disabled={action.busy} onPress={()=>void action.run('request_community_membership',{unit:u.id,participate:true})}>{f.join}</Action>}
          </div></details>
        </div>
        {leaving===u.id&&<div className="community-leave-confirmation"><Body>{f.leaveNotice}</Body><Action requiresProfile disabled={action.busy} onPress={()=>void action.run('request_community_membership',{unit:u.id,participate:false}).then(ok=>{if(ok)setLeaving(null);})}>{f.confirmLeave}</Action><Action secondary onPress={()=>setLeaving(null)}>{f.back}</Action></div>}
        {chatUnit===u.id&&<GroupChat key={u.id} unit={u.id} manager={u.is_manager}/>}
        {meetingsUnit===u.id&&<GroupMeetings key={u.id} unit={u.id} manager={u.is_manager} participant={u.my_status==='active'}/>}
        {expanded===u.id&&u.is_manager&&<UnitManager unit={u.id} unitTitle={u.title} canDesignate={canCreate}/>}
      </Card>)}
      <Pages {...units} />
    </View>
  );
}
export function MyServiceShifts({month,onMonthChange,showBoard=true,initialDetailId}:{month?:string;onMonthChange?:(month:string)=>void;showBoard?:boolean;initialDetailId?:string}={}) {
  const mine = useQuery({queryKey:["community","my_service_assignments","monthly"],queryFn:()=>loadSchedulePages<Mine>(page=>rpc("my_service_assignments",{page}))}),
    action = useAction();
  const [detailId,setDetailId]=useState<string|null>(initialDetailId??null);
  useEffect(()=>{if(detailId)document.getElementById("service-participation-detail")?.focus();},[detailId]);
  const [declining, setDeclining] = useState<string | null>(null);
  const [offering, setOffering] = useState<string | null>(null);
  return (
    <View style={gap}>
      {showBoard && !mine.isPending && !mine.error && <ScheduleBoard month={month} onMonthChange={onMonthChange} label="Escalas de equipes" entries={(mine.data??[]).map(a=>({id:a.id,date:scheduleDate(a.starts_at),role:a.title,group:a.unit_title,canceled:a.canceled,detail:displayBrasilia(a.starts_at),people:[{id:"self",name:"Você",status:f.assignment[a.status]}]}))} onSelect={entry=>{setDetailId(entry.id);setDeclining(null);setOffering(null);}}/>}
      {detailId&&<Action secondary onPress={()=>setDetailId(null)}>Ocultar detalhes da participação</Action>}
      {action.message ? <Body>{action.message}</Body> : null}
      <Load
        pending={mine.isPending}
        error={mine.error}
        empty={false}
        retry={() => mine.refetch()}
      />
      {mine.data?.filter(a=>a.id===detailId).map((a) => (
        <div id="service-participation-detail" tabIndex={-1} key={a.id}><Card>
          <Body>
            {a.title} · {a.unit_title}
          </Body>
          <Body>
            {displayBrasilia(a.starts_at)} — {displayBrasilia(a.ends_at)} ·{" "}
            {pt.timeZoneShort}
          </Body>
          <Body>{a.canceled ? f.canceled : f.assignment[a.status]}</Body>
          {a.attended && <Body>{f.present}</Body>}
          {!a.canceled &&
            new Date(a.starts_at) > new Date() &&
            a.status !== "declined" && (
              <>
                {a.status === "pending" && (
                  <Action
                    requiresProfile
                    disabled={action.busy}
                    onPress={() =>
                      void action.run("respond_service_assignment", {
                        assignment: a.id,
                        accept: true,
                      })
                    }
                  >
                    {f.confirm}
                  </Action>
                )}
                {a.status === "confirmed" &&
                  (offering === a.id ? (
                    <>
                      <Body>{x.requestHint}</Body>
                      <Action
                        requiresProfile
                        disabled={action.busy}
                        onPress={() =>
                          void action
                            .run("request_service_exchange", {
                              assignment: a.id,
                            })
                            .then((ok) => {
                              if (ok) setOffering(null);
                            })
                        }
                      >
                        {x.confirmRequest}
                      </Action>
                      <Action
                        secondary
                        disabled={action.busy}
                        onPress={() => setOffering(null)}
                      >
                        {x.back}
                      </Action>
                    </>
                  ) : (
                    <Action
                      secondary
                      disabled={action.busy}
                      onPress={() => {
                        setDeclining(null);
                        setOffering(a.id);
                      }}
                    >
                      {x.request}
                    </Action>
                  ))}
                {declining === a.id ? (
                  <>
                    <Body>{f.declineNotice}</Body>
                    <Action
                      requiresProfile
                      disabled={action.busy}
                      onPress={() =>
                        void action
                          .run("respond_service_assignment", {
                            assignment: a.id,
                            accept: false,
                          })
                          .then((ok) => {
                            if (ok) setDeclining(null);
                          })
                      }
                    >
                      {f.confirmDecline}
                    </Action>
                    <Action secondary onPress={() => setDeclining(null)}>
                      {f.back}
                    </Action>
                  </>
                ) : (
                  <Action
                    secondary
                    disabled={action.busy}
                    onPress={() => {
                      setOffering(null);
                      setDeclining(a.id);
                    }}
                  >
                    {f.decline}
                  </Action>
                )}
              </>
            )}
        </Card></div>
      ))}
    </View>
  );
}
type Exchange = {
  id: string;
  title: string;
  unit_title: string;
  starts_at: string;
  ends_at: string;
  status: "open" | "accepted" | "approved" | "rejected" | "canceled";
  is_source: boolean;
  is_target: boolean;
  can_manage: boolean;
  available: boolean;
  source_name: string | null;
  target_name: string | null;
};
type ExchangeDecision = "accept" | "withdraw" | "cancel" | "approve" | "reject";
export function ServiceExchanges() {
  const exchanges = usePage<Exchange>("service_exchange_page");
  const action = useAction();
  const [pending, setPending] = useState<{
    id: string;
    decision: ExchangeDecision;
  } | null>(null);
  const hints = {
    accept: x.acceptHint,
    withdraw: x.withdrawHint,
    cancel: x.cancelHint,
    approve: x.approveHint,
    reject: x.rejectHint,
  };
  return (
    <View style={gap}>
      <Title>{x.title}</Title>
      <Body>{x.intro}</Body>
      {action.message ? <Body>{action.message}</Body> : null}
      <Action
        secondary
        disabled={exchanges.isFetching || action.busy}
        onPress={() => {
          setPending(null);
          void exchanges.refetch();
        }}
      >
        {x.refresh}
      </Action>
      <Load
        pending={exchanges.isPending}
        error={exchanges.error}
        empty={!exchanges.data?.length}
        retry={() => exchanges.refetch()}
      />
      {exchanges.data?.map((e) => (
        <Card key={e.id}>
          <Body>
            {e.title} · {e.unit_title}
          </Body>
          <Body>
            {displayBrasilia(e.starts_at)} — {displayBrasilia(e.ends_at)} ·{" "}
            {pt.timeZoneShort}
          </Body>
          <Body>{x[e.status]}</Body>
          {e.is_source && <Body>{x.mine}</Body>}
          {e.is_target && <Body>{x.candidate}</Body>}
          {e.source_name && (
            <Body>
              {x.source}: {e.source_name}
            </Body>
          )}
          {e.target_name && (
            <Body>
              {x.target}: {e.target_name}
            </Body>
          )}
          {(e.status === "open" || e.status === "accepted") && (
            <>
              {!e.available && <Body>{x.unavailable}</Body>}
              {pending?.id === e.id ? (
                <>
                  <Body>{hints[pending.decision]}</Body>
                  <Action
                    requiresProfile={["accept", "withdraw", "cancel"].includes(
                      pending.decision,
                    )}
                    disabled={action.busy}
                    onPress={() =>
                      void action
                        .run("service_exchange_action", {
                          exchange: e.id,
                          decision: pending.decision,
                        })
                        .then((ok) => {
                          if (ok) setPending(null);
                        })
                    }
                  >
                    {x.confirm}
                  </Action>
                  <Action
                    secondary
                    disabled={action.busy}
                    onPress={() => setPending(null)}
                  >
                    {x.back}
                  </Action>
                </>
              ) : (
                <>
                  {e.available && e.status === "open" && !e.is_source && (
                    <Action
                      disabled={action.busy}
                      onPress={() =>
                        setPending({ id: e.id, decision: "accept" })
                      }
                    >
                      {x.accept}
                    </Action>
                  )}
                  {e.is_source && (
                    <Action
                      secondary
                      disabled={action.busy}
                      onPress={() =>
                        setPending({ id: e.id, decision: "cancel" })
                      }
                    >
                      {x.cancel}
                    </Action>
                  )}
                  {e.is_target && (
                    <Action
                      secondary
                      disabled={action.busy}
                      onPress={() =>
                        setPending({ id: e.id, decision: "withdraw" })
                      }
                    >
                      {x.withdraw}
                    </Action>
                  )}
                  {e.can_manage && (
                    <>
                      {e.available &&
                        e.status === "accepted" &&
                        !e.is_source &&
                        !e.is_target && (
                          <Action
                            disabled={action.busy}
                            onPress={() =>
                              setPending({ id: e.id, decision: "approve" })
                            }
                          >
                            {x.approve}
                          </Action>
                        )}
                      <Action
                        secondary
                        disabled={action.busy}
                        onPress={() =>
                          setPending({ id: e.id, decision: "reject" })
                        }
                      >
                        {x.reject}
                      </Action>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </Card>
      ))}
      <Pages {...exchanges} />
    </View>
  );
}
function UnitManager({
  unit,
  unitTitle,
  canDesignate,
}: {
  unit: string;
  unitTitle: string;
  canDesignate: boolean;
}) {
  const roster = usePage<Member>("community_roster", { unit }),
    shifts = usePage<Shift>("unit_service_shifts", { unit }),
    action = useAction();
  const [title, setTitle] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [capacity, setCapacity] = useState("1");
  const [selected, setSelected] = useState<Shift | null>(null),
    [canceling, setCanceling] = useState<string | null>(null),
    [removing, setRemoving] = useState<string | null>(null);
  const starts = parseBrasilia(start),
    ends = parseBrasilia(end),
    amount = /^\d+$/.test(capacity) ? Number(capacity) : NaN;
  const selectedShift =
    shifts.data?.find((s) => s.id === selected?.id) ?? selected;
  useEffect(()=>{if(selected)document.getElementById(`unit-roster-${unit}`)?.focus();},[selected,unit]);
  return (
    <View style={gap}>
      {canDesignate && <LeaderManager unit={unit} />}
      <UnitScheduleBoard unit={unit} title={unitTitle} onSelect={setSelected} />
      <Title>{f.shifts}</Title>
      <Field
        label={f.shiftTitle}
        value={title}
        onChangeText={setTitle}
        maxLength={160}
      />
      <Field label={f.start} value={start} onChangeText={setStart} />
      <Field label={f.end} value={end} onChangeText={setEnd} />
      <Field
        label={f.capacity}
        value={capacity}
        onChangeText={setCapacity}
        keyboardType="number-pad"
      />
      <Action
        disabled={
          action.busy ||
          title.trim().length < 2 ||
          !starts ||
          !ends ||
          Date.parse(ends) <= Date.parse(starts) ||
          !Number.isSafeInteger(amount) ||
          amount < 1 ||
          amount > 1000
        }
        onPress={() =>
          void action
            .run("save_service_shift", {
              resource: null,
              unit,
              title: title.trim(),
              starts_at: starts,
              ends_at: ends,
              capacity: amount,
              canceled: false,
            })
            .then((ok) => {
              if (ok) {
                setTitle("");
                setStart("");
                setEnd("");
                shifts.setPage(0);
              }
            })
        }
      >
        {f.createShift}
      </Action>
      {action.message ? <Body>{action.message}</Body> : null}
      <Load
        pending={shifts.isPending}
        error={shifts.error}
        empty={!shifts.data?.length}
        retry={() => shifts.refetch()}
      />
      {shifts.data?.map((s) => (
        <Card key={s.id}>
          <Body>
            {s.title} · {displayBrasilia(s.starts_at)} · {pt.timeZoneShort} ·{" "}
            {s.capacity}
            {s.canceled ? ` · ${f.canceled}` : ""}
          </Body>
          <Action
            secondary
            selected={selected?.id === s.id}
            onPress={() => setSelected(s)}
          >
            {selected?.id === s.id ? f.selectedShift : f.chooseShift}
          </Action>
          {!s.canceled &&
            new Date(s.starts_at) > new Date() &&
            (canceling === s.id ? (
              <>
                <Body>{f.cancelNotice}</Body>
                <Action
                  disabled={action.busy}
                  onPress={() =>
                    void action
                      .run("save_service_shift", {
                        resource: s.id,
                        unit,
                        title: s.title,
                        starts_at: s.starts_at,
                        ends_at: s.ends_at,
                        capacity: s.capacity,
                        canceled: true,
                      })
                      .then((ok) => {
                        if (ok) setCanceling(null);
                      })
                  }
                >
                  {f.confirmCancel}
                </Action>
                <Action secondary onPress={() => setCanceling(null)}>
                  {f.back}
                </Action>
              </>
            ) : (
              <Action
                secondary
                disabled={action.busy}
                onPress={() => setCanceling(s.id)}
              >
                {f.cancelShift}
              </Action>
            ))}
        </Card>
      ))}
      <Pages {...shifts} />
      <Title>{f.members}</Title>
      <Load
        pending={roster.isPending}
        error={roster.error}
        empty={!roster.data?.length}
        retry={() => roster.refetch()}
      />
      {roster.data?.map((p) => (
        <Card key={p.person_id}>
          <Body>
            {p.full_name} · {f.membership[p.status]}
          </Body>
          {p.status === "requested" && (
            <Action
              secondary
              disabled={action.busy}
              onPress={() =>
                void action.run("decide_community_membership", {
                  unit,
                  person: p.person_id,
                  approve: true,
                })
              }
            >
              {f.approve}
            </Action>
          )}
          {p.status !== "inactive" &&
            (removing === p.person_id ? (
              <>
                <Body>{f.removalNotice}</Body>
                <Action
                  disabled={action.busy}
                  onPress={() =>
                    void action
                      .run("decide_community_membership", {
                        unit,
                        person: p.person_id,
                        approve: false,
                      })
                      .then((ok) => {
                        if (ok) setRemoving(null);
                      })
                  }
                >
                  {f.remove}
                </Action>
                <Action secondary onPress={() => setRemoving(null)}>
                  {f.back}
                </Action>
              </>
            ) : (
              <Action
                secondary
                disabled={action.busy}
                onPress={() => setRemoving(p.person_id)}
              >
                {f.remove}
              </Action>
            ))}
          {p.status === "active" &&
            selectedShift &&
            !selectedShift.canceled &&
            new Date(selectedShift.starts_at) > new Date() && (
              <Action
                secondary
                disabled={action.busy}
                onPress={() =>
                  void action.run("assign_service_shift", {
                    shift: selectedShift.id,
                    person: p.person_id,
                  })
                }
              >{`${f.invite}: ${p.full_name}`}</Action>
            )}
        </Card>
      ))}
      <Pages {...roster} />
      {selectedShift && (
        <div id={`unit-roster-${unit}`} tabIndex={-1}><ShiftRoster
          key={selectedShift.id}
          shift={selectedShift.id}
          canceled={selectedShift.canceled}
        /></div>
      )}
    </View>
  );
}
function UnitScheduleBoard({unit,title,onSelect}:{unit:string;title:string;onSelect:(shift:Shift)=>void}) {
  const [month,setMonth]=useState(()=>scheduleDate(new Date().toISOString()).slice(0,7));
  const shifts=useQuery({queryKey:["community","unit-monthly-shifts",unit],queryFn:()=>loadSchedulePages<Shift>(page=>rpc("unit_service_shifts",{unit,page}))});
  const visible=(shifts.data??[]).filter(shift=>scheduleDate(shift.starts_at).startsWith(month));
  const roster=useQuery({queryKey:["community","unit-monthly-roster",unit,month,visible.map(s=>s.id)],enabled:!!shifts.data,queryFn:()=>Promise.all(visible.map(async shift=>({shift,people:await loadSchedulePages<Assignment>(page=>rpc("service_roster",{shift:shift.id,page}))}))) });
  return <View style={gap}>
    <Load pending={shifts.isPending || (!!shifts.data&&roster.isPending)} error={shifts.error||roster.error} empty={false} retry={()=>{void shifts.refetch();void roster.refetch();}}/>
    {!shifts.isPending&&!shifts.error&&!roster.isPending&&!roster.error&&<ScheduleBoard label={`Escala de ${title}`} month={month} onMonthChange={setMonth} entries={(roster.data??[]).map(({shift,people})=>({id:shift.id,date:scheduleDate(shift.starts_at),role:shift.title,group:title,canceled:shift.canceled,detail:displayBrasilia(shift.starts_at),people:people.map(p=>({id:p.person_id,name:p.full_name,status:f.assignment[p.status]}))}))} onSelect={entry=>{const shift=visible.find(s=>s.id===entry.id);if(shift)onSelect(shift);}}/>}
  </View>;
}
function ShiftRoster({
  shift,
  canceled,
}: {
  shift: string;
  canceled: boolean;
}) {
  const roster = usePage<Assignment>("service_roster", { shift }),
    action = useAction();
  return (
    <View style={gap}>
      <Load
        pending={roster.isPending}
        error={roster.error}
        empty={!roster.data?.length}
        retry={() => roster.refetch()}
      />
      {action.message ? <Body>{action.message}</Body> : null}
      {roster.data?.map((a) => (
        <Card key={a.id}>
          <Body>
            {a.full_name} · {f.assignment[a.status]}
          </Body>
          {a.status === "confirmed" && !canceled && (
            <Action
              secondary
              disabled={action.busy}
              onPress={() =>
                void action.run("set_service_attendance", {
                  assignment: a.id,
                  present: !a.attended,
                })
              }
            >
              {a.attended ? f.undoAttendance : f.attendance}
            </Action>
          )}
        </Card>
      ))}
      <Pages {...roster} />
    </View>
  );
}
function LeaderManager({ unit }: { unit: string }) {
  const [search, setSearch] = useState("");
  const options = usePage<{
      person_id: string;
      full_name: string;
      assigned: boolean;
    }>("community_leader_options", { unit, search }),
    action = useAction();
  return (
    <View style={gap}>
      <Title>{f.leaders}</Title>
      <Body>{f.leaderNote}</Body>
      <Field
        label={f.searchLeaders}
        value={search}
        onChangeText={(v) => {
          setSearch(v);
          options.setPage(0);
        }}
        maxLength={120}
      />
      <Load
        pending={options.isPending}
        error={options.error}
        empty={!options.data?.length}
        retry={() => options.refetch()}
      />
      {action.message ? <Body>{action.message}</Body> : null}
      {options.data?.map((p) => (
        <Card key={p.person_id}>
          <Body>{p.full_name}</Body>
          <Action
            secondary
            disabled={action.busy}
            onPress={() =>
              void action.run("set_community_leader", {
                unit,
                person: p.person_id,
                enabled: !p.assigned,
              })
            }
          >
            {p.assigned ? f.revokeLeader : f.grantLeader}
          </Action>
        </Card>
      ))}
      <Pages {...options} />
    </View>
  );
}
