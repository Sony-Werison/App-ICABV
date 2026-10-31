import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='work/escalas-pdf';
const people=JSON.parse(readFileSync(`${folder}/people-before.json`,'utf8')).filter(p=>!p.merged_into);
const norm=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim().replace(/\s+/g,' ');
const sources=[['lanches','Lanches e sucos EBD','C:/Users/perei/Downloads/Escala de lanches.pdf'],['limpeza','Limpeza','C:/Users/perei/Downloads/Escala_limpeza-1[1].docx.pdf']];
const plan=sources.map(([key,title,path],index)=>{
 const table=JSON.parse(readFileSync(`${folder}/${key}.json`,'utf8'))[0].tables[0];
 const groups=Array.from({length:4},(_,i)=>({id:`g${i+1}`,label:`Grupo ${i+1}`,members:[]})),dates=[];
 let role=key==='limpeza'?'Limpeza':'Lanche';
 for(const row of table)for(let col=0;col<4;col++){
  const name=(row[col]||'').trim();if(!name)continue;
  if(/^SUCO:/i.test(name)){role='Suco';continue;}if(/^(ESCALA|GRUPO|LANCHE:)/i.test(name))continue;
  if(/^\d{2}\/\d{2}\/\d{2,4}$/.test(name)){
   const corrected=name==='16/05/2025'?'16/05/2026':name;
   const [d,m,y]=corrected.split('/');const date=`${y.length===2?'20'+y:y}-${m}-${d}`;
   assert.equal(new Date(date+'T12:00:00Z').toISOString().slice(0,10),date);
   dates.push({date,group_id:groups[col].id,...(corrected!==name?{original_date:name,note:'Ano corrigido para 2026 com autorização do usuário.'}:{})});continue;
  }
  const matches=name.split(/\s+/).length>=2&&!/[()]/.test(name)?people.filter(p=>norm(p.full_name)===norm(name)):[];
  groups[col].members.push({id:`g${col+1}-m${groups[col].members.length+1}`,name,role,person_id:matches.length===1?matches[0].id:null});
 }
 dates.sort((a,b)=>a.date.localeCompare(b.date));
 assert.equal(dates.length,index===0?16:52);assert.equal(new Set(dates.map(d=>d.date)).size,dates.length);
 for(const d of dates)assert.equal(new Date(d.date+'T12:00:00Z').getUTCDay(),index===0?0:6);
 return {id:`98000000-0000-4000-8000-00000000000${index+1}`,title,source_name:path.split('/').at(-1),source_sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),groups,dates};
});
assert.deepEqual(plan.map(p=>p.groups.map(g=>g.members.length)),[[15,16,15,14],[8,7,7,8]]);
writeFileSync(`${folder}/plan.json`,JSON.stringify(plan,null,2));
console.log(JSON.stringify(plan.map(p=>({title:p.title,dates:p.dates.length,linked:p.groups.flatMap(g=>g.members).filter(m=>m.person_id).map(m=>m.name)}))));
