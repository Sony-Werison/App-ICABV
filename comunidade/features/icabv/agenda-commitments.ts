"use client";
import {useQuery} from "@tanstack/react-query";
import {moduleRows,moduleRpc,useModuleRows} from "./module-ui";
import {supabase} from "./supabase";
import {buildAgendaCommitments,buildUpcomingAgendaCommitments,calendarDate,loadAgendaBirthdays,loadAgendaPages,type AgendaWorship,type AgendaShift,type AgendaRecord,type AgendaBirthday} from "./agenda-calendar-model";
import {rosterCommitments,type DutyRoster} from "./duty-roster-model";
export function useAgendaCommitments(personId:string|undefined,month:string,includeBirthdays=true) {
  const enabled=!!personId;
  const rosters=useModuleRows<DutyRoster>("duty_rosters","id",undefined,enabled);
  const imported=personId?rosterCommitments(rosters.data??[],personId):[];
  const sort=(items:ReturnType<typeof rosterCommitments>)=>items.sort((a,b)=>a.date.localeCompare(b.date)||(a.time??"").localeCompare(b.time??"")||a.title.localeCompare(b.title,"pt-BR"));
  const birthdays=useQuery({queryKey:["modules","anniversaries","agenda-year",personId],enabled:enabled&&includeBirthdays,queryFn:async()=>(await Promise.all(Array.from({length:12},(_,index)=>loadAgendaBirthdays(page=>moduleRpc<AgendaBirthday[]>("anniversary_calendar",{month_number:index+1,page_number:page}))))).flat()});
  const worship=useQuery({queryKey:["modules","agenda-worship",personId],enabled,queryFn:()=>moduleRows<AgendaWorship>("worship_services","starts_at")});
  const shifts=useQuery({queryKey:["community","my_service_assignments","agenda",personId],enabled,queryFn:()=>loadAgendaPages<AgendaShift>(page=>moduleRpc("my_service_assignments",{page}))});
  const records=useQuery({queryKey:["core","agenda-record-schedules",personId],enabled,queryFn:async()=>{
    const rows:AgendaRecord[]=[];
    for(let offset=0;offset<10000;offset+=100){
      const result=await supabase!.from("management_records").select("id,data").eq("kind","schedule").eq("data->>memberId",personId!).order("id").range(offset,offset+99);
      if(result.error)throw result.error;
      rows.push(...result.data as AgendaRecord[]);if(result.data.length<100)return rows;
    }
    throw Error("Escalas muito extensas.");
  }});
  const sources=[...(includeBirthdays?[{label:"aniversários compartilhados",query:birthdays}]:[]),{label:"suas escalas de culto",query:worship},{label:"suas escalas de equipes",query:shifts},{label:"suas escalas gerais",query:records},{label:"escalas de lanche e limpeza",query:rosters}];
  return {
    items:personId?sort([...imported.filter(i=>i.date.startsWith(month)),...buildAgendaCommitments({month,personId,birthdays:birthdays.data,worship:worship.data,shifts:shifts.data,records:records.data})]):[],
    upcoming:personId?sort([...imported.filter(i=>i.date>=calendarDate(new Date().toISOString())),...buildUpcomingAgendaCommitments({today:calendarDate(new Date().toISOString()),personId,birthdays:birthdays.data,worship:worship.data,shifts:shifts.data,records:records.data})]):[],
    pending:enabled&&sources.some(source=>source.query.isPending&&source.query.fetchStatus!=="paused"),
    paused:enabled&&sources.some(source=>source.query.fetchStatus==="paused"&&!source.query.data),
    errors:enabled?sources.filter(source=>source.query.error).map(source=>source.label):[],
    retry:()=>{for(const source of sources)if(source.query.error||source.query.fetchStatus==="paused")void source.query.refetch();},
  };
}
