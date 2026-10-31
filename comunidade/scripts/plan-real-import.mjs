// Offline reconciliation of the read-only exports. Private artifacts stay under ignored work/.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import ts from 'typescript';
import assert from 'node:assert/strict';
const dir=process.env.ICABV_IMPORT_DIR||'work/real-import-20261022';
const read=name=>JSON.parse(readFileSync(dir+'/'+name+'.json','utf8'));
const snapshot=read('snapshot-summary'),target=read('target-before'),music=read('louvor-source'),school=read('ebd-source');
assert.equal(snapshot.sources.louvor.status,'live');assert.equal(snapshot.sources.ebd.status,'live');
const digest=value=>createHash('sha256').update(typeof value==='string'?value:stable(value)).digest('hex');
for(const [name,expected]of [['louvor-source',snapshot.sources.louvor.sha256],['ebd-source',snapshot.sources.ebd.sha256],['target-before',snapshot.target_hash]])assert.equal(digest(readFileSync(dir+'/'+name+'.json','utf8')),expected);
const modelSource=readFileSync(new URL('../features/icabv/worship-model.ts',import.meta.url),'utf8');
const {normalizeSong}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(modelSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
function stable(v){if(Array.isArray(v))return '['+v.map(x=>x===undefined?'null':stable(x)).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const realEmail=s=>{const email=String(s||'').trim().toLowerCase();return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)&&!/@(?:portal-ebd\.com|default-app-id\.com)$/.test(email)?email:'';};
const stringify=v=>v===undefined||v===null?'':typeof v==='object'?JSON.stringify(v):String(v);
const day=v=>{if(!v)return null;const s=String(v);if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);if(/^\d{2}\/\d{2}\/\d{4}$/.test(s))return s.split('/').reverse().join('-');throw Error('Unrecognized date format');};
const captured=snapshot.captured_at,localToday=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(captured));
const issues=[];let decisions={mergeDuplicatedStaff:false};try{decisions=read('identity-decisions');}catch{}
const nodes=new Map(),parent=new Map();
function add(source,p,extra={}){const key=source+':'+p.id;assert.ok(p.id);if(!nodes.has(key)){nodes.set(key,{key,source,profile:p,...extra});parent.set(key,key);}return key;}
function root(key){if(parent.get(key)!==key)parent.set(key,root(parent.get(key)));return parent.get(key);}
function unite(a,b,reason){assert.ok(nodes.has(a)&&nodes.has(b));const x=root(a),y=root(b);if(x!==y){parent.set(y,x);links.push({a,b,reason});}}
const links=[];for(const p of music.members)add('louvor',p);for(const p of school.profiles)add('ebd',p);
const liveProfiles=new Map(school.profiles.map(p=>[p.id,p]));
const archiveId='icabv-legacy-unresolved';
function stripSecrets(v){if(Array.isArray(v))return v.map(stripSecrets);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!/password|secret|token|private.?key/i.test(k)).map(([k,v])=>[k,stripSecrets(v)]));return v;}
const oldBackup=stripSecrets(JSON.parse(readFileSync('C:/Users/perei/apps/App Igreja/Portal-do-aluno-EBD/backup.json','utf8').replace(/^\uFEFF/,'')));
const missingSchool=[...new Set([...school.submissions.map(s=>s.user_id),...school.profiles.flatMap(p=>p.linked_student_ids||[])].filter(Boolean).filter(id=>!liveProfiles.has(id)))];
for(const id of missingSchool){const old=oldBackup.profiles.find(p=>p.id===id);const p=old?{...old,id}:{id,name:'Aluno de cadastro removido · '+id.slice(0,8),role:'student',classId:archiveId,moduleId:null};add('ebd',p,{recovered:!!old,removed:!old});
 if(old){const matches=school.profiles.filter(p=>norm(p.name)===norm(old.name));const oldGuardianNames=oldBackup.profiles.filter(p=>(p.linked_student_ids||[]).includes(id)).map(p=>norm(p.name));const candidate=matches.length===1?matches[0]:null;const sameGuardian=candidate&&school.profiles.some(p=>(p.linked_student_ids||[]).includes(candidate.id)&&oldGuardianNames.includes(norm(p.name)));if(candidate&&sameGuardian){unite('ebd:'+id,'ebd:'+candidate.id,'historical ID + exact name + same guardian');p.classId=candidate.classId;p.moduleId=candidate.moduleId;}else issues.push({kind:'recovered_profile_kept_separate',source_id:id,name:p.name});}
 else issues.push({kind:'missing_student_identity',source_id:id});
}
const knownMusic=new Set(music.members.map(p=>p.id));
for(const id of new Set(music.monthly_schedules.flatMap(s=>Object.values(s.assignments||{}).flat()).filter(Boolean))){if(!knownMusic.has(id)){add('louvor',{id,name:'Integrante de cadastro removido · '+id.slice(0,8),roles:[]},{removed:true});issues.push({kind:'missing_music_identity',source_id:id});}}
const ownerEmail='pereirawerison@gmail.com',ownerAuth=target.auth_users.find(p=>p.email?.toLowerCase()===ownerEmail),owner=target.persons.find(p=>p.auth_user_id===ownerAuth?.id);assert.ok(ownerAuth?.email_confirmed_at&&owner);
const ownerMusic=music.members.filter(p=>realEmail(p.email)===ownerEmail);assert.equal(ownerMusic.length,1);
const ownerNode='louvor:'+ownerMusic[0].id;
for(const p of school.profiles.filter(p=>realEmail(p.email)===ownerEmail||norm(p.name)===norm(ownerMusic[0].name)))unite(ownerNode,'ebd:'+p.id,'explicit owner account, verified email and unique personal name');
// Keep uncertain identities separate; a name alone never links a historical profile to another app.
for(const m of music.members){const matches=school.profiles.filter(p=>norm(p.name)===norm(m.name));if(matches.length===1){const a=realEmail(m.email),b=realEmail(matches[0].email);if(a&&b&&a===b)unite('louvor:'+m.id,'ebd:'+matches[0].id,'exact name and matching contact email');else if(root('louvor:'+m.id)!==root('ebd:'+matches[0].id))issues.push({kind:'cross_app_identity_kept_separate',name:m.name});}}
for(const name of ['Lilian Pirani','Bruna Vanzeli']){const pair=school.profiles.filter(p=>norm(p.name)===norm(name));if(pair.length===2&&decisions.mergeDuplicatedStaff)unite('ebd:'+pair[0].id,'ebd:'+pair[1].id,'owner-confirmed teacher/guardian correspondence');else if(pair.length>1)issues.push({kind:'staff_identity_not_confirmed',name,source_ids:pair.map(p=>p.id)});}
const lucas=school.profiles.filter(p=>norm(p.name)==='lucas gabriel');if(lucas.length===2)assert.notEqual(lucas[0].birthDate,lucas[1].birthDate);
const groups=new Map();for(const node of nodes.values()){const key=root(node.key);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(node);}
const existingMappings=new Map(target.legacy_mapping.map(m=>[[m.source_system,m.entity_type,m.legacy_id].join('|'),m.canonical_id]));
const mappings=new Map(),nodeId=new Map(),people=[];
const putMapping=(source,kind,id,canonical)=>{const key=[source,kind,id].join('|'),prior=existingMappings.get(key);if(prior)assert.equal(prior,canonical,'Existing identity mapping conflict');const m=mappings.get(key);if(m)assert.equal(m.canonical_id,canonical);mappings.set(key,{source_system:source,entity_type:kind,legacy_id:String(id),canonical_id:canonical});return canonical;};
for(const group of groups.values()){
 const prior=[...new Set(group.map(n=>existingMappings.get([n.source,'person',n.profile.id].join('|'))).filter(Boolean))];assert.ok(prior.length<=1,'Conflicting previous person mappings');
 const isOwner=group.some(n=>root(n.key)===root(ownerNode));const names=group.map(n=>n.profile.name).filter(n=>n&&norm(n)!=='administrador');const name=isOwner?ownerMusic[0].name:names[0];assert.ok(name?.trim().length>=2&&name.length<=120);
 let canonical=isOwner?owner.id:prior[0];
 if(!canonical){const matches=target.persons.filter(p=>norm(p.full_name)===norm(name)&&p.full_name);if(matches.length===1&&!matches[0].auth_user_id)canonical=matches[0].id;}
 canonical??=randomUUID();
 const birthdays=[...new Set(group.map(n=>day(n.profile.birthDate)).filter(Boolean))];assert.ok(birthdays.length<=1,'Conflicting birth dates in a proposed person merge');
 const emails=[...new Set(group.map(n=>realEmail(n.profile.email)).filter(Boolean))];assert.ok(emails.length<=1,'Conflicting contact email');
 const phone=group.map(n=>String(n.profile.phone||'').trim()).find(Boolean)||'';
 const avatar=group.map(n=>String(n.profile.avatar||'')).find(v=>v.startsWith('https://'))||'';
 people.push({canonical_id:canonical,name,email:isOwner?ownerEmail:emails[0]||'',phone,birth_date:birthdays[0]||null,avatar_url:avatar,references:group.map(n=>({source_system:n.source,legacy_id:n.profile.id,source_data:n.profile})),match_basis:links.filter(l=>group.some(n=>n.key===l.a||n.key===l.b)).map(l=>l.reason)});
 for(const n of group){nodeId.set(n.key,canonical);putMapping(n.source,'person',n.profile.id,canonical);}
}
function resource(source,kind,id,preferred){const existing=existingMappings.get([source,kind,id].join('|'));const current=mappings.get([source,kind,id].join('|'))?.canonical_id;const canonical=existing||current||preferred||randomUUID();putMapping(source,kind,id,canonical);return canonical;}
function blankBundle(){return {people:[],songs:[],services:[],classes:[],modules:[],enrollments:[],guardians:[],activities:[],recordings:[],history:[],attendance:[]};}
const louvor=blankBundle(),ebd=blankBundle();
for(const n of nodes.values()){const p=n.profile;const target=n.source==='louvor'?louvor:ebd;target.people.push({legacy_id:p.id,name:p.name,person_id:nodeId.get(n.key),email:realEmail(p.email),phone:String(p.phone||''),roles:p.roles||[]});}
const musicSongIds=new Set(music.songs.map(s=>s.id));
for(const s of music.songs){const normalized=normalizeSong(s);resource('louvor','song',s.id);louvor.songs.push({...normalized,legacy_id:s.id});}
for(const s of music.monthly_schedules){
 const sourceDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.date));
 for(const period of ['manha','noite']){
  const id=s.id+':'+period,assignments={};for(const [column,ids]of Object.entries(s.assignments||{})){if(/manha|noite/i.test(column)&&!column.includes(period))continue;const role=column.replace(/[_-]?(manha|noite)/ig,'').replace(/abertura/i,'Abertura').replace(/pregacao/i,'Pregação').replace(/multimedia|multimidia/i,'Multimídia');assignments[role]=(ids||[]).filter(Boolean);for(const person of assignments[role])assert.ok(nodeId.has('louvor:'+person));}
  const playlist=(s['playlist_'+period]||[]);for(const id of playlist)assert.ok(musicSongIds.has(id));
  const starts_at=sourceDay+'T'+(period==='manha'?'09':'19')+':00:00-03:00';resource('louvor','service',id);
  louvor.services.push({legacy_id:id,title:s['name_'+period]||'Culto de '+(period==='manha'?'manhã':'noite'),starts_at,period:period==='manha'?'manhã':'noite',assignments,playlist,featured:!!s.isFeatured,status:new Date(starts_at)<new Date(captured)?'completed':'planned'});
 }
}
const sourceClasses=new Map(school.classes.map(c=>[c.id,c]));
const classForProfile=p=>sourceClasses.has(p.classId)?p.classId:archiveId;
if([...nodes.values()].some(n=>n.source==='ebd'&&n.profile.role==='student'&&classForProfile(n.profile)===archiveId))sourceClasses.set(archiveId,{id:archiveId,name:'Acervo antigo · cadastros removidos',type:'standard',gradingCriteria:[{id:'presence',label:'Presença'}],archived:true});
for(const c of sourceClasses.values()){resource('ebd','class',c.id);ebd.classes.push({legacy_id:c.id,name:c.name,kind:c.type||'standard',criteria:(c.gradingCriteria||[]).map(g=>g.label).filter(Boolean).length?(c.gradingCriteria||[]).map(g=>g.label).filter(Boolean):['Presença'],include_saturday:!!c.includeSaturday,report_style:c.reportStyle==='grades'?'grades':'marking',start_date:day(c.startDate)||localToday,archived:!!c.archived,whatsapp_template:school.settings[0]?.whatsappTemplate});}
const activityLookup=new Map(),moduleLookup=new Set();
for(const c of sourceClasses.values()){
 if(c.id===archiveId)continue;
 const assignedModules=new Set(school.profiles.filter(p=>p.classId===c.id).flatMap(p=>[p.moduleId,p.nextModuleId]).filter(v=>v!==null&&v!==undefined).map(String));
 for(const [modulePosition,[mid,m]]of Object.entries(school.curriculum).entries()){
  if(c.type!=='youth'&&!assignedModules.has(mid))continue;
  const id=c.id+':'+mid;moduleLookup.add(id);resource('ebd','module',id);ebd.modules.push({legacy_id:id,class_legacy_id:c.id,title:m.title,description:m.description||'',position:modulePosition,daily_limit:m.dailyActivityLimit==='single'?1:Number(m.dailyActivityLimit)||0,weekly_bible_limit:Number(m.weeklyBibleLimit)||0,weekly_video_limit:Number(m.weeklyVideoLimit)||0});
  for(const [index,a]of(m.schedule||[]).entries()){
   const aid=id+':'+index,options=(a.options||[]).map(o=>typeof o==='string'?o:stringify(o.text??o.label??o)),questions=a.question?[{prompt:a.question,type:options.length>=2?'choice':'text',...(options.length>=2?{options}:{})}]:[];
   const keys={__legacy_source:a,...(options.length>=2?{0:Number(a.correct)||0}:a.expectedAnswer?{0:String(a.expectedAnswer)}:{})};assert.ok(!options.length||options.length>=2);
   resource('ebd','activity',aid);
   const row={legacy_id:aid,module_legacy_id:id,title:(a.title||'Atividade '+(index+1)).slice(0,180),kind:['bible','video','quiz','video_bible','manual'].includes(a.type)?a.type:'manual',body:a.description||a.content||'',passages:a.book?String(a.book)+' '+(a.chapters||[]).map(n=>Number(n)+1).join(', '):'',video_url:a.videoId?'https://www.youtube.com/watch?v='+encodeURIComponent(a.videoId):'',questions,position:index,answer_key:keys,available_on:localToday,published:true,minimum_seconds:['bible','video','video_bible'].includes(a.type)?120:0};ebd.activities.push(row);
   const lookupKey=[c.id,mid,a.type,norm(a.title)].join('|');if(!activityLookup.has(lookupKey))activityLookup.set(lookupKey,[]);activityLookup.get(lookupKey).push({id:aid,raw:a});
  }
 }
}
const enrollmentKeys=new Set();for(const n of nodes.values())if(n.source==='ebd'&&['student','teacher'].includes(n.profile.role)){
 const p=n.profile,cls=classForProfile(p),person=nodeId.get(n.key),key=cls+'|'+person;
 if(enrollmentKeys.has(key))continue;enrollmentKeys.add(key);
 ebd.enrollments.push({person_legacy_id:p.id,class_legacy_id:cls,role:p.role,module_legacy_id:moduleLookup.has(cls+':'+p.moduleId)?cls+':'+p.moduleId:null,next_module_legacy_id:moduleLookup.has(cls+':'+p.nextModuleId)?cls+':'+p.nextModuleId:null,reading_group_size:Math.max(1,Math.min(100,Number(p.bibleReadingGroupSize)||Number(school.curriculum[String(p.moduleId)]?.bibleReadingGroupSize)||3))});
}
const guardianKeys=new Set();for(const p of school.profiles)for(const student of p.linked_student_ids||[]){const a=nodeId.get('ebd:'+student),b=nodeId.get('ebd:'+p.id);assert.ok(a&&b);const key=a+'|'+b;if(a===b){issues.push({kind:'self_guardian_omitted',source_id:p.id});continue;}if(guardianKeys.has(key))continue;guardianKeys.add(key);ebd.guardians.push({student_legacy_id:student,guardian_legacy_id:p.id});}
const teacherId=name=>{const matches=people.filter(p=>p.references.some(r=>r.source_system==='ebd'&&norm(r.source_data.name)===norm(name)));const teachers=matches.filter(p=>p.references.some(r=>r.source_system==='ebd'&&r.source_data.role==='teacher'&&norm(r.source_data.name)===norm(name)));return teachers.length===1?teachers[0].canonical_id:matches.length===1?matches[0].canonical_id:null;};
const criteriaMap=new Map([...sourceClasses.values()].map(c=>[c.id,new Map((c.gradingCriteria||[]).map(g=>[g.id,g.label]))]));
function historyClass(s){const p=nodes.get('ebd:'+s.user_id).profile;if(s.type==='class_evaluation'){let values;try{values=JSON.parse(s.answer);}catch{values={};}const counts=[...criteriaMap].map(([id,map])=>({id,count:Object.keys(values).filter(k=>k!=='presence'&&map.has(k)).length})).sort((a,b)=>b.count-a.count);if(counts[0]?.count>0&&counts[0].count!==(counts[1]?.count||0))return counts[0].id;}return classForProfile(p);}
const historyGroups=new Map(),attendanceGroups=new Map();let linkedActivities=0;
for(const s of [...school.submissions].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||a.id.localeCompare(b.id))){
 const person=nodeId.get('ebd:'+s.user_id);assert.ok(person);const cls=historyClass(s),original=s.score===undefined||s.score===null?null:Number(s.score),scale=['daily_grade'].includes(s.type)?2:['weekly_grade'].includes(s.type)?10:100;
 assert.ok(original===null||Number.isFinite(original));const grade=original===null?null:scale===100?original/10:original;assert.ok(grade===null||grade>=0&&grade<=10);
 const fingerprint=digest({...s,id:undefined,user_id:person});const known=historyGroups.get(fingerprint);const canonical=resource('ebd','history',s.id,known?.canonical);
 if(known){assert.equal(known.canonical,canonical);known.row.source_data.legacy_aliases.push(s.id);continue;}
 let candidates=activityLookup.get([cls,String(s.moduleId),s.type,norm(s.contentLabel)].join('|'))||[];if(candidates.length>1)candidates=candidates.filter(a=>norm(a.raw.question)===norm(s.question));const activity=candidates.length===1?candidates[0].id:null;if(activity)linkedActivities++;
 const row={legacy_id:s.id,person_legacy_id:s.user_id,class_legacy_id:cls,module_title:school.curriculum[String(s.moduleId)]?.title||'',title:s.contentLabel||'Registro antigo',kind:s.type||'manual',question:stringify(s.question),answer:stringify(s.answer),correct_answer:stringify(s.correctAnswer),score:grade,status:s.status==='pending_review'?'pending':'graded',teacher_comment:s.teacherComment||'',student_reply:s.studentReply||'',created_at:s.createdAt,score_original:original,score_scale:scale,teacher_id:teacherId(s.teacherName),activity_legacy_id:activity,source_data:{...s,legacy_aliases:[s.id]}};
 assert.ok(!Number.isNaN(new Date(row.created_at).getTime()));ebd.history.push(row);historyGroups.set(fingerprint,{canonical,row});
 if(['class_evaluation','sunday_presence'].includes(s.type)){
  const lessonDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.createdAt));const key=[cls,person,lessonDate].join('|');let raw={presence:true};if(s.type==='class_evaluation'){try{raw=JSON.parse(s.answer);}catch{issues.push({kind:'invalid_attendance_json',source_id:s.id});}}
  const criteria=Object.fromEntries(Object.entries(raw).filter(([k])=>k!=='presence').map(([k,v])=>[criteriaMap.get(cls)?.get(k)||k,!!v]));const a={legacy_id:'lesson:'+cls+':'+s.user_id+':'+lessonDate,class_legacy_id:cls,person_legacy_id:s.user_id,lesson_date:lessonDate,present:!!raw.presence,criteria,score:null,note:s.teacherName?'Registro de origem · '+s.teacherName:'Registro importado'};
  const previous=attendanceGroups.get(key);if(previous&&stable(previous.criteria)!==stable(criteria))issues.push({kind:'attendance_versions_preserved_in_history',source_id:s.id});attendanceGroups.set(key,a);
 }
}
for(const a of attendanceGroups.values()){resource('ebd','attendance',a.legacy_id);ebd.attendance.push(a);}
const youthClass=[...sourceClasses.values()].find(c=>c.type==='youth');assert.ok(youthClass);
for(const r of school.classRecordings){const cls=sourceClasses.has(r.classId)?r.classId:youthClass.id;const url=r.link||'';assert.ok(!url||url.startsWith('https://'));resource('ebd','recording',r.id);ebd.recordings.push({legacy_id:r.id,class_legacy_id:cls,title:(r.title||'Registro de aula').slice(0,180),lesson_date:day(r.date),teacher:r.teacher||'',url,published:true,status:r.status==='cancelled'?'canceled':'normal',justification:r.justification||'',source_data:r});}
const observers=[...new Set(school.profiles.filter(p=>p.role==='elder').map(p=>nodeId.get('ebd:'+p.id)))].map(person_id=>({person_id}));
const removedMusic=[...nodes.values()].filter(n=>n.source==='louvor'&&n.removed).map(n=>nodeId.get(n.key));
const rehearsals=[];for(const r of music.rehearsal||[])if(r.playlist?.length){const ids=r.playlist.map(id=>resource('louvor','song',id));rehearsals.push({id:resource('louvor','rehearsal',r.id),person_id:owner.id,title:'Ensaio importado do Louvor',playlist:ids});}
const summary={source_counts:snapshot.sources,canonical_people:people.length,people_reused:people.filter(p=>target.persons.some(t=>t.id===p.canonical_id)).length,people_created:people.filter(p=>!target.persons.some(t=>t.id===p.canonical_id)).length,person_source_ids:[...nodes.values()].length,owner_person_id:owner.id,owner_source_ids:people.find(p=>p.canonical_id===owner.id).references.map(r=>({source:r.source_system,id:r.legacy_id})),music_songs:louvor.songs.length,music_services:louvor.services.length,school_classes:ebd.classes.length,school_modules:ebd.modules.length,school_activities:ebd.activities.length,school_history_source_records:school.submissions.length,school_history_unique_records:ebd.history.length,history_aliases_collapsed:school.submissions.length-ebd.history.length,history_linked_to_activities:linkedActivities,attendance_records:ebd.attendance.length,recordings:ebd.recordings.length,guardians:ebd.guardians.length,identity_issues:issues.filter(i=>i.kind!=='attendance_versions_preserved_in_history'),attendance_version_notes:issues.filter(i=>i.kind==='attendance_versions_preserved_in_history').length,owner_teaching_records:ebd.history.filter(h=>h.teacher_id===owner.id).length,owner_study_records:ebd.history.filter(h=>nodeId.get('ebd:'+h.person_legacy_id)===owner.id).length};
const plan={run_id:randomUUID(),captured_at:captured,source_hashes:{louvor:snapshot.sources.louvor.sha256,ebd:snapshot.sources.ebd.sha256},target_before_hash:snapshot.target_hash,people,mappings:[...mappings.values()],louvor,ebd,observers,removed_music_people:removedMusic,rehearsals,summary};
plan.plan_hash=digest(plan);
assert.ok(JSON.stringify(louvor).length<20000000&&JSON.stringify(ebd).length<20000000&&JSON.stringify(plan).length<40000000);
writeFileSync(dir+'/import-plan.json',JSON.stringify(plan,null,2));writeFileSync(dir+'/reconciliation.json',JSON.stringify({summary,links,people:people.map(({references,...p})=>({...p,references:references.map(r=>({source_system:r.source_system,legacy_id:r.legacy_id,name:r.source_data.name,role:r.source_data.role}))})),issues},null,2));
console.log(JSON.stringify({...summary,plan_hash:plan.plan_hash,plan_bytes:Buffer.byteLength(JSON.stringify(plan))},null,2));

