import type {AgendaCommitment} from "./agenda-calendar-model";
export type DutyRoster={id:string;title:string;source_name:string;groups:{id:string;label:string;members:{id:string;name:string;role:string;person_id:string|null}[]}[];dates:{date:string;group_id:string|null;original_date?:string;note?:string}[]};
export function rosterCommitments(rosters:DutyRoster[],personId:string):AgendaCommitment[]{
  return rosters.flatMap(roster=>roster.dates.flatMap(day=>{
    const group=roster.groups.find(g=>g.id===day.group_id),members=group?.members.filter(m=>m.person_id===personId)??[];
    return members.length?[{id:`roster:${roster.id}:${day.date}`,date:day.date,kind:"schedule" as const,title:roster.title,description:`${group!.label} · ${[...new Set(members.map(m=>m.role))].join(" e ")}`,source:"roster" as const,targetId:roster.id}]:[];
  }));
}
