import {useState} from "react";
import {Cake,ClipboardList} from "lucide-react";
import type {AgendaCommitment} from "./agenda-calendar-model";
import {CompactCard} from "./compact-card";
export function AgendaCommitmentCard({item,onNavigate}:{item:AgendaCommitment;onNavigate?:(tab:string,section?:string,key?:string)=>void}) {
  const Icon=item.kind==="birthday"?Cake:ClipboardList;
  const [open,setOpen]=useState(false);
  const title=item.kind==="schedule"&&item.source==="worship"?item.description:item.title;
  return <div className="agenda-commitment-card"><CompactCard title={title} date={item.date} icon={Icon} iconClassName={item.kind==="birthday"?"agenda-birthday-icon":"agenda-schedule-icon"} label={`${open?"Recolher":"Ver"} detalhes de ${item.title}`} expanded={open} onClick={()=>setOpen(value=>!value)} description={<>{item.source==="worship"&&<span>{item.title} · </span>}{item.time&&<span>{item.time}</span>}{item.source!=="worship"&&<span>{item.description}</span>}</>}>
    {onNavigate&&item.source==="worship"&&<button className="secondary" onClick={()=>onNavigate("louvor","Escalas",`service:${item.targetId}`)}>Ver escala e repertório</button>}
    {onNavigate&&item.source==="service"&&<button className="secondary" onClick={()=>onNavigate("schedules")}>Minhas escalas</button>}
  </CompactCard></div>;
}
