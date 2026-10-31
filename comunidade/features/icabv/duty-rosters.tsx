"use client";
import {useQuery} from "@tanstack/react-query";
import {supabase} from "./supabase";
import {useModuleRows} from "./module-ui";
import {ScheduleBoard} from "./schedule-board";
import type {DutyRoster} from "./duty-roster-model";
export function DutyRosters({title,month,onMonthChange}:{title:string;month:string;onMonthChange:(month:string)=>void}){
 const query=useModuleRows<DutyRoster>("duty_rosters");
 const directory=useQuery({queryKey:["modules","duty-roster-people"],queryFn:async()=>{
  const result=await supabase!.rpc('duty_roster_people');if(result.error)throw result.error;
  return result.data as {person_id:string;full_name:string}[];
 }});
 const names=new Map(directory.data?.map(person=>[person.person_id,person.full_name]));
 const memberName=(member:DutyRoster['groups'][number]['members'][number])=>member.person_id?names.get(member.person_id)||member.name:member.name;
 const colors=title==="Limpeza"?["#e8df9e","#a9ceb0","#d9adc5","#a7c3d7"]:["#ffe9b7","#e3e0eb","#dfecda","#fce9da"];
 const roster=query.data?.find(r=>r.title===title);
 if(query.isPending)return <p role="status">Carregando escala…</p>;
 if(query.error)return <div role="alert">Não foi possível carregar a escala. <button className="text-btn" onClick={()=>void query.refetch()}>Tentar novamente</button></div>;
 if(!roster)return <p className="church-empty">Nenhuma escala cadastrada.</p>;
 return <section className="icabv-card duty-roster">
  <ScheduleBoard label={roster.title} month={month} onMonthChange={onMonthChange} entries={roster.dates.map(day=>{
   const group=roster.groups.find(g=>g.id===day.group_id);
   return {id:day.date,date:day.date,role:roster.title,group:"",groupInk:"#151515",groupColor:group?colors[roster.groups.indexOf(group)]:undefined,people:[{id:day.group_id??day.date,name:group?.label??day.note??"Responsáveis não informados"}],participants:group?.members.map(member=>({id:member.id,name:memberName(member),role:member.role}))};
  })}/>
  {directory.error&&<p role="alert">Não foi possível carregar os nomes completos. <button className="text-btn" onClick={()=>void directory.refetch()}>Tentar novamente</button></p>}
  {!roster.dates.some(d=>d.date.startsWith(month))&&<p>Nenhuma data prevista neste mês.</p>}
 </section>;
}
