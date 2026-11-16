"use client";
import {useEffect,useRef,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {BookOpen,Play,ClipboardCheck,Check,Clock,ChevronLeft,ChevronRight,X} from "lucide-react";
import {Disclosure,PagedList,SearchField,searchText} from "./presentation";
import {ebdDate,ebdToday,kindLabel,studyWeek} from "./ebd-ui-model";
import type {Activity,EbdMember,EbdModule,LegacyHistory,Submission} from "./ebd-model";
import {moduleRows} from "./module-ui";
import {ModuleDialog} from "./module-dialog";
import {supabase} from "./supabase";

const studyDayFormatter=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"});
const mondayOf=(date:string)=>{const day=new Date(`${date}T12:00:00Z`);day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);return day.toISOString().slice(0,10);};
const addDays=(date:string,count:number)=>{const day=new Date(`${date}T12:00:00Z`);day.setUTCDate(day.getUTCDate()+count);return day.toISOString().slice(0,10);};
const shortWeekdayDate=(date:string)=>new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"short",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`)).replace(" de "," ").replace(".","");

type WeeklySubmission={activity_id:string|null;person_id:string;created_at:string;kind?:string;status?:string;score?:number|null};
async function fetchWeeklySubmissions(queryClient:ReturnType<typeof useQueryClient>,classId:string,personIds:string[],weekStart:string):Promise<WeeklySubmission[]>{
  if(!personIds.length)return [];
  const end=addDays(weekStart,7),startAt=`${weekStart}T00:00:00-03:00`,endAt=`${end}T00:00:00-03:00`;
  const allCurrent=queryClient.getQueryData<Submission[]>(["modules","ebd_submissions",undefined]);
  const allLegacy=queryClient.getQueryData<LegacyHistory[]>(["modules","ebd_legacy_history",["class_id",classId]]);
  if(allCurrent&&allLegacy){
    const people=new Set(personIds),from=Date.parse(startAt),to=Date.parse(endAt);
    return [
      ...allCurrent.filter(row=>people.has(row.person_id)&&Date.parse(row.created_at)>=from&&Date.parse(row.created_at)<to).map(({activity_id,person_id,created_at,status,score})=>({activity_id,person_id,created_at,status,score})),
      ...allLegacy.filter(row=>people.has(row.person_id)&&Date.parse(row.created_at)>=from&&Date.parse(row.created_at)<to).map(({activity_id,person_id,created_at,kind,status,score})=>({activity_id:activity_id??null,person_id,created_at,kind,status,score})),
    ];
  }
  const readCurrent=async()=>{const rows:WeeklySubmission[]=[];for(let offset=0;;offset+=500){const result=await supabase!.from("ebd_submissions").select("activity_id,person_id,created_at,status,score").in("person_id",personIds).gte("created_at",startAt).lt("created_at",endAt).order("created_at").range(offset,offset+499);if(result.error)throw result.error;rows.push(...(result.data as WeeklySubmission[]));if(result.data.length<500)break;}return rows;};
  const readLegacy=async()=>{const rows:WeeklySubmission[]=[];for(let offset=0;;offset+=500){const result=await supabase!.from("ebd_legacy_history").select("activity_id,person_id,created_at,kind,status,score").eq("class_id",classId).in("person_id",personIds).gte("created_at",startAt).lt("created_at",endAt).order("created_at").range(offset,offset+499);if(result.error)throw result.error;rows.push(...(result.data as WeeklySubmission[]));if(result.data.length<500)break;}return rows;};
  const [submitted,legacy]=await Promise.all([readCurrent(),readLegacy()]);
  return [...submitted,...legacy];
}
async function warmEbdHistory(queryClient:ReturnType<typeof useQueryClient>,classId:string){
  await Promise.all([
    queryClient.prefetchQuery({queryKey:["modules","ebd_submissions",undefined],queryFn:()=>moduleRows<Submission>("ebd_submissions","created_at")}),
    queryClient.prefetchQuery({queryKey:["modules","ebd_legacy_history",["class_id",classId]],queryFn:()=>moduleRows<LegacyHistory>("ebd_legacy_history","created_at",["class_id",classId])}),
  ]);
}
export function EbdWeeklyActivityTable({classId,students,activities}:{classId:string;students:EbdMember[];activities:Activity[]}){
  const [weekStart,setWeekStart]=useState(()=>mondayOf(ebdToday())),[selectedStudent,setSelectedStudent]=useState<EbdMember|null>(null);
  const queryClient=useQueryClient(),backgroundStarted=useRef(false),studentIds=students.map(student=>student.person_id).sort();
  const weeklyQuery=useQuery({queryKey:["modules","ebd-weekly-submissions",classId,weekStart,studentIds],queryFn:()=>fetchWeeklySubmissions(queryClient,classId,studentIds,weekStart),enabled:students.length>0});
  useEffect(()=>{
    if(!weeklyQuery.isSuccess||backgroundStarted.current)return;
    backgroundStarted.current=true;
    const timer=setTimeout(()=>void warmEbdHistory(queryClient,classId),1800);
    return()=>clearTimeout(timer);
  },[weeklyQuery.isSuccess,queryClient,classId]);
  const submissions=weeklyQuery.data??[];
  const dates=Array.from({length:6},(_,index)=>addDays(weekStart,index));
  const kindById=new Map(activities.map(activity=>[activity.id,activity.kind])),activityById=new Map(activities.map(activity=>[activity.id,activity]));
  const rows=[...students].sort((a,b)=>a.full_name.localeCompare(b.full_name,"pt-BR")).map(student=>{
    const entries=submissions.filter(submission=>{
      const kind=submission.kind??kindById.get(submission.activity_id??"")??"manual";
      return submission.person_id===student.person_id&&(submission.kind!==undefined||!submission.activity_id||kindById.has(submission.activity_id))&&!(["class_evaluation","sunday_presence","daily_grade","weekly_grade"].includes(kind));
    });
    const byDay=dates.map(date=>entries.filter(submission=>studyDayFormatter.format(new Date(submission.created_at))===date));
    return {student,entries,byDay,total:byDay.filter(day=>day.length>0).length};
  });
  const rangeLabel=`${shortWeekdayDate(weekStart)} – ${shortWeekdayDate(dates[5])} ${dates[5].slice(0,4)}`;
  const labels=["SEG","TER","QUA","QUI","SEX","SÁB"];
  return <section className="ebd-weekly-activity" aria-label="Atividades semanais dos alunos">
    <header><div><span className="church-label">ACOMPANHAMENTO DA TURMA</span></div><div className="ebd-weekly-nav"><button type="button" className="icon-btn" aria-label="Semana anterior" onClick={()=>setWeekStart(addDays(weekStart,-7))}><ChevronLeft size={18}/></button><strong>{rangeLabel}</strong><button type="button" className="icon-btn" aria-label="Próxima semana" onClick={()=>setWeekStart(addDays(weekStart,7))}><ChevronRight size={18}/></button></div></header>
    {students.length>0&&weeklyQuery.isPending?<p className="ebd-weekly-status" role="status">Carregando as atividades desta semana…</p>:weeklyQuery.isError?<div className="ebd-weekly-error" role="alert"><span>Não foi possível carregar esta semana.</span><button type="button" className="text-btn" onClick={()=>void weeklyQuery.refetch()}>Tentar novamente</button></div>:<div className="ebd-weekly-table-scroll" role="region" aria-label={`Atividades de ${rangeLabel}`} tabIndex={0}><table className="ebd-weekly-table"><caption className="sr-only">Entregas de atividades por aluno, dia da semana e total entre {rangeLabel}</caption><thead><tr><th scope="col">Aluno</th>{dates.map((date,index)=><th scope="col" key={date}><span>{labels[index]}</span><small>{date.slice(8)}</small></th>)}<th scope="col">TOT</th></tr></thead><tbody>{rows.map(({student,entries,byDay,total})=><tr key={student.person_id}><th scope="row"><button className="ebd-weekly-student-button" type="button" onClick={()=>setSelectedStudent(student)} aria-label={`Ver atividades de ${student.full_name} na semana de ${rangeLabel}`}>{student.full_name}</button></th>{byDay.map((day,index)=>{
      const kindOf=(submission:WeeklySubmission)=>(submission.kind??kindById.get(submission.activity_id??"")??"manual").includes("video")?"video":"bible";
      const kinds=[...new Set(day.map(kindOf))];
      return <td key={dates[index]} aria-label={`${student.full_name}, ${labels[index]} ${dates[index].slice(8)}: ${day.length} entregas`} title={`${day.length} ${day.length===1?"atividade entregue":"atividades entregues"}`}><span className="ebd-weekly-day-icons">{day.length?kinds.map(kind=>{const Icon=kind==="bible"?BookOpen:Play;const bibleDone=kind==="bible"&&day.filter(submission=>kindOf(submission)==="bible").every(submission=>submission.score!==null&&submission.score!==undefined&&Number(submission.score)>=10);const colorClass=kind==="video"?"is-video":bibleDone?"is-bible-complete":"is-bible-partial";return <Icon key={kind} className={colorClass} size={15} aria-hidden="true"/>;}):dates[index]<ebdToday()?<X className="ebd-weekly-empty" size={14} aria-hidden="true"/>:null}</span></td>;
    })}<td className={`ebd-weekly-total ${total/6<=.2?"is-low":total/6<=.8?"is-medium":"is-high"}`} aria-label={`${total} dias com atividades na semana`}>{total}</td></tr>)}</tbody></table></div>}
    {!rows.length&&<p className="church-empty">Nenhum aluno está vinculado a esta turma.</p>}
    <p className="ebd-weekly-legend"><BookOpen size={13} aria-hidden="true"/> Leitura bíblica <Play size={13} aria-hidden="true"/> Vídeo</p>
    {selectedStudent&&<ModuleDialog title={`Resumo semanal · ${selectedStudent.full_name}`} onClose={()=>setSelectedStudent(null)}><section className="ebd-weekly-student-summary"><p className="ebd-weekly-summary-period">{rangeLabel}</p>{(()=>{const row=rows.find(item=>item.student.person_id===selectedStudent.person_id);const entries=row?.entries??[];const uniqueDays=row?.total??0;return <><div className="ebd-weekly-summary-stats"><article><strong>{entries.length}</strong><span>atividades entregues</span></article><article><strong>{uniqueDays}/6</strong><span>dias com atividade</span></article></div>{entries.length?<ol className="ebd-weekly-summary-list">{entries.slice().sort((a,b)=>a.created_at.localeCompare(b.created_at)).map((entry,index)=>{const activity=activityById.get(entry.activity_id??"");const title=activity?.title??"Atividade entregue";const date=studyDayFormatter.format(new Date(entry.created_at));return <li key={`${entry.activity_id??"legacy"}-${entry.created_at}-${index}`}><span className="ebd-weekly-summary-icon">{(entry.kind??activity?.kind??"").includes("video")?<Play size={16}/>:<BookOpen size={16}/>}</span><div><strong>{title}</strong><small>{ebdDate(date)} · {kindLabel[activity?.kind??entry.kind??""]??"Atividade"}</small></div><span className={`ebd-weekly-summary-status${entry.status==="graded"?" is-graded":""}`}>{entry.status==="graded"?`Nota ${entry.score??"—"}`:"Entregue"}</span></li>;})}</ol>:<p className="church-empty">Nenhuma atividade entregue nesta semana.</p>}</>;})()}</section></ModuleDialog>}
  </section>;
}

export function EbdStudyWeek({personId,submissions}:{personId:string;submissions:Submission[]}){
  const days=studyWeek(personId,submissions,ebdToday());
  return <section className="ebd-week" aria-label="Estudos nesta semana"><div className="module-row"><h3>Estudos nesta semana</h3><span>{days.filter(day=>day.count>0).length} dias com entregas</span></div><ol>{days.map((day,index)=><li key={day.date} className={`${day.count?"is-done":""}${day.today?" is-today":""}`} aria-label={`${ebdDate(day.date)}: ${day.count} atividades entregues${day.today?", hoje":""}`}><small>{["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"][index]}</small><span>{day.count?<Check size={18} aria-hidden="true"/>:Number(day.date.slice(8))}</span></li>)}</ol></section>;
}

export function EbdActivityModules({modules,activities,submissions,mine,personId,onStart}:{modules:EbdModule[];activities:Activity[];submissions:Submission[];mine?:EbdMember;personId:string;onStart:(activity:Activity)=>void}){
  const [search,setSearch]=useState(""),[filter,setFilter]=useState("all");
  const today=ebdToday();
  const doneFor=(activity:Activity)=>submissions.find(s=>s.activity_id===activity.id&&s.person_id===personId);
  const visible=(activity:Activity)=>activity.published&&searchText(activity.title+" "+activity.passages).includes(searchText(search))&&(filter==="all"||(filter==="done"?!!doneFor(activity):!doneFor(activity)));
  const activeModules=modules.filter(m=>!m.archived);
  const initialModule=mine?.module_id??activeModules.find(m=>activities.some(a=>a.module_id===m.id&&a.published))?.id??activeModules[0]?.id;
  const shown=activeModules.filter(m=>!search&&filter==="all"||activities.some(a=>a.module_id===m.id&&visible(a)));
  return <div className="ebd-activity-modules"><h2>Atividades da turma</h2><div className="ebd-filters"><SearchField label="Buscar atividades" value={search} onChange={setSearch}/><label className="icabv-field">Situação das atividades<select aria-label="Situação das atividades" value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">Todas</option><option value="todo">A fazer</option><option value="done">Entregues</option></select></label></div>
  {shown.map((module)=>{const lessons=activities.filter(a=>a.module_id===module.id&&a.published),completed=lessons.filter(a=>doneFor(a)).length;return <Disclosure key={module.id} title={module.title} description={`${lessons.length} atividades${mine?` · ${completed} entregues`:""}${mine?.module_id===module.id?" · Seu módulo atual":""}`} open={!!search||filter!=="all"||module.id===initialModule}>
    {module.description&&<p className="ebd-muted">{module.description}</p>}<p className="ebd-muted">{[module.daily_limit?`${module.daily_limit} atividades por dia`:"",module.weekly_bible_limit?`${module.weekly_bible_limit} leituras por semana`:"",module.weekly_video_limit?`${module.weekly_video_limit} vídeos por semana`:""].filter(Boolean).join(" · ")}</p>
    <PagedList label="atividades" resetKey={module.id+search+filter} empty="Nenhuma atividade publicada com este filtro.">{lessons.filter(visible).map(activity=>{
      const done=doneFor(activity),expired=!!activity.due_on&&activity.due_on<today,future=activity.available_on>today;
      const Icon=activity.kind==="bible"?BookOpen:activity.kind.includes("video")?Play:ClipboardCheck;
      const status=done?(done.status==="graded"?`Nota ${done.score}`:"Aguardando correção"):expired?"Prazo encerrado":future?`A partir de ${ebdDate(activity.available_on)}`:"Disponível";
      return <article className="ebd-activity-row" key={activity.id}><span className="ebd-type-icon"><Icon size={19} aria-hidden="true"/></span><div><h3>{activity.title}</h3><p>{kindLabel[activity.kind]} · {ebdDate(activity.available_on)}{activity.due_on&&` · Até ${ebdDate(activity.due_on)}`}</p><span className={`ebd-badge${done?" is-done":expired?" is-muted":""}`}>{done?<Check size={12} aria-hidden="true"/>:<Clock size={12} aria-hidden="true"/>}{status}</span></div>{mine&&(!mine.module_id||mine.module_id===activity.module_id)&&!done&&!expired&&!future&&<button className="secondary" onClick={()=>onStart(activity)}>Iniciar atividade</button>}</article>;
    })}</PagedList>
  </Disclosure>;})}
  {!shown.length&&<p className="church-empty">{activeModules.length?"Nenhuma atividade encontrada. Ajuste a busca ou a situação.":"Ainda não há módulos disponíveis para esta turma."}</p>}
  </div>;
}
