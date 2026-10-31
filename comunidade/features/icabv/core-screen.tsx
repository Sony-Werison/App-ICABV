import { useState } from "react";
import { LoadingState, Disclosure, PagedList } from "./presentation";
import { Linking, ScrollView, Share, Text, View } from "./web-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pt, theme } from "../../packages/shared/src";
import { supabase } from "./supabase";
import { offlineVersion, savedMessage } from "./offline-transport";
import { Action, Body, Card, Field, Title } from "./ui";
import { displayBrasilia, formatBrasilia, parseBrasilia } from "./event-format";
import { AgendaCalendar, type AgendaVisibility } from "./agenda-calendar";
import { useAgendaCommitments } from "./agenda-commitments";
import { AgendaCommitmentCard } from "./agenda-commitment-card";
import {ModuleDialog} from "./module-dialog";
import { CompactCard } from "./compact-card";
import {Birthdays} from "./community-care";
import {RecordTitle} from "./record-title";
import { calendarDate, eventsInMonth, eventOnDate, loadAgendaPages } from "./agenda-calendar-model";

export type Event = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  audience: string;
  status: string;
  category: string;
  payment_details?:string;
  fundraising_details?:string;
};
type Post = {
  id: string;
  title: string;
  body: string;
  audience: string;
  published: boolean;
  expires_at: string | null;
};
type Link = {
  id: string;
  title: string;
  kind: string;
  url: string;
  published: boolean;
  preacher: string;
  topic: string;
  preached_on: string | null;
};
type Prayer = {
  id: string;
  body: string;
  visibility: string;
  moderation: string;
  answered: boolean;
  is_mine: boolean;
  display_name: string;
  anonymous: boolean;
};
type Item = {
  id: string;
  name: string;
  quantity: number;
  remaining: number;
  my_quantity: number;
};
const gap = { gap: 8 };
const date = (v: string) => `${displayBrasilia(v)} · ${pt.timeZoneShort}`;
async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  if (!supabase) throw new Error("unconfigured");
  const result = await supabase.rpc(name, args);
  if (result.error) throw result.error;
  return result.data as T;
}
async function list<T>(
  table: string,
  fields: string,
  order = "created_at",
  page = 0,
) {
  if (!supabase) throw new Error("unconfigured");
  const result = await supabase
    .from(table)
    .select(fields)
    .order(order, { ascending: order !== "created_at" })
    .order(
      table === "event_reminders" || table === "event_registrations"
        ? "event_id"
        : "id",
    )
    .range(page * 20, page * 20 + 20);
  if (result.error) throw result.error;
  return result.data as unknown as T[];
}
function useAction() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function perform(name: string, args: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    setMessage("");
    const before = offlineVersion();
    try {
      await rpc(name, args);
      setMessage(savedMessage(before));
      await client.invalidateQueries({ queryKey: ["core"] });
      return true;
    } catch (e) {
      const reason =
        e && typeof e === "object" && "message" in e ? String(e.message) : "";
      setMessage(
        reason.includes("event_full")
            ? "As vagas acabaram."
            : reason.includes("item_full")
              ? "A quantidade disponível mudou. Atualize e tente novamente."
              : reason.includes("registration_required")
                ? "Inscreva-se no evento primeiro."
                : reason.includes("event_closed")
                  ? "Inscrições e reservas encerradas."
                  : reason.includes("capacity_below_registrations")
                    ? "A lotação não pode ser menor que as inscrições existentes."
                    : reason.includes("quantity_below_reservations")
                      ? "A quantidade total não pode ser menor que as reservas existentes."
                      : "Não foi possível salvar. Confira os dados e tente novamente.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, perform };
}
function Status({
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
  if (pending) return <LoadingState />;
  if (error)
    return (
      <>
        <Body>Não foi possível carregar.</Body>
        <Action secondary onPress={retry}>
          Tentar novamente
        </Action>
      </>
    );
  return empty ? <Body>Nenhum registro disponível.</Body> : null;
}
function usePage<T>(
  key: unknown[],
  fetch: (page: number) => Promise<T[]>,
  enabled = true,
) {
  const [page, setPage] = useState(0);
  const result = useQuery({
    queryKey: ["core", ...key, page],
    queryFn: () => fetch(page),
    enabled,
  });
  return {
    ...result,
    data: result.data?.slice(0, 20),
    hasNext: (result.data?.length ?? 0) > 20,
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
  if (page === 0 && !hasNext) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Action
        secondary
        disabled={page === 0 || isFetching}
        onPress={() => setPage(page - 1)}
      >
        Anterior
      </Action>
      <Body>Página {page + 1}</Body>
      <Action
        secondary
        disabled={!hasNext || isFetching}
        onPress={() => setPage(page + 1)}
      >
        Próxima
      </Action>
    </View>
  );
}
function useEvents(includePast = false, search = "", category = "") {
  return usePage<Event>(["events", includePast, search, category], (page) =>
    rpc("browse_events", {
      page,
      search,
      category: category.trim(),
      include_past: includePast,
    }),
  );
}
function usePosts() {
  return usePage<Post>(["posts"], (page) =>
    list<Post>(
      "announcements",
      "id,title,body,audience,published,expires_at",
      "created_at",
      page,
    ),
  );
}
function useLinks(search = "") {
  return usePage<Link>(["links", search], (page) =>
    rpc("browse_links", { page, search }),
  );
}

export function UpcomingEvents({ onAgenda }: { onAgenda?: () => void }) {
  const events = useEvents();
  const visible =
    events.data
      ?.filter(
        (e) => e.status === "published" && new Date(e.ends_at) > new Date(),
      )
      .slice(0, 3) ?? [];
  return (
    <View style={gap}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Title>{pt.upcomingEvents}</Title>
        </View>
        {onAgenda && (
          <Action secondary onPress={onAgenda}>
            {pt.viewAgenda}
          </Action>
        )}
      </View>
      <Status
        pending={events.isPending}
        error={events.error}
        empty={!visible.length}
        retry={() => void events.refetch()}
      />
      {visible.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={visible.length > 1}
          contentContainerStyle={{ gap: 8, flexGrow: 1 }}
        >
          {visible.map((e) => (
            <View
              key={e.id}
              style={{
                width: visible.length > 1 ? 260 : undefined,
                flex: visible.length === 1 ? 1 : undefined,
                gap: 8,
                padding: 14,
                borderRadius: 18,
                backgroundColor: theme.brand,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 12, lineHeight: 18 }}>
                {date(e.starts_at)}
              </Text>
              <Text
                style={{
                  color: "#FFFFFF",
                  fontWeight: "700",
                  fontSize: 16,
                  lineHeight: 22,
                }}
              >
                {e.title}
              </Text>
              {e.location ? (
                <Text
                  style={{ color: "#FFFFFF", fontSize: 13, lineHeight: 18 }}
                >
                  {e.location}
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
export function CoreHome({
  personId,
  showEvents = true,
}: {
  personId?: string;
  showEvents?: boolean;
}) {
  const [linkError, setLinkError] = useState("");
  const openLink = async (url: string) => {
    setLinkError("");
    try {
      await Linking.openURL(url);
    } catch {
      setLinkError("Não foi possível abrir o conteúdo. Tente novamente.");
    }
  };
  const posts = usePosts();
  const [contentSearch, setContentSearch] = useState("");
  const links = useLinks(contentSearch);
  const events = useEvents();
  const action = useAction();
  const reminders = usePage(
    ["reminders", personId],
    (page) =>
      list<{ event_id: string; due_at: string; enabled: boolean }>(
        "event_reminders",
        "event_id,due_at,enabled",
        "due_at",
        page,
      ),
    Boolean(personId),
  );
  const notifications = usePage(
    ["notifications", personId],
    (page) =>
      list<{ id: string; read_at: string | null }>(
        "core_notifications",
        "id,read_at",
        "created_at",
        page,
      ),
    Boolean(personId),
  );
  const visible = posts.data?.filter(
    (p) =>
      p.published && (!p.expires_at || new Date(p.expires_at) > new Date()),
  );
  return (
    <View style={gap}>
      <Title>Avisos</Title>
      <Status
        pending={posts.isPending}
        error={posts.error}
        empty={!visible?.length}
        retry={() => void posts.refetch()}
      />
      {visible?.map((p) => (
        <Card key={p.id}>
          <Body>{p.title}</Body>
          <Body>{p.body}</Body>
        </Card>
      ))}
      <Pages {...posts} />
      {showEvents && <UpcomingEvents />}
      <Action
        secondary
        onPress={() => void openLink("https://int.odbm.org/pt/devocional")}
      >
        Pão Diário — abrir devocional oficial
      </Action>
      <Title>Cultos e conteúdo</Title>
      <Field
        label="Buscar título, pregador ou tema"
        value={contentSearch}
        maxLength={160}
        onChangeText={(v) => {
          setContentSearch(v);
          links.setPage(0);
        }}
      />
      <Status
        pending={links.isPending}
        error={links.error}
        empty={!links.data?.some((l) => l.published)}
        retry={() => void links.refetch()}
      />
      {links.data
        ?.filter((l) => l.published)
        .map((l) => (
          <Card key={l.id}>
            <Body>
              {[
                l.preacher,
                l.topic,
                l.preached_on?.split("-").reverse().join("/"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Body>
            <Action secondary onPress={() => void openLink(l.url)}>
              {l.title}
            </Action>
          </Card>
        ))}
      <Pages {...links} />
      {linkError ? <Body>{linkError}</Body> : null}
      {personId && (
        <>
          <Title>Lembretes</Title>
          <Status
            pending={reminders.isPending}
            error={reminders.error}
            empty={!reminders.data?.some((r) => r.enabled)}
            retry={() => void reminders.refetch()}
          />
          {reminders.data
            ?.filter((r) => r.enabled)
            .map((r) => (
              <Body key={r.event_id}>
                {events.data?.find((e) => e.id === r.event_id)?.title ??
                  "Evento"}
                : {date(r.due_at)}
              </Body>
            ))}
          <Body>
            Lembretes disponíveis no app. Alertas no celular ainda não estão
            habilitados.
          </Body>
          <Pages {...reminders} />
          <Title>Notificações</Title>
          <Status
            pending={notifications.isPending}
            error={notifications.error}
            empty={!notifications.data?.some((n) => !n.read_at)}
            retry={() => void notifications.refetch()}
          />
          {notifications.data
            ?.filter((n) => !n.read_at)
            .map((n) => (
              <Card key={n.id}>
                <Body>Alguém orou por seu pedido.</Body>
                <Action
                  secondary
                  disabled={action.busy}
                  onPress={() =>
                    void action.perform("read_core_notification", {
                      notification: n.id,
                    })
                  }
                >
                  Marcar como lida
                </Action>
              </Card>
            ))}
          {action.message ? <Body>{action.message}</Body> : null}
          <Pages {...notifications} />
        </>
      )}
    </View>
  );
}
export function Agenda({
  personId,
  onLogin,
  onNavigate,
}: {
  personId?: string;
  onLogin: () => void;
  onNavigate?: (tab:string,section?:string,key?:string)=>void;
}) {
  const [visibility,setVisibility]=useState<AgendaVisibility>({events:true,birthdays:true,schedules:true});
  const [month,setMonth]=useState(()=>calendarDate(new Date().toISOString()).slice(0,7));
  const [selectedDate,setSelectedDate]=useState<string|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const events=useQuery({queryKey:["core","calendar-events"],queryFn:()=>loadAgendaPages<Event>(page=>rpc("browse_events",{page,search:"",category:"",include_past:true}))});
  const personal=useAgendaCommitments(personId,month);
  const visibleCommitments=personal.items.filter(item=>item.kind==="birthday"?visibility.birthdays:visibility.schedules);
  const visiblePersonal=visibleCommitments.filter(item=>item.kind==="schedule"&&(!selectedDate||item.date===selectedDate));
  const monthly=eventsInMonth(visibility.events?events.data??[]:[],month);
  const upcoming=monthly.filter(event=>!selectedDate||eventOnDate(event,selectedDate));
  const agendaRows=[...upcoming.map(event=>({kind:"event" as const,id:`event:${event.id}`,date:selectedDate??(calendarDate(event.starts_at).slice(0,7)<month?`${month}-01`:calendarDate(event.starts_at)),time:new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}).format(new Date(event.starts_at)),event})),...visiblePersonal.map(item=>({kind:"personal" as const,id:item.id,date:item.date,time:item.time??"",item}))].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
  const hideCommitments=agendaRows.length===0&&!events.isPending&&!events.error&&!personal.pending&&!personal.paused&&!personal.errors.length;

  const counts = useQuery({
    queryKey: ["core", "counts", upcoming.map(event=>event.id)],
    enabled: upcoming.length>0,
    queryFn: async () => {
      const results=[];
      for(let offset=0;offset<upcoming.length;offset+=20)results.push(await rpc<{event_id:string;registered_count:number}[]>("event_availability_for",{events:upcoming.slice(offset,offset+20).map(event=>event.id)}));
      return results.flat();
    },
  });
  return (
    <View style={gap}>
      <Title>Agenda</Title>
      <AgendaCalendar visibility={visibility} onVisibilityChange={value=>{setVisibility(value);setSelected(null);}} commitments={visibleCommitments} events={monthly} month={month} selectedDate={selectedDate} loading={events.isPending} onMonthChange={value=>{setMonth(value);setSelectedDate(null);setSelected(null);}} onSelectDate={value=>{setSelectedDate(value);setSelected(null);}}/>
      {hideCommitments?(selectedDate?<button className="text-btn" onClick={()=>{setSelectedDate(null);setSelected(null);}}>Ver mês completo</button>:null):<section className="icabv-card agenda-commitments" aria-label="Eventos e minhas escalas">
      <div className="agenda-results-heading"><h3>{selectedDate?new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"numeric",month:"long",timeZone:"UTC"}).format(new Date(`${selectedDate}T12:00:00Z`)):"Compromissos do mês"}</h3>{selectedDate&&<button className="text-btn" onClick={()=>{setSelectedDate(null);setSelected(null);}}>Ver mês completo</button>}</div>
      <Status pending={events.isPending} error={events.error} empty={false} retry={()=>void events.refetch()}/>
      {personal.pending&&<p className="agenda-sources-status" role="status">Carregando aniversários e suas escalas…</p>}
      {personal.paused&&<p className="agenda-sources-status" role="status">Alguns compromissos ainda não estão disponíveis neste dispositivo. Serão carregados quando a conexão voltar.</p>}
      {personal.errors.length>0&&<div className="agenda-sources-status" role="alert"><p>Não foi possível carregar {personal.errors.join(", ")}. Os demais compromissos continuam disponíveis.</p><button className="text-btn" onClick={personal.retry}>Tentar carregar novamente</button></div>}
      {(agendaRows.length>0||(!events.isPending&&!events.error&&!personal.pending&&!personal.paused&&!personal.errors.length))&&<PagedList className="agenda-compact-list" label="compromissos" pageSize={20} resetKey={`${month}|${selectedDate}|${visibility.events}|${visibility.birthdays}|${visibility.schedules}`} empty={selectedDate?"Nenhum compromisso nesta data.":"Nenhum compromisso neste mês."}>
      {agendaRows.map(row => {
        if(row.kind==="personal")return <AgendaCommitmentCard key={row.id} item={row.item} onNavigate={onNavigate}/>;
        const e=row.event;
        return <CompactCard key={row.id} title={e.title} date={row.date} description={`${row.time} · Brasília${e.location?` · ${e.location}`:""}`} onClick={()=>setSelected(selected===e.id?null:e.id)} label={`${selected===e.id?"Fechar detalhes":"Ver evento"}: ${e.title}`} expanded={selected===e.id}>
          <Body>{e.category} · {date(e.starts_at)}</Body>
          <Body>
            {e.capacity === null
              ? "Sem limite de vagas"
              : `Vagas: ${counts.isPending || counts.error ? "indisponíveis" : Math.max(0, e.capacity - (counts.data?.find((c) => c.event_id === e.id)?.registered_count ?? 0))}`}
          </Body>
          {selected === e.id && (
            <EventDetail event={e} personId={personId} onLogin={onLogin} />
          )}
        </CompactCard>;
      })}
      </PagedList>}
      </section>}
      <Birthdays weekly date={selectedDate??undefined} onNavigate={tab=>onNavigate?.(tab)}/>
    </View>
  );
}

export function EventDialog({event,personId,onLogin,onClose}:{event:Event;personId?:string;onLogin:()=>void;onClose:()=>void}) {
 const availability=useQuery({queryKey:["core","event-modal-availability",event.id],queryFn:()=>rpc<{event_id:string;registered_count:number}[]>("event_availability_for",{events:[event.id]})});
 const confirmed=availability.data?.find(row=>row.event_id===event.id)?.registered_count??0;
 return <ModuleDialog title={event.title} onClose={onClose}><section className="event-dialog-content">
  <dl><div><dt>Quando</dt><dd>{date(event.starts_at)} a {date(event.ends_at)}</dd></div><div><dt>Local</dt><dd>{event.location||"Não informado"}</dd></div><div><dt>Vagas</dt><dd>{availability.isPending?"Consultando vagas…":availability.error?"Não foi possível consultar as vagas.":event.capacity==null?`Sem limite de vagas · ${confirmed} confirmações`:`${Math.max(0,event.capacity-confirmed)} disponíveis de ${event.capacity} · ${confirmed} confirmações`}</dd></div></dl>
  <h3>Pagamento</h3><p className="event-information-text">{event.payment_details||"Informações de pagamento não cadastradas para este evento."}</p>
  {event.fundraising_details&&<><h3>Arrecadação</h3><p className="event-information-text">{event.fundraising_details}</p></>}
  <EventDetail event={event} personId={personId} onLogin={onLogin}/>
 </section></ModuleDialog>;
}

function EventDetail({
  event,
  personId,
  onLogin,
}: {
  event: Event;
  personId?: string;
  onLogin: () => void;
}) {
  const { busy, message, perform } = useAction();
  const [exportError, setExportError] = useState("");
  const registration = useQuery({
    queryKey: ["core", "registration", event.id, personId],
    enabled: Boolean(personId),
    queryFn: async () => {
      const r = await supabase!
        .from("event_registrations")
        .select("status")
        .eq("event_id", event.id)
        .maybeSingle();
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const registered = registration.data?.status === "registered";
  const items = usePage<Item>(["items", event.id, personId], (page) =>
    rpc("item_availability_page", { event: event.id, page }),
  );
  const reminder = useQuery({
    queryKey: ["core", "reminder", event.id, personId],
    enabled: Boolean(personId),
    queryFn: async () => {
      const r = await supabase!
        .from("event_reminders")
        .select("enabled")
        .eq("event_id", event.id)
        .maybeSingle();
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const closed = new Date(event.starts_at) <= new Date();
  return (
    <View style={gap}>
      <Body>{event.description}</Body>
      <Body>Até {date(event.ends_at)}</Body>
      {message ? <Body>{message}</Body> : null}
      {!personId ? (
        <Action onPress={onLogin}>Entrar para participar</Action>
      ) : (
        <>
          <Action
            requiresProfile
            disabled={
              busy ||
              registration.isPending ||
              Boolean(registration.error) ||
              (closed && !registered)
            }
            onPress={() =>
              void perform("register_event", {
                event: event.id,
                participate: !registered,
              })
            }
          >
            {registered ? "Cancelar minha inscrição" : "Inscrever-me"}
          </Action>
          {registered && (
            <Action
              requiresProfile
              secondary
              disabled={
                busy || closed || reminder.isPending || Boolean(reminder.error)
              }
              onPress={() =>
                void perform("set_event_reminder", {
                  event: event.id,
                  enabled: !reminder.data?.enabled,
                })
              }
            >
              {reminder.data?.enabled
                ? "Desativar lembrete no app"
                : "Lembrar-me no app"}
            </Action>
          )}
        </>
      )}
      <Action
        secondary
        onPress={() =>
          void Share.share({
            title: event.title,
            message: `${event.title}\n${date(event.starts_at)}\n${event.location}\n${event.description}`,
          }).catch(() => setExportError("Não foi possível compartilhar."))
        }
      >
        Compartilhar evento
      </Action>
      <Action
        secondary
        onPress={() => {
          setExportError("");
          void import("./export-calendar")
            .then((m) => m.exportCalendar(event))
            .catch(() =>
              setExportError(
                "Não foi possível exportar o calendário neste dispositivo.",
              ),
            );
        }}
      >
        Exportar calendário (.ics)
      </Action>
      {exportError ? <Body>{exportError}</Body> : null}
      <Title>Arrecadação e itens do evento</Title>
      <Status
        pending={items.isPending}
        error={items.error}
        empty={!items.data?.length}
        retry={() => void items.refetch()}
      />
      {items.data?.map((i) => (
        <Card key={i.id}>
          <Body>
            {i.name} · Restam {i.remaining} de {i.quantity}. Sua reserva:{" "}
            {i.my_quantity}.
          </Body>
          {personId && registered && (
            <ItemReservation
              item={i}
              busy={busy || closed}
              reserve={(amount) =>
                void perform("reserve_event_item", { item: i.id, amount })
              }
            />
          )}
        </Card>
      ))}
      <Pages {...items} />
    </View>
  );
}
function ItemReservation({
  item,
  busy,
  reserve,
}: {
  item: Item;
  busy: boolean;
  reserve: (amount: number) => void;
}) {
  const [value, setValue] = useState("1");
  const amount = /^\d+$/.test(value) ? Number(value) : NaN;
  return (
    <View style={gap}>
      <Field
        label={`Quantidade: ${item.name}`}
        value={value}
        onChangeText={setValue}
        keyboardType="number-pad"
      />
      <Action
        disabled={
          busy ||
          !Number.isSafeInteger(amount) ||
          amount < 1 ||
          amount > item.quantity
        }
        onPress={() => reserve(amount)}
      >
        Definir minha reserva
      </Action>
      {item.my_quantity > 0 && (
        <Action secondary disabled={busy} onPress={() => reserve(0)}>
          Liberar minha reserva
        </Action>
      )}
    </View>
  );
}
const visibilityLabels = {
  private: "Somente eu",
  leadership: "Eu, presbíteros e administradores",
  community: "Comunidade após moderação",
};
export function Prayers({
  personId,
  moderator,
}: {
  personId: string;
  moderator: boolean;
}) {
  const prayers = usePage<Prayer>(["prayers", personId], (page) =>
    rpc("prayer_feed_page", { page }),
  );
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [visibility, setVisibility] =
    useState<keyof typeof visibilityLabels>("private");
  const { busy, message, perform } = useAction();
  return (
    <View style={gap}>
      <Title>Oração</Title>
      <Body>
        Escolha quem poderá ler. Pedidos para a comunidade aguardam moderação.
        Não informe dados de outras pessoas sem autorização.
      </Body>
      <Field
        label="Seu pedido de oração"
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={2000}
      />
      {(Object.keys(visibilityLabels) as (keyof typeof visibilityLabels)[]).map(
        (v) => (
          <Action
            key={v}
            secondary={visibility !== v}
            onPress={() => setVisibility(v)}
          >{`${visibility === v ? "✓ " : ""}${visibilityLabels[v]}`}</Action>
        ),
      )}
      {visibility === "community" && (
        <>
          <Action secondary onPress={() => setAnonymous(!anonymous)}>
            {anonymous
              ? "✓ Ocultar meu nome no mural"
              : "Ocultar meu nome no mural"}
          </Action>
          <Body>A conta permanece vinculada de forma restrita ao pedido.</Body>
        </>
      )}
      <Action
        requiresProfile
        disabled={busy || body.trim().length < 2}
        onPress={() =>
          void perform("create_prayer", {
            content: body.trim(),
            visibility,
            is_anonymous: visibility === "community" && anonymous,
          }).then((ok) => {
            if (ok) {
              setBody("");
              prayers.setPage(0);
            }
          })
        }
      >
        Enviar pedido
      </Action>
      {message ? <Body>{message}</Body> : null}
      <Status
        pending={prayers.isPending}
        error={prayers.error}
        empty={!prayers.data?.length}
        retry={() => void prayers.refetch()}
      />
      {prayers.data?.map((p) => (
        <Card key={p.id}>
          <Body>
            {p.is_mine ? "Meu pedido" : p.display_name} ·{" "}
            {visibilityLabels[p.visibility as keyof typeof visibilityLabels]} ·{" "}
            {p.answered ? "Atendido" : "Em oração"}
          </Body>
          <Body>{p.body}</Body>
          {p.visibility === "community" && (
            <Body>
              {p.moderation === "published"
                ? "Publicado"
                : p.moderation === "hidden"
                  ? "Não publicado"
                  : "Aguardando moderação"}
            </Body>
          )}
          {p.is_mine && (
            <Action
              requiresProfile
              secondary
              disabled={busy}
              onPress={() =>
                void perform("answer_prayer", {
                  prayer: p.id,
                  answered: !p.answered,
                })
              }
            >
              {p.answered ? "Reabrir pedido" : "Marcar como atendido"}
            </Action>
          )}
          <Action
            requiresProfile
            secondary
            disabled={busy}
            onPress={() => void perform("support_prayer", { prayer: p.id })}
          >
            Orei por este pedido
          </Action>
          {moderator && p.visibility === "community" && (
            <>
              <Action
                secondary
                disabled={busy}
                onPress={() =>
                  void perform("moderate_prayer", {
                    prayer: p.id,
                    publish: true,
                  })
                }
              >
                Aprovar publicação
              </Action>
              <Action
                secondary
                disabled={busy}
                onPress={() =>
                  void perform("moderate_prayer", {
                    prayer: p.id,
                    publish: false,
                  })
                }
              >
                Retirar do mural
              </Action>
            </>
          )}
        </Card>
      ))}
      <Pages {...prayers} />
    </View>
  );
}
export function CoreManagement() {
  const [section, setSection] = useState<"posts" | "events" | "links">("posts");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState("youtube");
  const [preacher, setPreacher] = useState("");
  const [topic, setTopic] = useState("");
  const [preachedOn, setPreachedOn] = useState("");
  const [editing, setEditing] = useState<
    | { section: "posts"; record: Post }
    | { section: "events"; record: Event }
    | { section: "links"; record: Link }
    | null
  >(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [category, setCategory] = useState("Outros");
  const [paymentDetails,setPaymentDetails]=useState(""),[fundraisingDetails,setFundraisingDetails]=useState("");
  const [audience, setAudience] = useState("public");
  const [published, setPublished] = useState(false);
  const [selected, setSelected] = useState<Event | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const { busy, message, perform } = useAction();
  const posts = usePosts();
  const links = useLinks();
  const events = useEvents(true);
  const resetForm = () => {
    setEditing(null);
    setTitle("");
    setBody("");
    setUrl("");
    setPreacher("");
    setTopic("");
    setPreachedOn("");
    setStart("");
    setEnd("");
    setLocation("");
    setCapacity("");
    setCategory("Outros");
    setPaymentDetails("");setFundraisingDetails("");
    setAudience("public");
    setPublished(false);
  };
  const dateOnly =
    preachedOn === ""
      ? null
      : parseBrasilia(`${preachedOn} 00:00`)?.slice(0, 10);
  const starts =
    editing?.section === "events" &&
    start === formatBrasilia(editing.record.starts_at)
      ? editing.record.starts_at
      : parseBrasilia(start);
  const ends =
    editing?.section === "events" &&
    end === formatBrasilia(editing.record.ends_at)
      ? editing.record.ends_at
      : parseBrasilia(end);
  const validDates = starts && ends && Date.parse(ends) > Date.parse(starts);
  const validCapacity =
    capacity === "" ||
    (/^\d+$/.test(capacity) &&
      Number(capacity) > 0 &&
      Number(capacity) <= 100000);
  return (
    <View style={gap}>
      <Title>Gestão</Title>
      <Body>
        Prepare um rascunho ou publique conteúdo aprovado pela igreja. Confira o
        público antes de publicar.
      </Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {(["posts", "events", "links"] as const).map((s) => (
          <Action
            key={s}
            secondary={section !== s}
            disabled={busy}
            onPress={() => {
              resetForm();
              setSection(s);
            }}
          >
            {s === "posts" ? "Avisos" : s === "events" ? "Eventos" : "Links"}
          </Action>
        ))}
      </View>
      <Disclosure key={editing?.record.id ?? section} title={editing ? "Editar publicação" : section === "events" ? "Criar evento" : section === "posts" ? "Criar aviso" : "Adicionar link"} description="Preencha os dados e confira o público antes de publicar" open={!!editing}>
      {editing && (
        <>
          <Body>Editando: {editing.record.title}</Body>
          <Action secondary disabled={busy} onPress={resetForm}>
            Cancelar edição
          </Action>
        </>
      )}
      <Field
        label="Título"
        value={title}
        onChangeText={setTitle}
        maxLength={160}
      />
      {section !== "links" ? (
        <Field
          label="Descrição"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={6000}
        />
      ) : (
        <>
          <Action
            secondary
            onPress={() =>
              setKind(kind === "youtube" ? "devotional" : "youtube")
            }
          >
            {kind === "youtube"
              ? "Vídeo do YouTube"
              : "Link oficial de Pão Diário"}
          </Action>
          <Field
            label="Endereço HTTPS oficial"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
          {kind === "youtube" && (
            <>
              <Field
                label="Pregador"
                value={preacher}
                onChangeText={setPreacher}
                maxLength={160}
              />
              <Field
                label="Tema"
                value={topic}
                onChangeText={setTopic}
                maxLength={160}
              />
              <Field
                label="Data do culto (DD/MM/AAAA, opcional)"
                value={preachedOn}
                onChangeText={setPreachedOn}
                maxLength={10}
              />
            </>
          )}
        </>
      )}
      {section === "events" && (
        <>
          <Field
            label="Categoria"
            value={category}
            onChangeText={setCategory}
            maxLength={80}
          />
          <Field label="Local" value={location} onChangeText={setLocation} />
          <Field label="Pagamento (opcional)" value={paymentDetails} onChangeText={setPaymentDetails} multiline maxLength={2000}/>
          <Field label="Arrecadação (opcional)" value={fundraisingDetails} onChangeText={setFundraisingDetails} multiline maxLength={2000}/>
          <Field
            label="Início: DD/MM/AAAA HH:mm (Brasília)"
            value={start}
            onChangeText={setStart}
          />
          <Field
            label="Fim: DD/MM/AAAA HH:mm (Brasília)"
            value={end}
            onChangeText={setEnd}
          />
          <Field
            label="Lotação (vazio = sem limite)"
            value={capacity}
            onChangeText={setCapacity}
            keyboardType="number-pad"
          />
        </>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        <Action
          secondary={published}
          selected={!published}
          disabled={busy}
          onPress={() => setPublished(false)}
        >
          Rascunho
        </Action>
        <Action
          secondary={!published}
          selected={published}
          disabled={busy}
          onPress={() => setPublished(true)}
        >
          Publicado
        </Action>
      </View>
      {section !== "links" && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          <Action
            secondary={audience !== "public"}
            selected={audience === "public"}
            disabled={busy}
            onPress={() => setAudience("public")}
          >
            Público
          </Action>
          <Action
            secondary={audience !== "authenticated"}
            selected={audience === "authenticated"}
            disabled={busy}
            onPress={() => setAudience("authenticated")}
          >
            Somente pessoas conectadas
          </Action>
        </View>
      )}
      <Body>
        {published
          ? section === "links" || audience === "public"
            ? "Ao salvar, ficará visível inclusive para visitantes sem login."
            : "Ao salvar, ficará visível apenas para pessoas conectadas."
          : "Rascunho: visível apenas para a gestão."}
      </Body>
      <Action
        disabled={
          busy ||
          title.trim().length < 2 ||
          (section === "posts" && body.trim().length < 2) ||
          (section === "links" &&
            (!url.startsWith("https://") ||
              (kind === "youtube" && preachedOn !== "" && !dateOnly))) ||
          (section === "events" &&
            (!validDates || !validCapacity || category.trim().length < 2))
        }
        onPress={() => {
          const task =
            section === "posts"
              ? perform("save_announcement", {
                  resource: editing?.record.id ?? null,
                  title,
                  body,
                  audience,
                  published,
                })
              : section === "links"
                ? perform("save_content_link", {
                    resource: editing?.record.id ?? null,
                    kind,
                    title,
                    url,
                    published,
                    preacher: kind === "youtube" ? preacher : "",
                    topic: kind === "youtube" ? topic : "",
                    preached_on: kind === "youtube" ? dateOnly : null,
                  })
                : perform("save_event_information", {
                    resource: editing?.record.id ?? null,
                    title,
                    description: body,
                    location,
                    starts_at: starts,
                    ends_at: ends,
                    capacity: capacity ? Number(capacity) : null,
                    audience,
                    status: published ? "published" : "draft",
                    category,
                    payment_details:paymentDetails,
                    fundraising_details:fundraisingDetails,
                  });
          void task.then((ok) => {
            if (ok) {
              resetForm();
            }
          });
        }}
      >
        {editing
          ? "Salvar alterações"
          : published
            ? "Publicar"
            : "Salvar rascunho"}
      </Action>
      </Disclosure>
      {message ? <Body>{message}</Body> : null}
      {section === "posts" && !editing && (
        <>
          <Status
            pending={posts.isPending}
            error={posts.error}
            empty={!posts.data?.length}
            retry={() => void posts.refetch()}
          />
          {posts.data?.map((p) => (
            <Card key={p.id}>
              <Body>
                <RecordTitle title={p.title}/> · {p.published ? "Publicado" : "Rascunho"}
              </Body>
              <Action
                secondary
                disabled={busy}
                onPress={() => {
                  setEditing({ section: "posts", record: p });
                  setTitle(p.title);
                  setBody(p.body);
                  setAudience(p.audience);
                  setPublished(p.published);
                }}
              >
                Editar aviso
              </Action>
              <Action
                secondary
                disabled={busy}
                onPress={() => {
                  if(p.published&&!window.confirm("Retirar este comunicado da publicação? O texto será preservado como rascunho."))return;
                  void perform("save_announcement", {
                    resource: p.id,
                    title: p.title,
                    body: p.body,
                    audience: p.audience,
                    published: !p.published,
                  });
                }}
              >
                {p.published ? "Retirar aviso" : "Publicar aviso"}
              </Action>
            </Card>
          ))}
          <Pages {...posts} />
        </>
      )}
      {section === "links" && !editing && (
        <>
          <Status
            pending={links.isPending}
            error={links.error}
            empty={!links.data?.length}
            retry={() => void links.refetch()}
          />
          {links.data?.map((l) => (
            <Card key={l.id}>
              <Body>{l.title}</Body>
              <Action
                secondary
                disabled={busy}
                onPress={() => {
                  setEditing({ section: "links", record: l });
                  setTitle(l.title);
                  setUrl(l.url);
                  setKind(l.kind);
                  setPublished(l.published);
                  setPreacher(l.preacher);
                  setTopic(l.topic);
                  setPreachedOn(
                    l.preached_on?.split("-").reverse().join("/") ?? "",
                  );
                }}
              >
                Editar link
              </Action>
              <Action
                secondary
                disabled={busy}
                onPress={() =>
                  void perform("save_content_link", {
                    resource: l.id,
                    kind: l.kind,
                    title: l.title,
                    url: l.url,
                    published: !l.published,
                  })
                }
              >
                {l.published ? "Retirar link" : "Publicar link"}
              </Action>
            </Card>
          ))}
          <Pages {...links} />
        </>
      )}
      {section === "events" && !editing && (
        <>
          <Status
            pending={events.isPending}
            error={events.error}
            empty={!events.data?.length}
            retry={() => void events.refetch()}
          />
          {events.data?.map((e) => (
            <Card key={e.id}>
              <Body>
                {e.title} ·{" "}
                {e.status === "published"
                  ? "Publicado"
                  : e.status === "draft"
                    ? "Rascunho"
                    : "Cancelado"}
              </Body>
              <Action
                secondary
                disabled={busy || e.status === "canceled"}
                onPress={() => {
                  setEditing({ section: "events", record: e });
                  setTitle(e.title);
                  setBody(e.description);
                  setLocation(e.location);
                  setPaymentDetails(e.payment_details ?? "");
                  setFundraisingDetails(e.fundraising_details ?? "");
                  setCapacity(e.capacity?.toString() ?? "");
                  setCategory(e.category);
                  setStart(formatBrasilia(e.starts_at));
                  setEnd(formatBrasilia(e.ends_at));
                  setAudience(e.audience);
                  setPublished(e.status === "published");
                }}
              >
                Editar evento
              </Action>
              <Action secondary onPress={() => setSelected(e)}>
                Gerenciar itens e presença
              </Action>
              {cancelId === e.id ? (
                <>
                  <Body>
                    Confirmar cancelamento? Inscrições, reservas e lembretes
                    serão cancelados.
                  </Body>
                  <Action
                    disabled={busy}
                    onPress={() =>
                      void perform("save_event", {
                        resource: e.id,
                        title: e.title,
                        description: e.description,
                        location: e.location,
                        starts_at: e.starts_at,
                        ends_at: e.ends_at,
                        capacity: e.capacity,
                        audience: e.audience,
                        status: "canceled",
                        category: e.category,
                      }).then((ok) => {
                        if (ok) setCancelId(null);
                      })
                    }
                  >
                    Confirmar cancelamento
                  </Action>
                  <Action secondary onPress={() => setCancelId(null)}>
                    Voltar
                  </Action>
                </>
              ) : (
                <Action
                  secondary
                  disabled={busy || e.status === "canceled"}
                  onPress={() => setCancelId(e.id)}
                >
                  Cancelar evento e inscrições
                </Action>
              )}
            </Card>
          ))}
          <Pages {...events} />
          {selected && (
            <Card>
              <Body>Itens: {selected.title}</Body>
              <EventItemsManagement
                key={selected.id}
                eventId={selected.id}
                closed={
                  (events.data?.find((e) => e.id === selected.id) ?? selected)
                    .status === "canceled"
                }
              />
              <Roster key={selected.id} event={selected.id} />
            </Card>
          )}
        </>
      )}
    </View>
  );
}
export function EventItemsManagement({
  eventId,
  closed,
}: {
  eventId: string;
  closed: boolean;
}) {
  const items = usePage<Item>(["managed-items", eventId], (page) =>
    rpc("item_availability_page", { event: eventId, page }),
  );
  const [editing, setEditing] = useState<Item | null>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const { busy, message, perform } = useAction();
  const amount = /^\d+$/.test(quantity) ? Number(quantity) : NaN;
  const current = items.data?.find((i) => i.id === editing?.id) ?? editing;
  const reserved = current
    ? Number(current.quantity) - Number(current.remaining)
    : 0;
  const reset = () => {
    setEditing(null);
    setName("");
    setQuantity("1");
  };
  return (
    <View style={gap}>
      {closed ? (
        <Body>Evento cancelado. Os itens ficam disponíveis para consulta.</Body>
      ) : (
        <>
          {editing && (
            <Body>
              Editando item: {editing.name} · Reservas existentes: {reserved}
            </Body>
          )}
          <Field
            label="Nome do item"
            value={name}
            onChangeText={setName}
            maxLength={160}
          />
          <Field
            label="Quantidade total"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
          />
          {editing && Number.isFinite(amount) && amount < reserved && (
            <Body>
              A quantidade total não pode ser menor que as reservas existentes.
            </Body>
          )}
          <Action
            disabled={
              busy ||
              name.trim().length < 2 ||
              !Number.isSafeInteger(amount) ||
              amount < 1 ||
              amount > 100000 ||
              amount < reserved
            }
            onPress={() =>
              void perform("save_event_item", {
                resource: editing?.id ?? null,
                event: eventId,
                name: name.trim(),
                quantity: amount,
              }).then((ok) => {
                if (ok) reset();
              })
            }
          >
            {editing ? "Salvar item" : "Adicionar item"}
          </Action>
          {editing && (
            <Action secondary disabled={busy} onPress={reset}>
              Cancelar edição do item
            </Action>
          )}
        </>
      )}
      {message ? <Body>{message}</Body> : null}
      <Status
        pending={items.isPending}
        error={items.error}
        empty={!items.data?.length}
        retry={() => void items.refetch()}
      />
      {!editing &&
        items.data?.map((i) => (
          <Card key={i.id}>
            <Body>
              {i.name} · Total: {i.quantity} · Reservados:{" "}
              {Number(i.quantity) - Number(i.remaining)}
            </Body>
            {!closed && (
              <Action
                secondary
                disabled={busy}
                onPress={() => {
                  setEditing(i);
                  setName(i.name);
                  setQuantity(String(i.quantity));
                }}
              >
                {`Editar item: ${i.name}`}
              </Action>
            )}
          </Card>
        ))}
      {!editing && <Pages {...items} />}
    </View>
  );
}
function Roster({ event }: { event: string }) {
  const roster = usePage(["roster", event], (page) =>
    rpc<
      {
        person_id: string;
        full_name: string;
        status: string;
        attended: boolean;
      }[]
    >("event_roster_page", { event, page }),
  );
  const { busy, message, perform } = useAction();
  return (
    <View style={gap}>
      <Title>Presença</Title>
      <Status
        pending={roster.isPending}
        error={roster.error}
        empty={!roster.data?.length}
        retry={() => void roster.refetch()}
      />
      {roster.data?.map((r) => (
        <Card key={r.person_id}>
          <Body>
            {r.full_name} ·{" "}
            {r.status === "registered" ? "Inscrito" : "Cancelado"}
          </Body>
          {r.status === "registered" && (
            <Action
              secondary
              disabled={busy}
              onPress={() =>
                void perform("set_event_attendance", {
                  event,
                  person: r.person_id,
                  present: !r.attended,
                })
              }
            >
              {r.attended ? "✓ Presente — desfazer" : "Marcar presença"}
            </Action>
          )}
        </Card>
      ))}
      {message ? <Body>{message}</Body> : null}
      <Pages {...roster} />
    </View>
  );
}
