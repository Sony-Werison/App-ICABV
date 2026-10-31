// Isolated browser integration: every Supabase request is intercepted; no real accounts change.
import { chromium, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const host=readFileSync(new URL('../.env.local',import.meta.url),'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim().replace(/^['"]|['"]$/g,'');
const base=process.env.ICABV_TEST_URL||'http://localhost:5173',ref=new URL(host).hostname.split('.')[0];
const uid='61000000-0000-4000-8000-000000000001',pid='71000000-0000-4000-8000-000000000001';
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
const user={id:uid,email:'identity-test@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const session={access_token:token,refresh_token:'identity-test-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
const common={membership:'member',verified:false,has_account:false,account_email:null,contacts:null,sources:[],roles:[],classes:[],history_count:0,attendance_count:0,guardian_count:0,worship:null};
const source={...common,id:'72000000-0000-4000-8000-000000000001',name:'Ana Antiga (teste)',sources:[{system:'ebd',id:'ana-antiga'}],history_count:47,attendance_count:12,classes:[{name:'Jovens',role:'student'}]};
const target={...common,id:'72000000-0000-4000-8000-000000000002',name:'Ana Atual (teste)',has_account:true,verified:true,account_email:'ana@example.invalid'};
const other={...common,id:'72000000-0000-4000-8000-000000000003',name:'Ana Antiga (homônima)',sources:[{system:'louvor',id:'outra-ana'}]};
let merged=false,distinct=false;const calls=[],history=[],receipts=new Map();
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${ref}-auth-token`,session});
 await context.route(host+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').at(-1),args=req.postDataJSON();let data=[];
  if(url.pathname.startsWith('/auth/'))data=user;
  else if(url.pathname.includes('/rpc/')){
   if(name==='my_roles')data=['admin'];
   else if(name==='module_capabilities')data={louvor_manager:true,ebd_manager:true,ebd_teacher:true,ebd_observer:true};
   else if(name==='notification_feed')data={items:[],unread_count:0,total_count:0};
   else if(name==='identity_directory')data={items:(args.list_mode==='imported'?[...(!merged?[source]:[]),other]:[...(!merged?[source]:[]),target,other])};
   else if(name==='identity_duplicates')data=distinct?[]:[{left:other,right:target,name_match:true,email_match:false,phone_match:false}];
   else if(name==='identity_review_history')data=history;
   else if(name==='identity_preview')data={source,target,fingerprint:'verified-fingerprint',profile_choice:true,impact:[{table:'ebd_legacy_history',count:47},{table:'ebd_attendance',count:12}],service_count:4,conflicts:[{key:'contact-choice',table:'person_contacts',source:{email:'antigo@example.invalid',phone:'11999999999',share_birthday:false},target:{email:'ana@example.invalid',phone:'11988888888',share_birthday:false},resolvable:true}]};
   else if(name==='sync_operation'){
    if(receipts.has(args.operation_id))data=receipts.get(args.operation_id);
    else{
     const cmd=args.command;assert.equal(cmd.target,'review_identity');calls.push(cmd.body);
     const input=cmd.body;const original=input.source_person===source.id?source:other;
     if(input.review_decision==='merged'){merged=true;assert.equal(input.expected_fingerprint,'verified-fingerprint');assert.equal(input.choices.profile,'target');assert.equal(input.choices['contact-choice'],'target');}else distinct=true;
     data=crypto.randomUUID();receipts.set(args.operation_id,data);history.unshift({id:data,decision:input.review_decision,reason:input.review_reason,created_at:new Date().toISOString(),source:original,target,choices:input.choices,conflicts:[]});
    }
   }
  }else if(name==='persons')data=[{id:pid,auth_user_id:uid,full_name:'Administrador de teste',onboarded_at:new Date().toISOString(),membership_status:'member'}];
  if(req.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/gestao?tab=people');
 await page.getByText('Vincular contas e revisar duplicados',{exact:true}).click();
 const panel=page.locator('.identity-review');await panel.getByRole('heading',{name:'Vinculação de contas e revisão de duplicados'}).waitFor();
 await panel.getByLabel('Selecionar cadastro',{exact:true}).nth(0).waitFor({timeout:10000}).catch(async error=>{ console.error(await panel.innerText()); throw error; });
 await panel.getByLabel('Selecionar cadastro',{exact:true}).nth(0).selectOption(source.id);
 await panel.getByLabel('Selecionar cadastro',{exact:true}).nth(1).selectOption(target.id);
 await panel.getByRole('button',{name:'Conferir impacto da vinculação'}).click();
 await panel.getByRole('heading',{name:/Prévia:/}).waitFor();
 await expect(panel.getByRole('button',{name:'Confirmar vinculação'})).toBeDisabled();
 await panel.getByLabel('Nome que deverá aparecer na conta').selectOption('target');
 await panel.getByLabel(/Qual registro manter em uso/).selectOption('target');
 await panel.getByLabel(/Como a identidade foi conferida/).fill('Confirmado pessoalmente com a titular e conferido o histórico.');
 await panel.getByRole('checkbox',{name:/Conferi os dados/}).check();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Revisão não transborda em celular');
 mkdirSync('test-results/identity',{recursive:true});await page.screenshot({path:'test-results/identity/preview-mobile.png',fullPage:true});
 await panel.getByRole('button',{name:'Confirmar vinculação'}).click();
 await panel.getByText('Vinculação concluída. O histórico está disponível na conta selecionada.',{exact:true}).waitFor();
 assert.equal(calls.length,1);assert.equal(calls[0].source_person,source.id);assert.equal(calls[0].target_person,target.id);
 await panel.getByText('Possíveis duplicados',{exact:true}).click();
 await panel.getByRole('button',{name:'Revisar este par'}).click();
 await panel.getByLabel(/Como a identidade foi conferida/).fill('A gestão confirmou que são pessoas diferentes da comunidade.');
 await panel.getByRole('checkbox',{name:/Conferi os dados/}).check();
 await context.setOffline(true);
 await panel.getByRole('button',{name:'São pessoas distintas'}).click();
 await panel.getByText('Guardado neste dispositivo. Será enviado quando a conexão voltar.',{exact:true}).waitFor();
 assert.equal(calls.length,1,'Revisão offline fica guardada sem aplicar no servidor');
 await context.setOffline(false);
 await expect.poll(()=>calls.length,{timeout:30000}).toBe(2);
 await page.getByRole('button',{name:'Sincronização: Tudo sincronizado',exact:true}).waitFor({timeout:30000});
 assert.equal(calls[1].review_decision,'distinct');assert.equal(calls[1].source_person,other.id);
 await panel.getByText('Histórico das revisões',{exact:true}).click();
 await panel.getByText(/Pessoas distintas: Ana Antiga/).waitFor();
 await page.setViewportSize({width:1366,height:900});
 await page.screenshot({path:'test-results/identity/reviews-desktop.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('OK: revisão com comparação, escolhas obrigatórias, confirmação, histórico e distinção de homônimos offline; sem alterações reais.');
 await context.close();
}finally{await browser.close();}
