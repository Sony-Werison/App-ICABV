// Isolated home/weekend and schedule-tab checks. Never writes to real records.
import {chromium} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const host=readFileSync('.env.local','utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim().replace(/^['"]|['"]$/g,'');
const ref=new URL(host).hostname.split('.')[0],base=process.env.ICABV_TEST_URL||'http://localhost:5173';
const uid='61000000-0000-4000-8000-000000000041',pid='71000000-0000-4000-8000-000000000041',other='71000000-0000-4000-8000-000000000042';
const user={id:uid,email:'weekend@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{}};
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp:1900000000})).toString('base64url')+'.signature';
const session={access_token:token,refresh_token:'test-only',expires_in:3600,expires_at:1900000000,token_type:'bearer',user};
const members=[{person_id:pid,full_name:'Dirigente Teste',roles:['Abertura','Pregação'],active:true},{person_id:other,full_name:'Pregador Teste',roles:['Abertura','Pregação'],active:true}];
const service=(id,date,assignments,playlist=[])=>({id,title:'Reunião '+id,starts_at:date,period:'noite',status:'planned',assignments,playlist,featured:false});
const services=[service('sábado','2026-10-24T22:00:00Z',{Abertura:[pid],Pregação:[other],Multimídia:[pid,other]},['s2','missing','s1','empty']),{...service('domingo','2026-10-25T12:00:00Z',{Abertura:[other],Pregação:[pid]}),period:'manhã'},{...service('cancelada','2026-10-24T12:00:00Z',{Abertura:[other]}),status:'canceled'},service('semana','2026-10-26T22:00:00Z',{Abertura:[other]})];
const song=(id,title,lyrics,pdf_links=[])=>({id,title,lyrics,chords:'[C]'+lyrics,musical_key:'C',chord_versions:[],artist:'Equipe',category:'Louvor',is_new:false,pdf_links,archived:false,bpm:80,youtube_url:''});
const songs=[song('s1','Primeira música','Primeira letra de teste',[{name:'Arquivo de teste',url:'https://example.invalid/cifra.pdf'}]),song('s2','Segunda música','Segunda letra de teste'),{...song('empty','Sem letra',''),chords:''}];
const shifts=[{id:'assignment',title:'Limpeza do salão',unit_title:'Limpeza',starts_at:'2026-10-24T11:00:00Z',ends_at:'2026-10-24T12:00:00Z',status:'pending',canceled:false,attended:false}];
const record={id:'record',data:{memberId:pid,date:'2026-10-25',time:'07:00',ministry:'Café',duty:'Preparar café',status:'Confirmado'}};
let emptyWeekend=false,emptyHome=false;const errors=[],requests=[];
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:575,height:1404}});
 await context.addInitScript(({key,session})=>{localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('icabv-theme','dark');},{key:`sb-${ref}-auth-token`,session});
 await context.route(host+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').at(-1);let data=[];requests.push(name);
  assert.notEqual(name,'sync_operation','Visualização não grava dados');
  if(url.pathname.startsWith('/auth/'))data=user;
  else if(name==='persons')data=[{id:pid,auth_user_id:uid,full_name:'Dirigente Teste',onboarded_at:new Date().toISOString()}];
  else if(name==='my_roles')data=['admin'];
  else if(name==='anniversary_calendar')data=!emptyHome&&Number(JSON.parse(req.postData()||'{}').page_number||0)===0?[{person_id:'birthday-today',full_name:'Aniversário hoje teste',birth_month:10,birth_day:23},{person_id:'birthday-tomorrow',full_name:'Aniversário amanhã teste',birth_month:10,birth_day:24},{person_id:'wedding-today',full_name:'Casal hoje teste',birth_month:10,birth_day:23,anniversary_type:'wedding'},{person_id:'wedding-tomorrow',full_name:'Casal amanhã teste',birth_month:10,birth_day:24,anniversary_type:'wedding'}]:[];
  else if(name==='announcements')data=emptyHome?[]:[{id:'news',title:'Comunicado atual',body:'Aviso de teste',published:true,expires_at:null}];
  else if(name==='browse_events')data=emptyHome?[]:[{id:'next-event',title:'Próximo evento de teste',starts_at:'2026-10-27T22:00:00Z',ends_at:'2026-10-27T23:00:00Z',status:'published',location:'Igreja'}];
  else if(name==='module_capabilities')data={louvor_manager:true};
  else if(name==='worship_services')data=emptyWeekend?[]:services;
  else if(name==='worship_directory')data=members;
  else if(name==='duty_roster_people')data=[{person_id:pid,full_name:'Pessoa Completa Conferida'}];
  else if(name==='worship_songs')data=songs;
  else if(name==='duty_rosters')data=[{id:'rota',title:'Limpeza',source_name:'Limpeza teste.pdf',groups:[{id:'g1',label:'Grupo 1',members:[{id:'m1',name:'Pessoa conferida',role:'Limpeza',person_id:pid},{id:'m2',name:'Apelido preservado',role:'Limpeza',person_id:null}]}],dates:[{date:'2026-10-24',group_id:'g1'}]},{id:'snack',title:'Lanches e sucos EBD',source_name:'Lanches teste.pdf',groups:[{id:'g1',label:'Grupo 1',members:[{id:'m1',name:'Lanche teste',role:'Lanche',person_id:null},{id:'m2',name:'Suco teste',role:'Suco',person_id:null}]}],dates:[{date:'2026-07-05',group_id:'g1'},{date:'2026-08-09',group_id:null,note:'Café da manhã especial de Dia dos Pais. Responsáveis não informados na escala.'},{date:'2026-10-25',group_id:'g1'}]}];
  else if(name==='my_service_assignments')data=shifts;
  else if(name==='management_records'){assert.equal(url.searchParams.get('data->>memberId'),`eq.${pid}`);data=[record];}
  if(req.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-23T15:00:00Z'));
 await page.goto(base+'/app');const weekend=page.locator('.member-weekend');await weekend.getByRole('heading',{name:'Próximo fim de semana',exact:true}).waitFor();
 await weekend.getByRole('heading',{name:'Reunião da Noite',exact:true}).waitFor();await weekend.getByRole('heading',{name:'Escola Dominical',exact:true}).waitFor();
 assert.equal(await weekend.locator('article').count(),2);assert.equal(await weekend.locator('h3 svg').count(),2);assert.doesNotMatch(await weekend.locator('article > p').allInnerTexts().then(t=>t.join(' ')),/\d{2}:\d{2}/);
 await page.getByRole('heading',{name:'Aniversariantes de hoje',exact:true}).waitFor();await page.locator('.care-birthdays').getByText('Aniversário hoje teste',{exact:true}).waitFor();assert.equal(await page.locator('.care-birthdays').getByText('Aniversário amanhã teste',{exact:true}).count(),0);await page.locator('.care-birthdays article').filter({hasText:'Casal hoje teste'}).getByText('Casamento',{exact:true}).waitFor();assert.equal(await page.locator('.care-birthdays').getByText('Casal amanhã teste',{exact:true}).count(),0);
 assert.equal(await page.getByRole('heading',{name:'Acessos',exact:true}).count(),0);assert.equal(await page.locator('.member-birthdays').evaluate(el=>el.classList.contains('icabv-card')),false);assert.equal(await page.locator('.member-program').evaluate(el=>el.previousElementSibling?.classList.contains('member-announcements')),true);
 for(const width of [320,390,575,1440]){await page.setViewportSize({width,height:1404});const cards=await weekend.locator('article').all();const first=await cards[0].boundingBox(),second=await cards[1].boundingBox();assert.equal(first.y,second.y);assert.ok(second.x>=first.x+first.width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:575,height:1404});
 await page.getByRole('navigation',{name:'Navegação do aplicativo',exact:true}).getByRole('button',{name:'Menu',exact:true}).click();assert.equal(await page.locator('.member-menu details').count(),0);assert.equal(await page.locator('.member-menu-group').count(),3);assert.equal(await page.getByRole('button',{name:'Voltar ao início',exact:true}).count(),0);await page.locator('.member-menu').getByRole('button',{name:'Oração',exact:true}).waitFor();
 for(const label of ['Louvor','Painel EBD','Conteúdos','Ministérios','Células','Oração','Cestas básicas','Minhas escalas','Famílias']){await page.getByLabel('Buscar no menu',{exact:true}).fill(label);await page.locator('.member-menu').getByRole('button',{name:label,exact:true}).waitFor();}
 await page.getByRole('navigation',{name:'Navegação do aplicativo',exact:true}).getByRole('button',{name:'Início',exact:true}).click();await page.locator('.member-weekend article').first().waitFor();

 const saturday=weekend.locator('article').filter({has:page.getByRole('heading',{name:'Reunião da Noite',exact:true})});
 assert.match(await saturday.locator('dl').innerText(),/Abertura\s+Dirigente Teste\s+Pregação\s+Pregador Teste/);
 assert.equal(requests.includes('worship_songs'),false,'Letras carregam somente quando solicitadas');
 await saturday.getByRole('button',{name:'Ver letras do repertório',exact:true}).click();
 const reader=page.getByRole('dialog',{name:'Repertório · Reunião sábado',exact:true});await reader.waitFor();assert.equal(await reader.getByRole('button',{name:'Tom +',exact:true}).count(),0);assert.equal(await reader.getByRole('button',{name:'Rolar cifra',exact:true}).count(),0);assert.match(await reader.locator('.song-sheet pre').evaluate(el=>getComputedStyle(el).fontFamily),/Segoe UI/);assert.equal(await reader.locator('.reader-controls').evaluate(el=>getComputedStyle(el).justifyContent),'center');assert.notEqual(await reader.getByRole('button',{name:'Próxima música',exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 assert.equal(await reader.locator('.song-sheet pre').innerText(),'Segunda letra de teste');assert.equal(await reader.getByRole('link',{name:'PDF',exact:true}).count(),0);
 await reader.getByRole('button',{name:'Próxima música',exact:true}).click();assert.equal(await reader.locator('.song-sheet pre').innerText(),'Primeira letra de teste');assert.match(await reader.locator('.repertoire-navigation').innerText(),/2 de 2.*2 sem letra disponível/);
 assert.equal(await reader.getByRole('link',{name:'PDF',exact:true}).getAttribute('href'),'https://example.invalid/cifra.pdf');assert.equal(await reader.getByRole('button',{name:'Imprimir',exact:true}).count(),0);
 assert.equal(await reader.getByRole('button',{name:'Próxima música',exact:true}).isDisabled(),true);
 await reader.getByRole('button',{name:'Música anterior',exact:true}).click();assert.equal(await reader.locator('.song-sheet pre').innerText(),'Segunda letra de teste');
 mkdirSync('test-results/weekend',{recursive:true});await reader.screenshot({path:'test-results/weekend/repertoire.png'});await page.keyboard.press('Escape');await page.screenshot({path:'test-results/weekend/home.png',fullPage:true});
 await page.getByRole('navigation',{name:'Navegação do aplicativo',exact:true}).getByRole('button',{name:'Escalas',exact:true}).click();
 const tabs=page.getByRole('navigation',{name:'Tipos de escala',exact:true});await tabs.waitFor();assert.equal(await tabs.getByRole('button').last().innerText(),'Minhas participações');assert.equal(await tabs.getByRole('button',{name:'Cultos',exact:true}).getAttribute('aria-current'),'page');await tabs.getByRole('button',{name:'Minhas participações',exact:true}).click();
 const mine=page.locator('.schedule-board');await mine.getByText('Preparar café',{exact:true}).waitFor();assert.equal(await page.locator('.schedule-board').count(),1);assert.equal(await mine.getByText('Pregador Teste',{exact:true}).count(),0);
 await mine.getByRole('button',{name:/Você.*Limpeza do salão/}).click();await page.getByRole('button',{name:'Confirmar participação',exact:true}).waitFor();
 await tabs.getByRole('button',{name:'Cultos',exact:true}).click();await page.locator('.schedule-board').getByText('Pregador Teste',{exact:true}).first().waitFor();assert.ok(await page.locator('.schedule-table tbody tr').first().evaluate(el=>el.getBoundingClientRect().height>=70));
 const splitName=page.locator('.schedule-person strong').filter({hasText:'Pregador Teste'}).filter({has:page.locator('.schedule-name-line')}).first();
 assert.equal(await page.locator('.schedule-board .schedule-cell-button').count(),0,'Nomes da escala de cultos não são botões');
 await splitName.click();assert.equal(await page.getByRole('dialog').count(),0,'Tocar no nome não abre modal');
 assert.equal(await splitName.locator('.schedule-name-line').count(),2);
 assert.ok(await splitName.evaluate(el=>{const [first,last]=el.children;return last.getBoundingClientRect().top>=first.getBoundingClientRect().bottom-1;}),'Nome e sobrenome em linhas separadas');
 assert.equal(await page.locator('.schedule-table tbody td:last-child .schedule-name-line').count(),0,'Multimídia não recebe quebra forçada');
 for(const width of [320,390,575,1440]){
  await page.setViewportSize({width,height:1404});
  assert.ok(await tabs.evaluate(el=>{const nav=el.getBoundingClientRect(),rows=new Map();for(const button of el.querySelectorAll('button')){const rect=button.getBoundingClientRect();const list=rows.get(rect.top)||[];list.push(rect);rows.set(rect.top,list);}return [...rows.values()].every(row=>Math.abs((Math.min(...row.map(r=>r.left))+Math.max(...row.map(r=>r.right))-nav.left-nav.right)/2)<1);}),`Guias centralizadas em ${width}px`);
  for(const tab of ['Cultos','Lanches','Limpeza','Minhas participações']){
   await tabs.getByRole('button',{name:tab,exact:true}).click();
   await page.getByLabel('Mês da escala',{exact:true}).waitFor();
   assert.ok(await page.locator('.schedule-board-toolbar').evaluate(el=>{const board=el.getBoundingClientRect(),control=el.querySelector('.schedule-month-control').getBoundingClientRect();return Math.abs((board.left+board.right-control.left-control.right)/2)<1;}),`Mês centralizado em ${tab} a ${width}px`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(tab==='Lanches'||tab==='Limpeza')assert.ok(await page.locator('.schedule-group-with-members').first().evaluate(el=>el.querySelector('.schedule-person').getBoundingClientRect().right<=el.querySelector('.schedule-inline-participants').getBoundingClientRect().left),'Participantes à direita do grupo');
  }
 }
 await page.setViewportSize({width:575,height:1404});
 await tabs.getByRole('button',{name:'Limpeza',exact:true}).click();await page.locator('.schedule-table').getByText('Grupo 1',{exact:true}).waitFor();assert.equal(await page.locator('.schedule-table .schedule-person strong').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 223, 158)');assert.equal(await page.locator('.duty-roster > small').count(),0);
 await page.locator('.schedule-inline-participants').getByText('Pessoa Completa Conferida, Apelido preservado',{exact:true}).waitFor();
 assert.equal(await page.locator('.duty-roster .schedule-cell-button').count(),0);await page.locator('.duty-roster .schedule-group-with-members').first().click();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator('.duty-roster-groups').count(),0);assert.equal(await page.getByText(/Período do documento:/).count(),0);
 for(const width of [320,390,575]){await page.setViewportSize({width,height:1404});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}await page.setViewportSize({width:575,height:1404});
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert.match(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundImage),/linear-gradient/);assert.equal(await page.locator('.icabv-platform').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');await page.screenshot({path:`test-results/weekend/roster-${theme}.png`,fullPage:true});}
 await tabs.getByRole('button',{name:'Lanches',exact:true}).click();await page.locator('.schedule-table').getByText('Grupo 1',{exact:true}).waitFor();await page.getByLabel('Mês da escala',{exact:true}).fill('2026-03');await page.getByText(/Nenhuma data prevista neste mês/).waitFor();assert.equal(await page.locator('.duty-roster .schedule-table').count(),0);await page.getByLabel('Mês da escala',{exact:true}).fill('2026-07');await page.locator('.schedule-table').getByText('Grupo 1',{exact:true}).waitFor();assert.equal(await page.locator('.duty-roster-groups').count(),0);assert.equal(await page.getByText(/Período do documento:/).count(),0);assert.equal(await page.locator('.duty-roster .schedule-cell-button').count(),0);await page.locator('.duty-roster .schedule-group-with-members').first().click();assert.equal(await page.getByRole('dialog').count(),0);await page.locator('.schedule-inline-participants').getByText('Lanche teste',{exact:false}).waitFor();await page.locator('.schedule-inline-participants').getByText('Suco teste',{exact:false}).waitFor();await page.getByLabel('Mês da escala',{exact:true}).fill('2026-08');await page.locator('.schedule-table').getByText(/Café da manhã especial de Dia dos Pais/).waitFor();await page.getByLabel('Mês da escala',{exact:true}).fill('2026-10');
 assert.equal(await tabs.getByRole('button',{name:'Equipes',exact:true}).count(),0);
 await tabs.getByRole('button',{name:'Minhas participações',exact:true}).click();await page.screenshot({path:'test-results/weekend/my-participations.png',fullPage:true});
 await page.getByRole('navigation',{name:'Navegação do aplicativo',exact:true}).getByRole('button',{name:'Louvor',exact:true}).click();const worship=page.getByRole('navigation',{name:'Áreas do Louvor',exact:true});await worship.waitFor();assert.equal(await worship.locator('details').count(),0);assert.equal(await worship.getByRole('button').count(),8);
 assert.equal(await page.getByRole('button',{name:'Nova música',exact:true}).getAttribute('class'),'secondary');assert.equal(await page.locator('.worship-song-open .worship-key').count(),0);
 await page.getByRole('button',{name:'Letra e cifra: Primeira música',exact:true}).click();const single=page.getByRole('dialog',{name:'Letra e cifra',exact:true});await single.waitFor();assert.ok((await single.getByRole('button',{name:'Tom +',exact:true}).boundingBox()).height<44);assert.equal(await single.locator('details').count(),0);await page.keyboard.press('Escape');
 for(const width of [320,390,575,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 emptyWeekend=true;emptyHome=true;await page.goto(base+'/app');await page.getByText('As reuniões e os responsáveis deste fim de semana ainda não foram cadastrados.',{exact:true}).waitFor();
 assert.equal(await page.locator('.member-program').count(),0);assert.equal(await page.locator('.member-announcements').count(),0);assert.equal(await page.locator('.member-birthdays').count(),0);assert.equal(await page.getByText('Nenhum aniversário compartilhado hoje.',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('OK: fim de semana/nomes, repertório sequencial com ausências, PDF condicional, escalas em abas com participações próprias, lanches/limpeza por mês com grupos e nomes preservados, gradiente claro/escuro, ações existentes, controles discretos, abas unificadas e 320/390/575/1440 px; sem gravações.');await context.close();
}finally{await browser.close();}
