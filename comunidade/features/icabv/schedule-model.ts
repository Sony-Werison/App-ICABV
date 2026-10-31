export type SchedulePerson = { id: string; name: string; status?: string };
export type ScheduleEntry = { id: string; date: string; role: string; group: string; people: SchedulePerson[]; participants?:{id:string;name:string;role:string}[]; detail?: string; groupColor?: string; groupInk?: string; canceled?: boolean };
export function scheduleDate(iso: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}
export function scheduleColumn(role: string, period = "") {
  const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const normalized=normalize(role), known=normalized.match(/^(abertura|pregacao)(?:[ _-]+(manha|tarde|noite))?$/);
  if(normalized==="multimidia"||normalized==="multimedia")return "Multimídia";
  if(!known)return role;
  const periods:Record<string,string>={manha:"Manhã",tarde:"Tarde",noite:"Noite"};
  const label=periods[known[2]||normalize(period)]||period;
  return `${known[1]==="abertura"?"Abertura":"Pregação"}${label?` ${label}`:""}`;
}

export function worshipScheduleEntries(services: {id:string;starts_at:string;title:string;period:string;status:string;assignments:Record<string,string[]>}[], members: {person_id:string;full_name:string}[]): ScheduleEntry[] {
  const names = new Map(members.map(person => [person.person_id, person.full_name]));
  return services.flatMap(service => Object.entries(Object.keys(service.assignments).length ? service.assignments : {Equipe: []}).map(([role, ids]) => ({
    id: service.id, date: scheduleDate(service.starts_at), role: scheduleColumn(role, service.period), group: "Cultos", detail: service.title,
    canceled: service.status === "canceled", people: ids.map(id=>({id, name:names.get(id) ?? "Pessoa indisponível"})),
  })));
}
export function groupSchedule(entries: ScheduleEntry[], month: string, group = "") {
  const visible = entries.filter(entry=>entry.date.startsWith(month) && (!group || entry.group === group));
  const priority = ["Abertura Manhã", "Pregação Manhã", "Abertura Tarde", "Pregação Tarde", "Abertura Noite", "Pregação Noite", "Multimídia"];
  const columns = [...new Set(visible.map(entry=>entry.role))].sort((a,b)=>{
    const ai=priority.indexOf(a), bi=priority.indexOf(b);
    return (ai<0?100:ai)-(bi<0?100:bi) || a.localeCompare(b,"pt-BR");
  });
  const dates = [...new Set(visible.map(entry=>entry.date))].sort();
  return {columns, rows:dates.map(date=>({date, cells:columns.map(role=>({role, entries:visible.filter(entry=>entry.date===date&&entry.role===role)}))}))};
}

/** Community endpoints return twenty rows plus a look-ahead row. */
export async function loadSchedulePages<T>(loadPage:(page:number)=>Promise<T[]>):Promise<T[]> {
  const result:T[]=[];
  for(let page=0;page<500;page++) {
    const rows=await loadPage(page);
    result.push(...rows.slice(0,20));
    if(rows.length<=20)return result;
  }
  throw Error("A escala é muito extensa. Consulte a gestão para filtrar o histórico.");
}
