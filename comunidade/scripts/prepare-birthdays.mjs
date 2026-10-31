import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='work/aniversarios-pdf',source='C:/Users/perei/Downloads/Aniversariantes ICABV - Página1.pdf';
const pages=JSON.parse(readFileSync(`${folder}/extracted.json`,'utf8')),people=JSON.parse(readFileSync(`${folder}/people-before.json`,'utf8')).filter(p=>!p.merged_into);
const norm=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim().replace(/\s+/g,' ');
const sha=createHash('sha256').update(readFileSync(source)).digest('hex');
const report={weddings:[],corrections:[],duplicates:[],blank:0,links:[],conflicts:[]},rows=[];
for(const page of pages)for(const [rowIndex,row] of page.tables.flat().entries()){
 const [date,name,relation,type]=row.map(s=>(s||'').trim());
 if(date==='Data')continue;
 if(!date&&!name){report.blank++;continue;}
 assert.match(date,/^\d{2}\/\d{2}\/2026$/);assert.ok(name);
 const record={page:page.page,row:rowIndex+1,date,name,relation,type};
 const corrected=(name==='Manuela'&&['20/02/2026','02/07/2026'].includes(date))||(name==='Pedro'&&date==='22/11/2026');
 if(corrected){record.correction='Tipo corrigido de Casamento para Aniversário com autorização do usuário.';report.corrections.push(record);}
 else if(norm(type)==='casamento'||norm(relation).includes('casamento')){report.weddings.push(record);continue;}
 else assert.ok(!type||norm(type)==='aniversario');
 const [day,month]=date.split('/').map(Number);assert.equal(new Date(Date.UTC(2000,month-1,day)).getUTCMonth(),month-1);
 rows.push({...record,birth_day:day,birth_month:month});
}
const combined=new Map();
for(const row of rows){
 const key=`${norm(row.name)}:${row.birth_month}:${row.birth_day}`;
 const prior=combined.get(key);
 if(prior&&(!row.relation||!prior.relation||norm(row.relation)===norm(prior.relation))){prior.sources.push(row);report.duplicates.push(row);}
 else{assert.ok(!prior,'Same name/date with different relationships requires review');combined.set(key,{...row,sources:[row]});}
}
const birthdays=[...combined.values()],usedPeople=new Set();
const plan=birthdays.map(row=>{
 const exact=row.name.split(/\s+/).length>=2?people.filter(p=>norm(p.full_name)===norm(row.name)):[];
 const byDate=people.filter(p=>p.birth_date?.slice(5)===`${String(row.birth_month).padStart(2,'0')}-${String(row.birth_day).padStart(2,'0')}`&&(norm(p.full_name)===norm(row.name)||norm(p.full_name).startsWith(norm(row.name)+' ')));
 let person=exact.length===1?exact[0]:byDate.length===1?byDate[0]:null;
 if(person?.birth_date&&person.birth_date.slice(5)!==`${String(row.birth_month).padStart(2,'0')}-${String(row.birth_day).padStart(2,'0')}`){report.conflicts.push({source:row,person_id:person.id});person=null;}
 if(person){assert.ok(!usedPeople.has(person.id),'Multiple source entries resolve to the same person');usedPeople.add(person.id);report.links.push({source:row.name,name:person.full_name});}
 const homonyms=birthdays.filter(b=>norm(b.name)===norm(row.name)).length>1;
 const hash=createHash('sha256').update(`${sha}:${norm(row.name)}:${row.birth_month}:${row.birth_day}`).digest('hex');
 const id=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
 return {id,display_name:person?.full_name??`${row.name}${homonyms&&row.relation?` (${row.relation})`:''}`,birth_day:row.birth_day,birth_month:row.birth_month,person_id:person?.id??null,source_sha256:sha,source_name:source.split('/').at(-1),source_rows:row.sources};
});
assert.equal(report.corrections.length,3);assert.equal(report.duplicates.length,1);
writeFileSync(`${folder}/plan.json`,JSON.stringify(plan,null,2));writeFileSync(`${folder}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({birthdays:plan.length,linked:usedPeople.size,weddings:report.weddings.length,corrected:report.corrections.length,duplicates:report.duplicates.length,conflicts:report.conflicts.length}));
