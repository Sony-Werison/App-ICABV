"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Handshake, Heart, HeartHandshake } from "lucide-react";
import { ModuleState, moduleRpc, useModuleAction } from "./module-ui";
import { ModuleDialog } from "./module-dialog";
import { AgendaCalendar, type AgendaVisibility } from "./agenda-calendar";
import { calendarDate } from "./agenda-calendar-model";

type Availability = { availability_kind: "visitor" | "host"; weekdays: number[] | null; available_dates: string[]; frequency: number | null; frequency_unit: "week" | "month" | null };
type Opportunity = { host_id: string; host_name: string; visit_date: string; matching_my_availability: boolean };
type Visit = { id: string; visitor_id: string; visitor_name: string; host_id: string; host_name: string; visit_date: string; visitor_outcome: "completed" | "not_completed" | null; host_outcome: "completed" | "not_completed" | null; visitor_justification: string };
const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export function Visits({ personId }: { personId: string }) {
  const client = useQueryClient(), action = useModuleAction();
  const availability = useQuery({ queryKey: ["visits", "availability", personId], queryFn: () => moduleRpc<Availability[]>("my_visit_availability") });
  const opportunities = useQuery({ queryKey: ["visits", "opportunities", personId], queryFn: () => moduleRpc<Opportunity[]>("visit_opportunities") });
  const visits = useQuery({ queryKey: ["visits", "history", personId], queryFn: () => moduleRpc<Visit[]>("my_visits") });
  const [daysByKind, setDaysByKind] = useState<number[] | null>(null);
  const [hostDates, setHostDates] = useState<string[] | null>(null);
  const [frequencyByKind, setFrequencyByKind] = useState<Record<Availability["availability_kind"], { count: number; unit: "week" | "month" }>>({ visitor: { count: 1, unit: "week" }, host: { count: 1, unit: "week" } });
  const [outcomeChoice, setOutcomeChoice] = useState<Record<string, "completed" | "not_completed" | "">>({});
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [availabilityScreen, setAvailabilityScreen] = useState<Availability["availability_kind"] | null>(null);
  const [calendarMonth,setCalendarMonth] = useState(()=>calendarDate(new Date().toISOString()).slice(0,7));
  const stored = availability.data ?? [];
  const matching = opportunities.data?.filter(item => item.matching_my_availability) ?? [];
  const outsideAgenda = opportunities.data?.filter(item => !item.matching_my_availability) ?? [];
  useEffect(() => {
    if (!availability.data) return;
    const visitor=availability.data!.find(row=>row.availability_kind==="visitor");
    const host=availability.data!.find(row=>row.availability_kind==="host");
    setDaysByKind(old => old ?? visitor?.weekdays ?? []);
    setHostDates(old => old ?? host?.available_dates ?? []);
    if(visitor?.frequency&&visitor.frequency_unit)setFrequencyByKind(old=>({...old,visitor:{count:visitor.frequency!,unit:visitor.frequency_unit as "week"|"month"}}));
  }, [availability.data]);
  const saveAvailability = async (kind: Availability["availability_kind"]) => {
    const current = stored.find(row => row.availability_kind === kind);
    const selectedDays = daysByKind ?? current?.weekdays ?? [];
    const selectedDates = hostDates ?? current?.available_dates ?? [];
    if (kind==="visitor"&&!selectedDays.length||kind==="host"&&!selectedDates.length) return;
    const frequency = frequencyByKind.visitor;
    const saved = await action.act(() => moduleRpc("save_visit_availability", { availability_kind: kind, weekdays: kind==="visitor"?selectedDays:null, available_dates:kind==="host"?selectedDates:[], frequency: kind==="visitor"?frequency.count:null, frequency_unit: kind==="visitor"?frequency.unit:null }), "Disponibilidade atualizada.");
    if (saved) await Promise.all([client.invalidateQueries({ queryKey: ["visits"] }), availability.refetch()]);
  };
  const removeAvailability = async (kind: Availability["availability_kind"]) => {
    const saved = await action.act(() => moduleRpc("remove_visit_availability", { availability_kind: kind }), "Disponibilidade removida.");
    if (saved) {
      if(kind==="visitor")setDaysByKind(null);else setHostDates(null);
      await Promise.all([client.invalidateQueries({ queryKey: ["visits"] }), availability.refetch()]);
    }
  };
  const confirm = async (id: string) => {
    const visit = visits.data?.find(item => item.id === id);
    const ownVisitor = visit?.visitor_id === personId;
    const outcome = outcomeChoice[id];
    if (!outcome) return;
    const saved = await action.act(() => moduleRpc("report_visit_outcome", { visit: id, outcome, justification: ownVisitor && outcome === "not_completed" ? justifications[id] ?? "" : "" }), "Sua resposta foi registrada.");
    if (saved) await client.invalidateQueries({ queryKey: ["visits"] });
  };
  const claim = async (opportunity: Opportunity) => {
    const saved = await action.act(() => moduleRpc("claim_visit", { host: opportunity.host_id, visit_on: opportunity.visit_date }), "Visita combinada.");
    if (saved) await client.invalidateQueries({ queryKey: ["visits"] });
  };

  return <div className="module-page visits-page">
    {!availabilityScreen&&<section className="visits-preferences visits-preferences-top"><button className="icabv-card visit-preference-link" aria-label="Cadastrar disponibilidade para visitar" onClick={() => setAvailabilityScreen("visitor")}><span className="visit-preference-icon"><Handshake size={20} aria-hidden="true"/></span><span><strong>VISITAR</strong><small>Marque os dias em que pode visitar</small></span></button><button className="icabv-card visit-preference-link" aria-label="Cadastrar disponibilidade para ser visitado" onClick={() => setAvailabilityScreen("host")}><span className="visit-preference-icon"><Heart size={19} fill="currentColor" aria-hidden="true"/></span><span><strong>SER VISITADO</strong><small>Marque as datas em que pode receber</small></span></button></section>}
    <header className="module-heading"><span className="church-label"><HeartHandshake size={15} aria-hidden="true"/> CUIDADO E COMUNHÃO</span><h1>Visitas</h1></header>
    {action.notice}
    {stored.length>0&&<section className="icabv-card visits-saved-availability" aria-label="Disponibilidades cadastradas"><h2>Minhas disponibilidades</h2>{stored.map(item=>item.availability_kind==="visitor"?<p key={item.availability_kind}><strong>Para visitar:</strong> {item.weekdays?.length?item.weekdays.map(day=>days[day-1]).join(", "):"nenhum dia selecionado"}{item.frequency&&item.frequency_unit?` · a cada ${item.frequency} ${item.frequency_unit==="week"?"semana(s)":"mês(es)"}`:""}</p>:<p key={item.availability_kind}><strong>Para receber visitas:</strong> {item.available_dates?.length?item.available_dates.map(dateLabel).join(" · "):"nenhuma data selecionada"}</p>)}</section>}
    {availabilityScreen&&<ModuleDialog title={availabilityScreen === "visitor" ? "Disponibilidade para visitar" : "Disponibilidade para receber visitas"} onClose={() => setAvailabilityScreen(null)}><AvailabilityScreen kind={availabilityScreen} current={stored.find(row => row.availability_kind === availabilityScreen)} days={daysByKind} dates={hostDates} frequency={frequencyByKind.visitor} month={calendarMonth} onMonth={setCalendarMonth} busy={action.busy} onDays={setDaysByKind} onDates={setHostDates} onFrequency={value => setFrequencyByKind(old => ({ ...old, visitor: value }))} onSave={() => void saveAvailability(availabilityScreen)} onRemove={() => void removeAvailability(availabilityScreen)} /></ModuleDialog>}
    <ModuleState query={opportunities}><section className="visits-section"><div className="member-heading"><h2>Oportunidades de visitas na sua agenda</h2></div><OpportunityList items={matching} busy={action.busy} onClaim={item => void claim(item)} empty="Nenhuma oportunidade coincide com sua disponibilidade cadastrada."/></section>
    <section className="visits-section"><div className="member-heading"><h2>Oportunidades de visitas fora da sua agenda</h2></div><p>Você também pode assumir estas oportunidades mesmo sem ter cadastrado seus próprios dias.</p><OpportunityList items={outsideAgenda} busy={action.busy} onClaim={item => void claim(item)} empty="Ainda não há outras oportunidades disponíveis."/></section></ModuleState>
    <section className="visits-section"><div className="member-heading"><h2>Registro de visitas</h2></div><p>Após a data, as duas pessoas informam se a visita aconteceu. Se o visitante marcar que não aconteceu, ele informa o motivo.</p><ModuleState query={visits}>{visits.data?.length ? <div className="visit-history">{visits.data.map(item => { const ownVisitor = item.visitor_id === personId; const mineOutcome = ownVisitor ? item.visitor_outcome : item.host_outcome; const otherOutcome = ownVisitor ? item.host_outcome : item.visitor_outcome; const past = item.visit_date <= new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date()); const outcomeLabel = (value: Visit["visitor_outcome"]) => value === "completed" ? "A visita aconteceu" : value === "not_completed" ? "A visita não aconteceu" : "Resposta pendente"; const selected = outcomeChoice[item.id] ?? ""; return <article className="icabv-card visit-history-row" key={item.id}><div><strong>{ownVisitor ? `Visita a ${item.host_name}` : `Visita de ${item.visitor_name}`}</strong><p>{dateLabel(item.visit_date)}</p>{item.visitor_justification&&<small>Motivo informado pelo visitante: {item.visitor_justification}</small>}</div><div className="visit-confirmations"><span className={mineOutcome ? "is-confirmed" : ""}>{ownVisitor ? "Você" : "Visitante"}: {outcomeLabel(ownVisitor ? item.visitor_outcome : item.visitor_outcome)}</span><span className={otherOutcome ? "is-confirmed" : ""}>{ownVisitor ? "Visitado" : "Você"}: {outcomeLabel(ownVisitor ? item.host_outcome : item.host_outcome)}</span></div>{!mineOutcome && past && <div className="visit-outcome-form"><label className="icabv-field">A visita aconteceu?<select value={selected} onChange={event => setOutcomeChoice(old => ({ ...old, [item.id]: event.target.value as "completed" | "not_completed" | "" }))}><option value="">Selecione</option><option value="completed">Sim</option><option value="not_completed">Não</option></select></label>{ownVisitor && selected === "not_completed" && <label className="icabv-field">Por que a visita não aconteceu?<textarea value={justifications[item.id] ?? ""} maxLength={500} onChange={event => setJustifications(old => ({ ...old, [item.id]: event.target.value }))}/></label>}<button className="secondary" disabled={action.busy || !selected || (ownVisitor && selected === "not_completed" && (justifications[item.id] ?? "").trim().length < 5)} onClick={() => void confirm(item.id)}><Check size={16}/>Registrar resposta</button></div>}</article>; })}</div> : <p className="church-empty">Suas visitas combinadas aparecerão aqui.</p>}</ModuleState></section>
  </div>;
}

function OpportunityList({ items, busy, onClaim, empty }: { items: Opportunity[]; busy: boolean; onClaim: (item: Opportunity) => void; empty: string }) {
  return items.length ? <div className="visit-opportunities">{items.map(item => <article className="icabv-card visit-opportunity" key={`${item.host_id}-${item.visit_date}`}><span className="visit-date-icon"><CalendarDays size={19}/></span><div><strong>{item.host_name}</strong><p>{dateLabel(item.visit_date)}</p></div><button className="primary" disabled={busy} onClick={() => onClaim(item)}>Assumir</button></article>)}</div> : <p className="church-empty">{empty}</p>;
}

function AvailabilityScreen({ kind, current, days: selectedDays, dates: selectedDates, onDays, onDates, frequency, onFrequency, month, onMonth, busy, onSave, onRemove }: { kind: "visitor" | "host"; current?: Availability; days: number[] | null; dates: string[] | null; onDays: (days: number[]) => void; onDates:(dates:string[])=>void; frequency: { count: number; unit: "week" | "month" }; onFrequency: (value: { count: number; unit: "week" | "month" }) => void; month:string; onMonth:(month:string)=>void; busy: boolean; onSave: () => void; onRemove: () => void }) {
  const weekdays=selectedDays??current?.weekdays??[];
  const today=calendarDate(new Date().toISOString());
  const maxDate=new Date(`${today}T12:00:00Z`);maxDate.setUTCDate(maxDate.getUTCDate()+90);
  const end=maxDate.toISOString().slice(0,10);
  const dates=selectedDates??current?.available_dates??[];
  const onDate=(date:string)=>onDates(dates.includes(date)?dates.filter(value=>value!==date):[...dates,date].sort());
  const noVisibility:AgendaVisibility={events:false,birthdays:false,schedules:false};
  return <section className="visit-preference">
    {kind==="visitor"?<><p>Selecione os dias da semana em que pode visitar e com que frequência.</p><div className="visit-weekdays" role="group" aria-label="Dias para visitar">{days.map((day,index)=><button type="button" key={day} aria-pressed={weekdays.includes(index+1)} onClick={()=>onDays(weekdays.includes(index+1)?weekdays.filter(value=>value!==index+1):[...weekdays,index+1].sort())}>{day.slice(0,3)}</button>)}</div><div className="visit-frequency"><label className="icabv-field">A cada<select value={frequency.count} onChange={event=>onFrequency({...frequency,count:Number(event.target.value)})}>{Array.from({length:12},(_,index)=><option value={index+1} key={index}>{index+1}</option>)}</select></label><label className="icabv-field">Frequência<select value={frequency.unit} onChange={event=>onFrequency({...frequency,unit:event.target.value as "week"|"month"})}><option value="week">semanas</option><option value="month">meses</option></select></label></div></>:<><p>Selecione no calendário as datas em que pode receber uma visita.</p><AgendaCalendar events={[]} month={month} selectedDate={null} selectedDates={dates} selectionLimits={{min:today,max:end}} onToggleDate={onDate} onMonthChange={onMonth} onSelectDate={()=>{}} visibility={noVisibility} onVisibilityChange={()=>{}} hideFilters hideToday/><p className="visit-selected-days">Datas selecionadas: {dates.length?dates.map(dateLabel).join(" · "):"nenhuma"}</p></>}
    <div className="visit-preference-actions"><button className="secondary" disabled={busy||(kind==="visitor"?!weekdays.length:!dates.length)} onClick={onSave}>{current ? "Atualizar disponibilidade" : "Cadastrar disponibilidade"}</button>{current&&<button className="text-btn" disabled={busy} onClick={onRemove}>Parar esta disponibilidade</button>}</div></section>;
}
