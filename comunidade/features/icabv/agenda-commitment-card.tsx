import {useState} from "react";
import {Cake,ClipboardList} from "lucide-react";
import type {AgendaCommitment} from "./agenda-calendar-model";
import {CompactCard} from "./compact-card";
export function AgendaCommitmentCard({item,onNavigate}:{item:AgendaCommitment;onNavigate?:(tab:string,section?:string,key?:string)=>void}) {
  const Icon=item.kind==="birthday"?Cake:ClipboardList;
  const [open,setOpen]=useState(false);
  return <div className="agenda-commitment-card"><CompactCard title={item.title} date={item.date} icon={Icon} iconClassName={item.kind==="birthday"?"agenda-birthday-icon":"agenda-schedule-icon"} label={`${open?"Recolher":"Ver"} detalhes de ${item.title}`} expanded={open} onClick={()=>setOpen(value=>!value)} description={<>{item.time&&<span>{item.time} · Brasília · </span>}<span>{item.description}</span>{item.status&&<><span aria-hidden="true"> · </span><span>{item.status}</span></>}</>}>
    {onNavigate&&item.source==="worship"&&<button className="secondary" onClick={()=>onNavigate("louvor","Escalas",`service:${item.targetId}`)}>Ver escala e repertório</button>}
    {onNavigate&&item.source==="service"&&<button className="secondary" onClick={()=>onNavigate("schedules")}>Minhas escalas</button>}
  </CompactCard></div>;
}
