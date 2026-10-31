"use client";
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import Dashboard from '../../app/dashboard';
import type {Access} from '../../app/permissions';
import {readRecords} from './records';
import {LoadingState,PagedList} from './presentation';

export function RecordsWorkspace({access,finance,people,onNavigate}:{access:Access;finance:boolean;people:boolean;onNavigate:(tab:string)=>void}){
 const [view,setView]=useState(finance?'finance':'archive');
 const archive=useQuery({queryKey:['management-archive'],queryFn:readRecords,enabled:people&&view==='archive'});
 const rows=archive.data?.filter(record=>record.kind!=='transaction')??[];
 const destinations=[['people','Pessoas'],['core-manage','Eventos e conteúdos'],['community','Grupos e encontros'],['ministries','Equipes e escalas']] as const;
 return <section className="records-workspace">
  <nav className="module-tabs" aria-label="Registros administrativos">
   {finance&&<button aria-current={view==='finance'?'page':undefined} onClick={()=>setView('finance')}>Finanças</button>}
   {people&&<button aria-current={view==='archive'?'page':undefined} onClick={()=>setView('archive')}>Arquivo administrativo</button>}
  </nav>
  {view==='finance'&&finance?<div className="icabv-records records-embedded"><Dashboard userName={access.name} access={access} embedded/></div>:<>
   <header className="module-heading"><h1>Arquivo administrativo</h1><p>Consulte os registros do painel anterior. Os cadastros atuais são mantidos nas áreas abaixo.</p></header>
   <nav className="archive-destinations" aria-label="Cadastros oficiais">{destinations.map(([tab,label])=><button className="secondary" key={tab} onClick={()=>onNavigate(tab)}>{label}</button>)}</nav>
   {archive.isPending?<LoadingState/>:archive.error?<div role="alert"><p>Não foi possível carregar o arquivo.</p><button className="secondary" onClick={()=>void archive.refetch()}>Tentar novamente</button></div>:<PagedList label="registros históricos" resetKey="archive" empty="Nenhum registro no arquivo administrativo.">{rows.map(row=><details className="icabv-card archive-record" key={row.id}><summary>{String(row.data.name||row.data.title||row.data.duty||'Registro anterior')}</summary><dl>{Object.entries(row.data).filter(([key,value])=>!['authorId','memberId','eventId'].includes(key)&&value!=='').map(([key,value])=><div key={key}><dt>{({name:'Nome',title:'Título',body:'Texto',date:'Data',status:'Situação',notes:'Observações',description:'Descrição',location:'Local',phone:'Telefone',email:'E-mail',ministry:'Ministério',time:'Horário',authorName:'Pessoa'} as Record<string,string>)[key]??key}</dt><dd>{String(value)}</dd></div>)}</dl></details>)}</PagedList>}
  </>}
 </section>;
}
