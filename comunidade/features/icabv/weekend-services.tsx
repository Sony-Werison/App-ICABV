"use client";
import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Music2,Sun,Moon,Church} from "lucide-react";
import {moduleRpc,useModuleRows} from "./module-ui";
import {type Service,type Song,type WorshipMember} from "./worship-model";
import {weekendRange,weekendServices} from "./weekend-model";
import {scheduleDate} from "./schedule-model";
import {RepertoireReader,readableRepertoire} from "./repertoire-reader";

export function WeekendServices() {
  const [selected,setSelected]=useState<Service|null>(null),today=scheduleDate(new Date().toISOString()),range=weekendRange(today);
  const services=useModuleRows<Service>("worship_services","starts_at");
  const directory=useQuery({queryKey:["modules","worship-directory"],queryFn:()=>moduleRpc<WorshipMember[]>("worship_directory")});
  const songs=useModuleRows<Song>("worship_songs","title",undefined,!!selected);
  const meetings=weekendServices(services.data??[],today);
  const names=(service:Service,pattern:RegExp)=>{
    const ids=[...new Set(Object.entries(service.assignments).filter(([role])=>pattern.test(role.normalize("NFD").replace(/[\u0300-\u036f]/g,""))).flatMap(([,ids])=>ids))];
    return ids.length?ids.map(id=>directory.data?.find(p=>p.person_id===id)?.full_name??"Nome não disponível").join(", "):"A definir";
  };
  // Keep the query error out of the reading overlay; retry keeps the chosen service.
  const selectedSongs=songs.data??[];
  return <section className="member-weekend">
    <div className="member-heading"><h2><Church size={18} aria-hidden="true"/>{range.current?"Neste fim de semana":"Próximo fim de semana"}</h2></div>
    {services.isPending||directory.isPending?<p className="church-empty">Carregando as reuniões…</p>:services.error||directory.error?<div className="church-empty" role="alert"><p>Não foi possível carregar as reuniões.</p><button className="text-btn" onClick={()=>{void services.refetch();void directory.refetch();}}>Tentar novamente</button></div>:!meetings.length?<p className="church-empty">As reuniões e os responsáveis deste fim de semana ainda não foram cadastrados.</p>:<div className="weekend-meetings">{meetings.map(service=><article className="weekend-meeting" key={service.id}>
      <h3>{["manha","manhã"].includes(service.period)?<><Sun size={17} aria-hidden="true"/>Escola Dominical</>:service.period==="noite"?<><Moon size={17} aria-hidden="true"/>Reunião da Noite</>:service.title}</h3><p>{scheduleDate(service.starts_at).split("-").reverse().join("/")}</p>
      <dl><div><dt>Abertura</dt><dd>{names(service,/abertura|dirig/i)}</dd></div><div><dt>Pregação</dt><dd>{names(service,/prega/i)}</dd></div></dl>
      <p className="weekend-multimedia"><span>Multimídia</span>{names(service,/multim/i)}</p>
      {service.playlist.length>0?<button className="secondary" onClick={()=>setSelected(service)}><Music2 size={16} aria-hidden="true"/>Ver letras do repertório</button>:<small className="weekend-no-repertoire">Repertório ainda não cadastrado.</small>}
    </article>)}</div>}
    {selected&&(songs.isPending?<p role="status">Carregando as letras do repertório…</p>:songs.error?<div role="alert"><p>Não foi possível carregar as letras.</p><button className="text-btn" onClick={()=>void songs.refetch()}>Tentar carregar as letras</button></div>:readableRepertoire(selected.playlist,selectedSongs).length?<RepertoireReader title={selected.title} playlist={selected.playlist} songs={selectedSongs} onClose={()=>setSelected(null)}/>:<p role="status">As letras do repertório de {selected.title} ainda não estão disponíveis.</p>)}
  </section>;
}
