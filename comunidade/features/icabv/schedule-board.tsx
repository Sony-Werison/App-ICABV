"use client";
import { useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, Mic, BookOpen, Monitor } from "lucide-react";
import { groupSchedule, scheduleDate, type ScheduleEntry } from "./schedule-model";

const monthLabel = (month: string) => new Intl.DateTimeFormat("pt-BR", {month:"long", year:"numeric", timeZone:"UTC"}).format(new Date(`${month}-15T12:00:00Z`));
function DateLabel({date}:{date:string}) {
  const day = new Date(`${date}T12:00:00Z`);
  return <time dateTime={date}><span className="schedule-weekday-full">{new Intl.DateTimeFormat("pt-BR", {weekday:"long",timeZone:"UTC"}).format(day)}</span><span className="schedule-weekday-short" aria-hidden="true">{new Intl.DateTimeFormat("pt-BR", {weekday:"short",timeZone:"UTC"}).format(day).replace(".","")}</span><strong>{date.slice(8)}/{date.slice(5,7)}</strong></time>;
}
function RoleIcon({role}:{role:string}) {
  const Icon = /abertura/i.test(role) ? Mic : /prega/i.test(role) ? BookOpen : /multim/i.test(role) ? Monitor : ClipboardList;
  return <Icon size={17} aria-hidden="true" />;
}
function PersonName({name,split}:{name:string;split:boolean}) {
  const parts=name.trim().split(/\s+/);
  return <strong>{split&&parts.length>1?<><span className="schedule-name-line">{parts[0]} </span><span className="schedule-name-line">{parts.slice(1).join(" ")}</span></>:name}</strong>;
}
function GroupParticipants({participants}:{participants:NonNullable<ScheduleEntry['participants']>}) {
  const roles=[...new Set(participants.map(person=>person.role))];
  return <span className="schedule-inline-participants">{roles.map(role=><span key={role}>{roles.length>1&&<b>{role}: </b>}{participants.filter(person=>person.role===role).map(person=>person.name).join(", ")}</span>)}</span>;
}
export function ScheduleBoard({ entries, month: controlledMonth, onMonthChange, onSelect, canSelect = () => true, label = "Escala", emptyCellLabel="A definir" }: {
  entries: ScheduleEntry[]; month?:string; onMonthChange?:(month:string)=>void; onSelect?:(entry:ScheduleEntry)=>void; canSelect?:(entry:ScheduleEntry)=>boolean; label?:string;emptyCellLabel?:string;
}) {
  const [localMonth,setLocalMonth]=useState(()=>scheduleDate(new Date().toISOString()).slice(0,7));
  const [group,setGroup]=useState("");
  const month=controlledMonth && /^\d{4}-\d{2}$/.test(controlledMonth) ? controlledMonth : localMonth;
  const changeMonth=(value:string)=>{ if(!/^\d{4}-\d{2}$/.test(value))return; setLocalMonth(value); onMonthChange?.(value); };
  const moveMonth=(offset:number)=>{const date=new Date(`${month}-15T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+offset);changeMonth(date.toISOString().slice(0,7));};
  const groups=[...new Set(entries.map(entry=>entry.group))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const activeGroup=groups.includes(group)?group:"";
  const {columns,rows}=groupSchedule(entries,month,activeGroup);
  const months=[...new Set(entries.filter(entry=>!activeGroup||entry.group===activeGroup).map(entry=>entry.date.slice(0,7)))].sort().reverse();
  const renderEntries=(cellEntries:ScheduleEntry[],role:string,date:string)=>{
    const people=cellEntries.flatMap(entry=>entry.people);
    const unique=[...new Map(people.map(person=>[person.id,person])).values()];
    if(cellEntries.length>1 && unique.length<people.length && cellEntries.every(entry=>!entry.canceled&&!entry.people.some(person=>person.status))) {
      return <div className="schedule-cell-entries"><div className="schedule-cell-content">{unique.map(person=><span className="schedule-person" key={person.id}><span className="schedule-avatar" aria-hidden="true">{person.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("")}</span><PersonName name={person.name} split={!/multim/i.test(role)&&!cellEntries.some(entry=>entry.groupColor)}/></span>)}</div>

      </div>;
    }
    return <div className="schedule-cell-entries">{cellEntries.length?cellEntries.map((entry,index)=>{
    const content=<>{groups.length>1&&!activeGroup&&<small className="schedule-cell-group">{entry.group}</small>}{entry.people.length?entry.people.map(person=><span className="schedule-person" key={person.id}>
      <span className="schedule-avatar" aria-hidden="true">{person.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("")}</span>
      <span><PersonName name={person.name} split={!/multim/i.test(role)&&!entry.groupColor}/>{person.status&&<small>{person.status}</small>}</span>
    </span>):<span className="schedule-unassigned">A definir</span>}{entry.participants?.length?<GroupParticipants participants={entry.participants}/>:null}{entry.canceled&&<small className="schedule-canceled">Cancelada</small>}</>;
    return onSelect&&canSelect(entry)?<button type="button" key={`${entry.id}-${index}`} className={`schedule-cell-button${entry.participants?.length?" schedule-group-with-members":""}`} data-colored-group={entry.groupColor?true:undefined} style={entry.groupColor?{"--schedule-group-color":entry.groupColor,"--schedule-group-ink":entry.groupInk} as CSSProperties:undefined} title={entry.detail} aria-label={`${entry.people.map(p=>p.name).join(", ")||"A definir"}${entry.participants?.length?` · ${entry.participants.map(p=>p.name).join(", ")}`:""} · ${role} · ${date.split("-").reverse().join("/")}${entry.canceled?" · Cancelada":""} · Ver detalhes`} onClick={()=>onSelect(entry)}>{content}</button>:<div key={`${entry.id}-${index}`} className={`schedule-cell-content${entry.participants?.length?" schedule-group-with-members":""}`} data-colored-group={entry.groupColor?true:undefined} style={entry.groupColor?{"--schedule-group-color":entry.groupColor,"--schedule-group-ink":entry.groupInk} as CSSProperties:undefined} title={entry.detail}>{content}</div>;
  }):<span className="schedule-unassigned">{emptyCellLabel}</span>}</div>;
  };
  return <section className="schedule-board" aria-label={`${label} de ${monthLabel(month)}`}>
    <div className="schedule-board-toolbar">
      <div className="schedule-month-control"><button className="icon-btn" type="button" aria-label="Mês anterior da escala" onClick={()=>moveMonth(-1)}><ChevronLeft size={19}/></button>
        <label><span className="sr-only">Mês da escala</span><input aria-label="Mês da escala" type="month" value={month} onChange={e=>changeMonth(e.target.value)}/></label>
        <button className="icon-btn" type="button" aria-label="Próximo mês da escala" onClick={()=>moveMonth(1)}><ChevronRight size={19}/></button>
      </div>
      {groups.length>1&&<label className="schedule-group-filter">Equipe<select aria-label="Equipe da escala" value={activeGroup} onChange={e=>setGroup(e.target.value)}><option value="">Todas as equipes</option>{groups.map(value=><option key={value}>{value}</option>)}</select></label>}
    </div>
    {rows.length?<>
      <div className="schedule-table-wrap" role="region" aria-label="Quadro mensal de escalas" tabIndex={0}>
        <table className="schedule-table"><colgroup><col className="schedule-date-column"/>{columns.map(role=><col key={role}/>)}</colgroup><caption className="sr-only">{label} de {monthLabel(month)}</caption><thead><tr><th scope="col">Data</th>{columns.map(role=><th scope="col" key={role}><span><RoleIcon role={role}/>{role}</span></th>)}</tr></thead>
          <tbody>{rows.map(row=><tr key={row.date}><th scope="row"><DateLabel date={row.date}/></th>{row.cells.map(cell=><td key={cell.role}>{renderEntries(cell.entries,cell.role,row.date)}</td>)}</tr>)}</tbody>
        </table>
      </div>

    </>:<div className="church-empty"><p>Nenhuma escala neste mês{activeGroup?` para ${activeGroup}`:""}.</p>{months.length>0&&<button className="text-btn" onClick={()=>changeMonth(months[0])}>Ver {monthLabel(months[0])}</button>}</div>}
  </section>;
}
