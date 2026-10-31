import type {Submission} from "./ebd-model";
export const kindLabel:Record<string,string>={bible:"Leitura bíblica",video:"Vídeo",quiz:"Questionário",video_bible:"Vídeo e Bíblia",manual:"Atividade da turma"};
const dayFormatter=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"});
export const ebdToday=()=>dayFormatter.format(new Date());
export function ebdDate(value:string){return value?new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo"}).format(new Date(value.length===10?`${value}T12:00:00Z`:value)):"Sem data";}
export function studyWeek(personId:string,submissions:Pick<Submission,"person_id"|"created_at">[],today:string){
  const first=new Date(`${today}T12:00:00Z`);first.setUTCDate(first.getUTCDate()-(first.getUTCDay()+6)%7);
  const counts=new Map<string,number>();
  for(const submission of submissions)if(submission.person_id===personId){const date=dayFormatter.format(new Date(submission.created_at));counts.set(date,(counts.get(date)??0)+1);}
  return Array.from({length:7},(_,index)=>{const day=new Date(first);day.setUTCDate(day.getUTCDate()+index);const date=day.toISOString().slice(0,10);return {date,count:counts.get(date)??0,today:date===today};});
}
