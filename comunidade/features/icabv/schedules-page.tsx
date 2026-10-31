"use client";
import {useState} from "react";
import {scheduleDate} from "./schedule-model";
import {useAgendaCommitments} from "./agenda-commitments";
import {AgendaCommitmentCard} from "./agenda-commitment-card";
import {MyServiceShifts} from "./community-screen";
import {DutyRosters} from "./duty-rosters";
import {WorshipAssignments} from "./worship";

const currentBrasiliaMonth = () => scheduleDate(new Date().toISOString()).slice(0,7);
export function SchedulesPage({personId,onOpen}:{personId:string;onOpen:(serviceId?:string)=>void}) {
  const [tab,setTab]=useState("Cultos"),[month,setMonth]=useState(currentBrasiliaMonth),[selected,setSelected]=useState<string|null>(null);
  const mine=useAgendaCommitments(personId,month,false);
  const items=mine.items.filter(item=>item.kind==="schedule");
  const upcoming=mine.upcoming.filter(item=>item.kind==="schedule");
  const detail=[...items,...upcoming].find(item=>item.id===selected);
  return <div className="module-page schedules-page">
    <h1>Escalas</h1>
    <nav className="schedule-view-tabs" aria-label="Tipos de escala">{["Cultos","Lanches","Limpeza","Minhas participações"].map(name=><button className="schedule-view-tab" key={name} type="button" aria-current={tab===name?"page":undefined} onClick={()=>{setTab(name);setMonth(currentBrasiliaMonth());setSelected(null);}}>{name}</button>)}</nav>
    {tab==="Minhas participações"?<section className="icabv-card">
      {mine.pending?<p role="status">Carregando suas participações…</p>:upcoming.length?<ul className="schedule-upcoming-list">{upcoming.slice(0,20).map(item=><li key={item.id}><time dateTime={item.date}>{new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${item.date}T12:00:00Z`))}{item.time?` · ${item.time}`:""}</time><div><strong>{item.title}</strong><span>{item.description} · {item.status??"Confirmada"}</span></div><button className="text-btn" onClick={()=>{if(item.source==="worship")onOpen(item.targetId);else setSelected(item.id);}}>Ver detalhes</button></li>)}</ul>:<p className="church-empty">Você não tem próximos compromissos cadastrados.</p>}
      {mine.paused&&<p role="status">Algumas participações ainda não estão disponíveis neste dispositivo. Conecte-se para carregá-las.</p>}
      {mine.errors.length>0&&<div role="alert"><p>Não foi possível carregar {mine.errors.join(", ")}.</p><button className="text-btn" onClick={mine.retry}>Tentar novamente</button></div>}
      {detail?.source==="service"&&<MyServiceShifts key={detail.id} showBoard={false} initialDetailId={detail.targetId}/>}
      {(detail?.source==="record"||detail?.source==="roster")&&<AgendaCommitmentCard key={detail.id} item={detail}/>}
    </section>:tab==="Cultos"?<WorshipAssignments personId={personId} month={month} onMonthChange={setMonth}/>:<DutyRosters key={tab} title={tab==="Lanches"?"Lanches e sucos EBD":"Limpeza"} month={month} onMonthChange={setMonth}/>}
  </div>;
}
