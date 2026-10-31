export type CalendarEvent = { id:string; title:string; starts_at:string; ends_at:string; status:string };
const churchCalendarFormatter=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"});
export function calendarDate(iso:string) {
  return churchCalendarFormatter.format(new Date(iso));
}
export function monthDates(month:string) {
  const first=new Date(`${month}-01T12:00:00Z`);
  const offset=(first.getUTCDay()+6)%7;
  const length=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return Array.from({length:Math.ceil((offset+length)/7)*7},(_,index)=>index<offset||index>=offset+length?null:`${month}-${String(index-offset+1).padStart(2,"0")}`);
}
export function eventOnDate(event:CalendarEvent,date:string) {
  const end=new Date(Math.max(Date.parse(event.starts_at),Date.parse(event.ends_at)-1)).toISOString();
  return event.status==="published"&&calendarDate(event.starts_at)<=date&&calendarDate(end)>=date;
}
export function eventsInMonth<T extends CalendarEvent>(events:T[],month:string) {
  const dates=monthDates(month).filter((date):date is string=>!!date);
  return events.filter(event=>event.status==="published"&&calendarDate(event.starts_at)<=dates.at(-1)!&&calendarDate(new Date(Math.max(Date.parse(event.starts_at),Date.parse(event.ends_at)-1)).toISOString())>=dates[0]);
}
export async function loadAgendaPages<T>(loadPage:(page:number)=>Promise<T[]>) {
  const rows:T[]=[];
  for(let page=0;page<500;page++) {
    const next=await loadPage(page);rows.push(...next.slice(0,20));
    if(next.length<=20)return rows;
  }
  throw Error("A agenda é muito extensa. Use a busca ou uma categoria para filtrar.");
}


export type AgendaCommitment = {id:string;date:string;kind:"birthday"|"schedule";title:string;description:string;time?:string;status?:string;source:"birthday"|"worship"|"service"|"record"|"roster";targetId:string};
export type AgendaBirthday = {person_id:string;full_name:string;birth_day:number;birth_month:number;anniversary_type?:"birthday"|"wedding"};
export type AgendaWorship = {id:string;title:string;starts_at:string;status:string;assignments:Record<string,string[]>};
export type AgendaShift = {id:string;title:string;unit_title:string;starts_at:string;ends_at:string;status:string;canceled:boolean};
export type AgendaRecord = {id:string;data:Record<string,unknown>};
const churchTimeFormatter=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"});
export function buildAgendaCommitments({month,personId,birthdays=[],worship=[],shifts=[],records=[]}:{month:string;personId:string;birthdays?:AgendaBirthday[];worship?:AgendaWorship[];shifts?:AgendaShift[];records?:AgendaRecord[]}):AgendaCommitment[] {
  const result:AgendaCommitment[]=[];
  const lastDay=new Date(`${month}-01T12:00:00Z`);lastDay.setUTCMonth(lastDay.getUTCMonth()+1);lastDay.setUTCDate(0);
  for(const person of birthdays) {
    if(person.birth_month!==Number(month.slice(5))||person.birth_day<1||person.birth_day>lastDay.getUTCDate())continue;
    result.push({id:`birthday:${person.person_id}`,date:`${month}-${String(person.birth_day).padStart(2,"0")}`,kind:"birthday",title:person.full_name,description:person.anniversary_type==="wedding"?"Aniversário de casamento":"Aniversário",source:"birthday",targetId:person.person_id});
  }
  for(const service of worship) {
    const roles=Object.entries(service.assignments).filter(([,ids])=>ids.includes(personId)).map(([role])=>role);
    const date=calendarDate(service.starts_at);
    if(!roles.length||service.status==="canceled"||!date.startsWith(month))continue;
    result.push({id:`worship:${service.id}`,date,kind:"schedule",title:service.title,description:roles.join(" · "),time:churchTimeFormatter.format(new Date(service.starts_at)),status:service.status==="completed"?"Concluída":"Escalado",source:"worship",targetId:service.id});
  }
  for(const shift of shifts) {
    const date=calendarDate(shift.starts_at);
    if(shift.canceled||shift.status==="declined"||!date.startsWith(month))continue;
    result.push({id:`service:${shift.id}`,date,kind:"schedule",title:shift.title,description:shift.unit_title,time:churchTimeFormatter.format(new Date(shift.starts_at)),status:shift.status==="pending"?"Confirmação pendente":"Confirmada",source:"service",targetId:shift.id});
  }
  for(const record of records) {
    const data=record.data,date=String(data.date??"");
    if(data.memberId!==personId||data.status==="Indisponível"||data.status==="Cancelado"||!date.startsWith(month))continue;
    result.push({id:`record:${record.id}`,date,kind:"schedule",title:String(data.duty||"Escala"),description:String(data.ministry||"Equipe"),time:String(data.time||""),status:String(data.status||"Pendente"),source:"record",targetId:record.id});
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date)||(a.time??"").localeCompare(b.time??"")||a.title.localeCompare(b.title,"pt-BR"));
}
export async function loadAgendaBirthdays(loadPage:(page:number)=>Promise<AgendaBirthday[]>) {
  const rows:AgendaBirthday[]=[];
  for(let page=0;page<100;page++){const next=await loadPage(page);rows.push(...next);if(next.length<100)return rows;}
  throw Error("Informe de aniversários muito extenso.");
}

export function buildUpcomingAgendaCommitments({today,birthdays=[],worship=[],shifts=[],records=[],personId}:{today:string;personId:string;birthdays?:AgendaBirthday[];worship?:AgendaWorship[];shifts?:AgendaShift[];records?:AgendaRecord[]}):AgendaCommitment[] {
  const months=new Set([today.slice(0,7),...worship.map(item=>calendarDate(item.starts_at).slice(0,7)),...shifts.map(item=>calendarDate(item.starts_at).slice(0,7)),...records.map(item=>String(item.data.date??"").slice(0,7))]);
  const items=[...months].filter(month=>month>=today.slice(0,7)).flatMap(month=>buildAgendaCommitments({month,personId,worship,shifts,records})).filter(item=>item.date>=today);
  // Each shared birthday appears once, at its next valid occurrence (including leap days).
  for(const birthday of birthdays){
    for(let year=Number(today.slice(0,4));year<=Number(today.slice(0,4))+4;year++){
      const month=`${year}-${String(birthday.birth_month).padStart(2,"0")}`;
      const next=buildAgendaCommitments({month,personId,birthdays:[birthday]})[0];
      if(next&&next.date>=today){items.push(next);break;}
    }
  }
  return items.sort((a,b)=>a.date.localeCompare(b.date)||(a.time??"").localeCompare(b.time??"")||a.title.localeCompare(b.title,"pt-BR"));
}
