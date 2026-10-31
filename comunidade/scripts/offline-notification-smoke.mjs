import {chromium,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const host=readFileSync(new URL('../.env.local',import.meta.url),'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim().replace(/^['"]|['"]$/g,'');
const ref=new URL(host).hostname.split('.')[0],base=process.env.ICABV_TEST_URL||'http://localhost:5173';
const uid='60000000-0000-4000-8000-000000000001',pid='70000000-0000-4000-8000-000000000001',student='70000000-0000-4000-8000-000000000002',cls='70000000-0000-4000-8000-000000000003';
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
const user={id:uid,email:'offline@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const session={access_token:token,refresh_token:'offline-test-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
let attendance={id:'70000000-0000-4000-8000-000000000004',class_id:cls,person_id:student,lesson_date:day,present:false,criteria:{},score:null,note:''};
const receipts=new Map(),saved=[];let read=false;
const notes=[{key:'announcement:test',version:'1',kind:'announcement',title:'Comunicado de teste',body:'Novo comunicado da igreja',tab:'content',section:null,occurred_at:new Date().toISOString(),actionable:false,read_at:null},{key:'worship:test',version:'1',kind:'worship_playlist',title:'Repertório da semana pendente',body:'Você está escalado na abertura. Prepare o repertório.',tab:'louvor',section:'Escalas',occurred_at:new Date().toISOString(),actionable:true,read_at:null}];
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(({key,session})=>{localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('icabv-theme','dark');},{key:`sb-${ref}-auth-token`,session});
 await context.route(host+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').at(-1),body=req.postDataJSON();let data=[];
  if(url.pathname.startsWith('/auth/'))data=user;
  else if(url.pathname.includes('/rpc/')){
   if(table==='my_roles')data=['admin'];
   else if(table==='module_capabilities')data={louvor_manager:true,ebd_manager:true,ebd_teacher:true,ebd_observer:true};
   else if(table==='ebd_directory')data=[{person_id:student,full_name:'Aluno teste offline',role:'student',module_id:null,next_module_id:null,reading_group_size:1}];
   else if(table==='notification_feed')data={items:notes.map((n,i)=>({...n,read_at:i===0&&read?new Date().toISOString():null})),unread_count:read?1:2,total_count:2};
   else if(table==='sync_operation'){
    if(receipts.has(body.operation_id))data=receipts.get(body.operation_id);
    else {saved.push(body);if(body.command.target==='ebd_attendance'){attendance={...attendance,...body.command.body};data=[attendance];}else if(body.command.target==='mark_app_notification'){read=true;data=null;}else data=null;receipts.set(body.operation_id,data);}
   }
  }else{
   if(table==='persons')data=[{id:pid,auth_user_id:uid,full_name:'Gestor de teste',onboarded_at:new Date().toISOString()}];
   else if(table==='ebd_classes')data=[{id:cls,name:'Turma de teste offline',kind:'standard',criteria:[],start_date:day,include_saturday:false,report_style:'marking',archived:false}];
   else if(table==='ebd_class_members')data=[{class_id:cls,person_id:pid,role:'teacher'}];
   else if(table==='ebd_attendance')data=[attendance];
   if(req.headers().accept?.includes('vnd.pgrst.object'))data=data[0]??null;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();
 const pageErrors=[];
 page.on('pageerror',error=>{ if(pageErrors.length<6)pageErrors.push(error.stack||error.message); });
 await page.goto(base+'/gestao?tab=ebd');
 await page.getByRole('heading',{name:'Painel EBD',exact:true}).waitFor();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.reload();
 await page.getByRole('heading',{name:'Painel EBD',exact:true}).waitFor();
 await page.getByRole('navigation',{name:'Áreas da EBD'}).getByRole('button',{name:'Diário e presença',exact:true}).click();
 const form=page.locator('section.module-editor').filter({has:page.getByRole('heading',{name:'Aluno teste offline',exact:true})});
 await page.locator('.ui-disclosure > summary').filter({hasText:'Aluno teste offline'}).click();
 await form.getByLabel('Presente',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(25, 25, 25)');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Sem transbordamento horizontal com sino e sincronização');
 await context.setOffline(true);
 await form.getByLabel('Presente',{exact:true}).check();
 await form.getByRole('button',{name:'Salvar',exact:true}).click();
 await page.getByText('Guardado neste dispositivo. Será enviado quando a conexão voltar.',{exact:true}).waitFor();
 assert.equal(saved.length,0);
 await page.locator('.sync-control.is-offline').waitFor();
 await page.getByRole('button',{name:/^Sincronização:/}).click();
 await page.getByRole('button',{name:'Cancelar envio',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Tentar sincronizar',exact:true}).isDisabled(),true);
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('button',{name:/^Sincronização:/}).getAttribute('aria-expanded'),'false');
 await page.reload();
 await page.getByRole('heading',{name:'Painel EBD',exact:true}).waitFor();
 await page.getByRole('navigation',{name:'Áreas da EBD'}).getByRole('button',{name:'Diário e presença',exact:true}).click();
 await page.locator('.ui-disclosure > summary').filter({hasText:'Aluno teste offline'}).click();
 await form.getByLabel('Presente',{exact:true}).waitFor();
 assert.equal(await form.getByLabel('Presente',{exact:true}).isChecked(),true,'Chamada guardada reaparece após recarregar sem internet');
 mkdirSync('test-results/offline',{recursive:true});
 await page.screenshot({path:'test-results/offline/attendance-pending.png',fullPage:true});
 await context.setOffline(false);
 await expect.poll(()=>attendance.present,{timeout:30000}).toBe(true);
 await page.getByRole('button',{name:'Sincronização: Tudo sincronizado',exact:true}).waitFor({timeout:30000});
 assert.equal(attendance.present,true);assert.equal(saved.filter(x=>x.command.target==='ebd_attendance').length,1);
 await page.getByRole('button',{name:/Notificações: 2 não lidas/}).click();
 await page.getByRole('heading',{name:'Notificações',exact:true}).waitFor();
 assert.deepEqual(pageErrors,[],'Sem erros de execução na versão de produção');
 const announcement=page.locator('.notification-list article').filter({has:page.getByRole('heading',{name:'Comunicado de teste',exact:true})});
 await announcement.getByRole('button',{name:'Marcar como lida',exact:true}).click();
 await page.getByText('1 não lidas',{exact:true}).waitFor();
 await page.screenshot({path:'test-results/offline/notifications.png',fullPage:true});
 await page.locator('.notification-list article').filter({has:page.getByRole('heading',{name:'Repertório da semana pendente',exact:true})}).getByRole('button',{name:'Abrir',exact:true}).click();
 await page.getByRole('heading',{name:'Louvor',exact:true}).waitFor();
 assert.equal(await page.getByRole('navigation',{name:'Áreas do Louvor'}).getByRole('button',{name:'Escalas',exact:true}).getAttribute('aria-current'),'page');
 console.log('OK: fundo #191919; chamada EBD guardada offline, preservada após recarregar e enviada uma vez; sino, leitura de notificação e abertura da escala do Louvor.');
 await context.close();
}finally{await browser.close();}
