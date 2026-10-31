"use client";
import {useId} from "react";
import {ChevronLeft,ChevronRight,Cake,ClipboardList,CalendarDays} from "lucide-react";
import {calendarDate,eventOnDate,monthDates,type CalendarEvent,type AgendaCommitment} from "./agenda-calendar-model";
export type AgendaVisibility={events:boolean;birthdays:boolean;schedules:boolean};
export function AgendaCalendar({events,month,selectedDate,onMonthChange,onSelectDate,loading=false,commitments=[],visibility,onVisibilityChange,selectedDates,onToggleDate,selectionLimits,hideFilters=false,hideToday=false}:{events:CalendarEvent[];month:string;selectedDate:string|null;onMonthChange:(month:string)=>void;onSelectDate:(date:string|null)=>void;loading?:boolean;commitments?:AgendaCommitment[];visibility:AgendaVisibility;onVisibilityChange:(visibility:AgendaVisibility)=>void;selectedDates?:string[];onToggleDate?:(date:string)=>void;selectionLimits?:{min:string;max:string};hideFilters?:boolean;hideToday?:boolean}) {
  const id=useId(),today=calendarDate(new Date().toISOString()),dates=monthDates(month);
  const title=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${month}-15T12:00:00Z`));
  const move=(offset:number)=>{const date=new Date(`${month}-15T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+offset);onMonthChange(date.toISOString().slice(0,7));};
  const weekdays=["Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado","Domingo"];
  const selectFilter=(key:keyof AgendaVisibility)=>{
    const onlyThis=visibility[key]&&Object.entries(visibility).every(([name,on])=>name===key||!on);
    onVisibilityChange(onlyThis?{events:true,birthdays:true,schedules:true}:{events:key==="events",birthdays:key==="birthdays",schedules:key==="schedules"});
  };
  return <section className="agenda-calendar" aria-labelledby={id} aria-busy={loading}>
    <div className="agenda-calendar-heading"><button className="icon-btn" aria-label="Mês anterior da agenda" onClick={()=>move(-1)}><ChevronLeft size={18}/></button><h3 id={id}>{title.replace(/^./,letter=>letter.toUpperCase())}</h3><button className="icon-btn" aria-label="Próximo mês da agenda" onClick={()=>move(1)}><ChevronRight size={18}/></button></div>
    <table className="agenda-calendar-table"><caption className="sr-only">Calendário de {title}. Dias marcados têm eventos, aniversários ou suas escalas.</caption><thead><tr>{weekdays.map(day=><th key={day} scope="col" aria-label={day}>{day.slice(0,3)}</th>)}</tr></thead><tbody>{Array.from({length:dates.length/7},(_,week)=><tr key={week}>{dates.slice(week*7,week*7+7).map((date,index)=>{
      if(!date)return <td key={index}/>;
      const dayEvents=events.filter(event=>eventOnDate(event,date));
      const birthdays=commitments.filter(item=>item.kind==="birthday"&&item.date===date);
      const schedules=commitments.filter(item=>item.kind==="schedule"&&item.date===date);
      const hasCommitments=dayEvents.length+birthdays.length+schedules.length>0;
      const description=new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`));
      const isSelected=selectedDates?selectedDates.includes(date):date===selectedDate; const outsideLimits=!!selectionLimits&&(date<selectionLimits.min||date>selectionLimits.max);
      return <td key={date}><button className={`agenda-calendar-day${hasCommitments?" has-events":""}${birthdays.length?" has-birthdays":""}${schedules.length?" has-schedules":""}`} aria-label={`${description} · ${dayEvents.length} ${dayEvents.length===1?"evento":"eventos"}${birthdays.length?` · ${birthdays.length} ${birthdays.length===1?"aniversário":"aniversários"}`:""}${schedules.length?` · ${schedules.length} ${schedules.length===1?"escala":"escalas"}`:""}`} aria-current={date===today?"date":undefined} aria-pressed={isSelected} disabled={loading||outsideLimits} onClick={()=>selectedDates&&onToggleDate?onToggleDate(date):onSelectDate(date===selectedDate?null:date)} onKeyDown={event=>{
        const offset=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7} as Record<string,number>)[event.key];
        if(!offset)return;const next=dates.indexOf(date)+offset;if(!dates[next])return;
        event.preventDefault();document.getElementById(`${id}-${dates[next]}`)?.focus();
      }} id={`${id}-${date}`}><span>{Number(date.slice(8))}</span>{hasCommitments&&<span className="agenda-calendar-markers" aria-hidden="true">{dayEvents.length>0&&<CalendarDays className="agenda-event-icon" size={11}/>}{birthdays.length>0&&<Cake className="agenda-birthday-icon" size={11}/>}{schedules.length>0&&<ClipboardList className="agenda-schedule-icon" size={11}/>}</span>}</button></td>;
    })}</tr>)}</tbody></table>
    {(!hideFilters||!hideToday)&&<div className="agenda-calendar-legend">{!hideFilters&&<div className="agenda-calendar-key" role="group" aria-label="Compromissos visíveis">
      <button className="agenda-calendar-filter" type="button" aria-pressed={visibility.events} onClick={()=>selectFilter("events")}><CalendarDays className="agenda-event-icon" size={14} aria-hidden="true"/>Eventos</button>
      <button className="agenda-calendar-filter" type="button" aria-pressed={visibility.birthdays} onClick={()=>selectFilter("birthdays")}><Cake className="agenda-birthday-icon" size={14} aria-hidden="true"/>Aniversários</button>
      <button className="agenda-calendar-filter" type="button" aria-pressed={visibility.schedules} onClick={()=>selectFilter("schedules")}><ClipboardList className="agenda-schedule-icon" size={14} aria-hidden="true"/>Minhas escalas</button>
    </div>}{!hideToday&&<button className="text-btn" onClick={()=>{onMonthChange(today.slice(0,7));onSelectDate(null);}}>Hoje</button>}</div>}
  </section>;
}
