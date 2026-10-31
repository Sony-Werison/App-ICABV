"use client";
import {useId,useState,type ReactNode} from "react";
import {ModuleDialog} from "./module-dialog";
import {ChevronRight,Megaphone,type LucideIcon} from "lucide-react";

/** Shared compact presentation; actions and expanded content stay with their original flows. */
export function CompactCard({title,description,date,icon:Icon,iconClassName="",onClick,label,expanded,children}:{title:string;description:ReactNode;date?:string;icon?:LucideIcon;iconClassName?:string;onClick?:()=>void;label?:string;expanded?:boolean;children?:ReactNode}) {
  const id=useId();
  const content=<>
    {date&&<time className="program-date" dateTime={date} title={new Intl.DateTimeFormat("pt-BR",{dateStyle:"full",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`))}><strong>{Number(date.slice(8))}</strong><span>{new Intl.DateTimeFormat("pt-BR",{month:"short",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`))}</span></time>}
    {!date&&Icon&&<span className={`compact-symbol ${iconClassName}`}><Icon size={20} aria-hidden="true"/></span>}
    <span className="compact-summary-text"><strong title={title}>{title}</strong><span>{date&&Icon&&<Icon className={iconClassName} size={13} aria-hidden="true"/>}{description}</span></span>
    {onClick&&<ChevronRight className="compact-chevron" size={18} aria-hidden="true"/>}
  </>;
  return <article className={`compact-card${expanded?" is-expanded":""}`}>
    {onClick?<button type="button" className="compact-row" onClick={onClick} aria-label={label} aria-expanded={expanded} aria-controls={expanded&&children?id:undefined}>{content}</button>:<div className="compact-row">{content}</div>}
    {expanded&&children&&<div className="compact-details" id={id}>{children}</div>}
  </article>;
}

export function CompactAnnouncement({title,body}:{title:string;body:string}) {
  const [open,setOpen]=useState(false);
  return <><CompactCard title={title} description={body} icon={Megaphone} label={`Ler comunicado: ${title}`} onClick={()=>setOpen(true)}/>{open&&<ModuleDialog title={title} onClose={()=>setOpen(false)}><section className="announcement-full-text">{body}</section></ModuleDialog>}</>;
}
