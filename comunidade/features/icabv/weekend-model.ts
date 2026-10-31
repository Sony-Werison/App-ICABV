import {scheduleDate} from "./schedule-model";
import type {Service} from "./worship-model";

export function weekendRange(today:string) {
  const start=new Date(`${today}T12:00:00Z`),day=start.getUTCDay();
  start.setUTCDate(start.getUTCDate()+(day===0?-1:6-day));
  const end=new Date(start);end.setUTCDate(end.getUTCDate()+1);
  return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10),current:day===0||day===6};
}
export function weekendServices(services:Service[],today:string) {
  const range=weekendRange(today);
  return services.filter(s=>s.status!=="canceled"&&scheduleDate(s.starts_at)>=range.start&&scheduleDate(s.starts_at)<=range.end).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
}
