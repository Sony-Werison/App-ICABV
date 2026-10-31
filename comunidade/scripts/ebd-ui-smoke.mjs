// EBD fixtures: no real database changes, emails or messages.
import {chromium,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const host=readFileSync(new URL('../.env.local',import.meta.url),'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim().replace(/^['"]|['"]$/g,'');
const base=process.env.ICABV_TEST_URL||'http://localhost:5173',ref=new URL(host).hostname.split('.')[0];
const uid='61000000-0000-4000-8000-000000000091',pid='71000000-0000-4000-8000-000000000091',other='71000000-0000-4000-8000-000000000092';
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
const user={id:uid,email:'ebd@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const session={access_token:token,refresh_token:'test-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
const cls={id:'class1',name:'Turma de teste',kind:'youth',criteria:['Bíblia','Oferta'],start_date:'2026-01-01',include_saturday:false,report_style:'grades',archived:false,whatsapp_template:'Olá {{nome}}, vamos estudar na {{classe}}? Última atividade: {{ultimaAtividade}}.'};
const modules=[{id:'m1',class_id:cls.id,title:'Módulo atual',description:'Caminhada de aprendizado.',position:0,daily_limit:2,weekly_bible_limit:4,weekly_video_limit:2,archived:false},{id:'m2',class_id:cls.id,title:'Próximo módulo',description:'Continuando o estudo',position:1,archived:false}];
const students=[{person_id:pid,full_name:'Aluno logado',role:'student',module_id:'m1',next_module_id:'m2',reading_group_size:1},{person_id:other,full_name:'Aluno acompanhado',role:'student',module_id:'m1',next_module_id:'m2',reading_group_size:1},...Array.from({length:22},(_,i)=>({person_id:'student'+i,full_name:`Estudante ${String(i+1).padStart(2,'0')}`,role:'student',module_id:'m1',next_module_id:null,reading_group_size:1}))];
const activity=(id,title,extra={})=>({id,module_id:'m1',title,kind:'bible',body:'Leia com atenção e responda com suas palavras.',passages:'João 3',video_url:'',questions:[{prompt:'O que aprendeu na leitura?',type:'text'}],available_on:'2026-01-01',due_on:null,published:true,minimum_seconds:2,position:0,...extra});
const activities=[activity('a0','Leitura para hoje'),activity('a1','Atividade já avaliada'),activity('a2','Atividade para corrigir'),activity('future','Atividade futura',{available_on:'2099-01-01'}),activity('expired','Atividade encerrada',{due_on:'2026-01-01'}),activity('next','Estudo do próximo módulo',{module_id:'m2'})];
let submissions=[{id:'graded1',activity_id:'a1',person_id:pid,answers:{0:'Resposta avaliada'},status:'graded',score:8.5,teacher_comment:'Continue estudando.',teacher_id:other,student_reply:'',created_at:today+'T12:00:00Z',graded_at:today+'T13:00:00Z'},{id:'pending1',activity_id:'a2',person_id:other,answers:{0:'Reflexão do aluno'},status:'pending',score:null,teacher_comment:'',teacher_id:null,student_reply:'',created_at:today+'T12:00:00Z',graded_at:null}];
const legacy=[{id:'legacy1',class_id:cls.id,person_id:pid,title:'Leitura importada',kind:'bible',answer:'Resposta antiga',status:'graded',score:9,score_original:90,score_scale:100,teacher_comment:'Comentário preservado',student_reply:'',created_at:'2026-01-03T12:00:00Z'}];
const recordings=[{id:'r1',class_id:cls.id,title:'Aula com vídeo',teacher:'Professor',lesson_date:today,url:'https://www.youtube.com/watch?v=test',published:true,status:'normal'},{id:'r2',class_id:cls.id,title:'Aula sem vídeo',teacher:'Professor',lesson_date:today,url:'',published:true,status:'normal'},{id:'r3',class_id:cls.id,title:'Aula cancelada',teacher:'Professor',lesson_date:today,url:'',published:true,status:'canceled',justification:'Feriado'}];
let attendance=[],mode='admin';const writes=[],requests=[],errors=[];
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(({key,session})=>{localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('icabv-theme','dark');},{key:`sb-${ref}-auth-token`,session});
 await context.route(host+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').at(-1),body=req.postDataJSON();let data=[];requests.push(name);
  if(url.pathname.startsWith('/auth/'))data=user;
  else if(name==='persons')data=[{id:pid,auth_user_id:uid,full_name:'Pessoa Teste',onboarded_at:new Date().toISOString()}];
  else if(name==='my_roles')data=mode==='admin'?['admin']:['member'];
  else if(name==='module_capabilities')data={ebd_manager:mode==='admin',ebd_teacher:mode==='teacher',ebd_observer:false,louvor_manager:false};
  else if(name==='ebd_classes')data=[cls];
  else if(name==='ebd_class_members')data=[{class_id:cls.id,person_id:pid,role:mode==='admin'||mode==='teacher'?'teacher':'student'}];
  else if(name==='ebd_directory')data=mode==='admin'?students:mode==='teacher'?[...students.filter(s=>s.person_id!==pid),{person_id:pid,full_name:'Professor da turma',role:'teacher'}]:students.filter(s=>s.person_id===(mode==='guardian'?other:pid));
  else if(name==='ebd_modules')data=modules;
  else if(name==='ebd_activities')data=activities;
  else if(name==='ebd_submissions')data=submissions.filter(s=>mode==='admin'||mode==='teacher'||s.person_id===(mode==='guardian'?other:pid));
  else if(name==='ebd_legacy_history')data=mode==='guardian'?[]:legacy;
  else if(name==='ebd_attendance')data=attendance;
  else if(name==='ebd_recordings')data=recordings;
  else if(name==='module_people')data=students.map(s=>({id:s.person_id,full_name:s.full_name}));
  else if(name==='ebd_activity_keys'){assert.equal(mode==='admin'||mode==='teacher',true,'Gabarito privado não é lido por alunos/responsáveis');data={answers:{0:1}};}
  else if(name==='start_ebd_activity')data=new Date().toISOString();
  else if(name==='sync_operation'){
   const command=body.command,v=command.body;writes.push(command);
   if(command.target==='start_ebd_activity')data=new Date().toISOString();
   else if(command.target==='ebd_attendance'){const row={...v,id:v.id||'attendance1'};attendance=[row];data=[row];}
   else if(command.target==='grade_ebd_submission'){submissions=submissions.map(s=>s.id===v.submission?{...s,status:'graded',score:Number(v.grade),teacher_comment:v.comment}:s);data=null;}
   else if(command.target==='submit_ebd_activity'){submissions.push({id:'submitted',activity_id:v.activity,person_id:pid,answers:v.responses,status:'pending',score:null,teacher_comment:'',created_at:today+'T15:00:00Z'});data=null;}
   else if(command.target==='reply_ebd_submission'){submissions=submissions.map(s=>s.id===v.submission?{...s,student_reply:v.reply}:s);data=null;}
   else if(command.target==='save_ebd_activity')data='new-activity';
  }
  if(req.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));mkdirSync('test-results/ebd',{recursive:true});
 await page.goto(base+'/app?tab=ebd');const nav=page.getByRole('navigation',{name:'Áreas da EBD'});
 const tab=async name=>{const button=nav.getByRole('button',{name,exact:true});if(!await button.isVisible())await nav.locator('summary').click();await button.click();};
 await page.getByRole('button',{name:'Fazer chamada',exact:true}).click();
 await page.locator('.ui-disclosure > summary').filter({hasText:'Aluno logado'}).click();
 const form=page.locator('.module-editor').filter({has:page.getByRole('heading',{name:'Aluno logado',exact:true})});
 await form.getByLabel('Presente',{exact:true}).check();await form.getByLabel('Bíblia',{exact:true}).check();await form.getByLabel('Nota da aula',{exact:true}).fill('9');requests.length=0;await form.getByRole('button',{name:'Salvar',exact:true}).click();
 await expect.poll(()=>attendance.length).toBe(1);assert.equal(attendance[0].present,true);assert.equal(attendance[0].criteria.Bíblia,true);assert.equal(Number(attendance[0].score),9);await page.getByText('Presente · Registro salvo',{exact:true}).waitFor();assert.equal(requests.includes('ebd_legacy_history'),false,'Salvar chamada não recarrega histórico');assert.equal(requests.includes('ebd_submissions'),false,'Salvar chamada não recarrega respostas');
 await page.getByLabel('Buscar aluno na chamada',{exact:true}).fill('ninguém');await page.getByText('Nenhum resultado. Tente outra busca ou ajuste os filtros.',{exact:true}).waitFor();
 await tab('Correções');await page.getByRole('button',{name:'Avaliar atividade',exact:true}).click();const gradeDialog=page.getByRole('dialog',{name:'Avaliar atividade',exact:true});await gradeDialog.getByLabel('Nota (0 a 10)',{exact:true}).fill('8');await gradeDialog.getByLabel('Comentário do professor',{exact:true}).fill('Boa reflexão!');await gradeDialog.getByRole('button',{name:'Salvar',exact:true}).click();await gradeDialog.waitFor({state:'hidden'});assert.equal(submissions.find(s=>s.id==='pending1').score,8);
 await tab('Módulos e atividades');await page.getByRole('button',{name:'Nova atividade',exact:true}).click();const editor=page.getByRole('dialog',{name:'Nova atividade',exact:true});await editor.getByRole('button',{name:'Adicionar pergunta',exact:true}).click();await editor.getByLabel('Enunciado',{exact:true}).fill('Qual alternativa?');await editor.getByLabel('Tipo de resposta',{exact:true}).selectOption('choice');await editor.getByLabel('Alternativas (uma por linha)',{exact:true}).fill('Primeira\nSegunda');await editor.getByLabel('Alternativa correta',{exact:true}).selectOption('1');await editor.getByLabel('Módulo',{exact:true}).selectOption('m1');await editor.getByLabel('Título da atividade',{exact:true}).fill('Questionário novo');await editor.getByLabel('Tipo de atividade',{exact:true}).selectOption('quiz');await editor.getByRole('button',{name:'Salvar',exact:true}).click();await editor.waitFor({state:'hidden'});assert.equal(writes.find(w=>w.target==='save_ebd_activity').body.answer_key[0],1);
 for(const width of [320,390,575,1440]){await page.setViewportSize({width,height:1000});for(const name of ['Meu painel','Atividades','Gravações','Bíblia','Histórico','Relatórios','Diário e presença','Correções','Módulos e atividades','Turmas e pessoas','Configurações']){await tab(name);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} cabe em ${width}px`);}}
 await page.setViewportSize({width:390,height:844});await tab('Gravações');await page.getByLabel('Situação da aula',{exact:true}).selectOption('canceled');assert.equal(await page.locator('.compact-card').count(),1);await page.getByRole('button',{name:'Ver aula: Aula cancelada',exact:true}).click();await page.getByText('Motivo: Feriado',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Assistir à aula',exact:true}).count(),0);
 await page.getByLabel('Situação da aula',{exact:true}).selectOption('available');await page.getByRole('button',{name:'Ver aula: Aula com vídeo',exact:true}).click();await page.getByRole('link',{name:'Assistir à aula',exact:true}).waitFor();
 await tab('Relatórios');await page.getByLabel('Buscar aluno no relatório',{exact:true}).fill('acompanhado');assert.equal(await page.locator('tbody tr').count(),1);
 mode='student';requests.length=0;await page.reload();await page.getByText('Estudos nesta semana',{exact:true}).waitFor();assert.equal(await nav.getByRole('button',{name:'Diário e presença',exact:true}).count(),0);
 await page.getByRole('button',{name:'Continuar estudos',exact:true}).click();const current=page.locator('.ebd-activity-row').filter({has:page.getByRole('heading',{name:'Leitura para hoje',exact:true})});await current.getByRole('button',{name:'Iniciar atividade',exact:true}).click();const submit=page.getByRole('button',{name:'Enviar atividade',exact:true});await expect(submit).toBeDisabled();await page.getByLabel('O que aprendeu na leitura?',{exact:true}).fill('Aprendi sobre a fé.');await expect(submit).toBeEnabled({timeout:6000});await submit.click();await page.getByRole('heading',{name:'Atividade enviada',exact:true}).waitFor({timeout:8000}).catch(async error=>{console.log(JSON.stringify({screen:await page.locator('.ebd-executor').innerText(),commands:writes.map(w=>w.target).slice(0,20),invalid:await page.locator(':invalid').count()}));throw error;});
 await page.getByRole('button',{name:'Voltar às atividades',exact:true}).click();const future=page.locator('.ebd-activity-row').filter({has:page.getByRole('heading',{name:'Atividade futura',exact:true})});assert.equal(await future.getByRole('button').count(),0,'Atividade futura não oferece início');
 await tab('Histórico');await page.getByLabel('Buscar no histórico',{exact:true}).fill('já avaliada');await page.locator('.ui-disclosure > summary').filter({hasText:'Ver respostas e comentários'}).click();await page.getByText(/Professor:.*Continue estudando\./).waitFor();await page.getByLabel('Seu comentário',{exact:true}).fill('Obrigado, professor.');await page.getByRole('button',{name:'Salvar',exact:true}).click();await expect.poll(()=>submissions.find(s=>s.id==='graded1').student_reply).toBe('Obrigado, professor.');assert.equal(requests.includes('ebd_activity_keys'),false);
 await tab('Meu painel');await page.screenshot({path:'test-results/ebd/student.png',fullPage:false});
 mode='guardian';requests.length=0;await page.reload();await page.getByText('Estudos nesta semana',{exact:true}).waitFor();await page.getByRole('heading',{name:'Jornada de Aluno acompanhado',exact:true}).waitFor();assert.equal(await page.getByLabel('Acompanhar aluno',{exact:true}).count(),0,'Responsável com um aluno não precisa selecionar novamente');await tab('Atividades');assert.equal(await page.getByRole('button',{name:'Iniciar atividade',exact:true}).count(),0);assert.equal(requests.includes('ebd_activity_keys'),false);
 mode='teacher';await page.reload();await tab('Diário e presença');await page.getByLabel('Buscar aluno na chamada',{exact:true}).waitFor();assert.equal(await nav.getByRole('button',{name:'Turmas e pessoas',exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.equal(writes.filter(w=>w.target==='start_ebd_activity').length,1,'Início da atividade não se repete durante atualizações globais');console.log('OK: 11 áreas, aluno/professor/responsável/gestão, chamada individual, correção, gabarito privado, criação de questão, busca, prazo, tempo mínimo, envio, réplica, gravações, relatórios e 320/390/575/1440 px; gravações isoladas.');await context.close();
}finally{await browser.close();}
