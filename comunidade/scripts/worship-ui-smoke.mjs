// All Supabase responses and writes are isolated fixtures; no real records change.
import {chromium,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const host=readFileSync(new URL('../.env.local',import.meta.url),'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim().replace(/^['"]|['"]$/g,'');
const base=process.env.ICABV_TEST_URL||'http://localhost:5173',ref=new URL(host).hostname.split('.')[0];
const uid='61000000-0000-4000-8000-000000000091',pid='71000000-0000-4000-8000-000000000091',other='71000000-0000-4000-8000-000000000092';
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
const user={id:uid,email:'worship@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const session={access_token:token,refresh_token:'test-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);
const songs=Array.from({length:30},(_,i)=>({id:`70000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,title:`Canção ${String(i+1).padStart(2,'0')}`,artist:'Equipe de teste',musical_key:'C',category:i===2?'Hino':'Louvor',is_new:i===0,youtube_url:'https://www.youtube.com/watch?v=test',lyrics:i===1?'O cuidado do Senhor permanece':'Letra para cantar em comunidade',chords:i===1?'':'C  G/B  Am\nCantar em comunidade',bpm:80,pdf_links:[],archived:false}));
let services=[{id:'s1',title:'Culto da manhã',starts_at:`${month}-04T12:00:00Z`,period:'manhã',assignments:{Abertura:[pid],Vocal:[other]},playlist:[songs[0].id],status:'planned',featured:false},{id:'s2',title:'Culto de outra abertura',starts_at:`${month}-11T22:00:00Z`,period:'noite',assignments:{Abertura:[other]},playlist:[songs[1].id],status:'planned',featured:false},{id:'s0',title:'Culto concluído',starts_at:`${month}-01T12:00:00Z`,period:'manhã',assignments:{Abertura:[pid]},playlist:[songs[0].id],status:'completed',featured:false}];
const members=[{person_id:pid,full_name:'Pessoa Teste',roles:['Abertura','Vocal'],active:true},{person_id:other,full_name:'Outra Pessoa',roles:['Abertura','Vocal'],active:true}];
const rehearsals=[{id:'rehearsal1',person_id:pid,title:'Ensaio pessoal',playlist:[songs[0].id]}];
const writes=[],errors=[];let manager=true,failNextWrite=false;
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(({key,session})=>{localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('icabv-theme','dark');},{key:`sb-${ref}-auth-token`,session});
 await context.route(host+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').at(-1),body=req.postDataJSON();let data=[];
  if(url.pathname.startsWith('/auth/'))data=user;
  else if(name==='persons')data=[{id:pid,auth_user_id:uid,full_name:'Pessoa Teste',onboarded_at:new Date().toISOString()}];
  else if(name==='my_roles')data=manager?['admin']:['member'];
  else if(name==='module_capabilities')data={louvor_manager:manager};
  else if(name==='worship_songs')data=songs;
  else if(name==='worship_services')data=services;
  else if(name==='worship_directory')data=members;
  else if(name==='worship_rehearsals')data=rehearsals;
  else if(name==='worship_live')data={service_id:'s1',song_id:songs[0].id,transpose:0,scrolling:false,scroll_speed:30,bpm:80};
  else if(name==='module_people')data=members.map(m=>({id:m.person_id,full_name:m.full_name}));
  else if(name==='sync_operation'){
   if(failNextWrite){failNextWrite=false;await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'forbidden'})});return;}
   assert.equal(manager,true,'Nenhuma alteração administrativa no perfil de membro');
   writes.push(body.command);
   if(body.command.target==='worship_services'){const row=body.command.body;services=services.map(s=>s.id===row.id?{...s,...row}:s);data=[services.find(s=>s.id===row.id)];}
   if(body.command.target==='worship_songs'){const row=body.command.body;const i=songs.findIndex(s=>s.id===row.id);assert.ok(i>=0);Object.assign(songs[i],row);data=[songs[i]];}
  }
  if(req.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));mkdirSync('test-results/worship',{recursive:true});
 await page.goto(base+'/app?tab=louvor');
 const nav=page.getByRole('navigation',{name:'Áreas do Louvor'});await nav.waitFor();
 assert.equal(await nav.locator('details').count(),0);assert.equal(await nav.getByRole('button').count(),8);
 const tab=async name=>{const button=nav.getByRole('button',{name,exact:true});if(!await button.isVisible())await nav.locator('summary').click();await button.click();};
 const fit=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Sem transbordamento da página');
 await page.getByRole('heading',{name:'Canção 01',exact:true}).waitFor();
 await page.getByLabel('Buscar músicas',{exact:true}).fill('cuidado do senhor');
 await page.getByRole('heading',{name:'Canção 02',exact:true}).waitFor();
 assert.equal(await page.locator('.worship-song-row').count(),1,'Busca inclui trecho da letra');
 await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
 const categories=page.getByRole('group',{name:'Categoria do repertório',exact:true});
 const quick=page.getByRole('group',{name:'Filtrar repertório',exact:true});
 assert.equal(await page.getByText('Filtros',{exact:true}).count(),0);
 assert.equal(await page.getByLabel('Ordenar músicas',{exact:true}).count(),0);
 await quick.getByRole('button',{name:'Novas',exact:true}).click();assert.equal(await page.locator('.worship-song-row').count(),1);
 await quick.getByRole('button',{name:'Com Cifras',exact:true}).click();assert.equal(await page.getByRole('heading',{name:'Canção 02',exact:true}).count(),0);
 await quick.getByRole('button',{name:'Todas',exact:true}).click();
 await categories.getByRole('button',{name:'Hinos',exact:true}).click();assert.equal(await page.locator('.worship-song-row').count(),1);
 await quick.getByRole('button',{name:'Novas',exact:true}).click();assert.equal(await page.locator('.worship-song-row').count(),0,'Categoria e situação combinam');
 await categories.getByRole('button',{name:'Louvores',exact:true}).click();assert.equal(await page.locator('.worship-song-row').count(),1);
 await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();
 await page.getByLabel('Opções de Canção 01',{exact:true}).click();await page.getByRole('button',{name:'Editar música',exact:true}).first().click();await page.getByRole('dialog',{name:'Editar música',exact:true}).waitFor();assert.equal(await page.getByLabel('BPM',{exact:true}).count(),0);assert.equal(await page.getByLabel('Vídeo no YouTube',{exact:true}).count(),0);await page.keyboard.press('Escape');await page.getByLabel('Opções de Canção 01',{exact:true}).click();
 const opener=page.getByRole('button',{name:'Letra e cifra: Canção 01',exact:true});await opener.click();
 const reader=page.getByRole('dialog',{name:'Letra e cifra',exact:true});await reader.waitFor();
 assert.ok(await reader.locator('.worship-key').evaluate(el=>el.getBoundingClientRect().width<60),'Tom compacto no cabeçalho');
 await reader.getByRole('button',{name:'Tom +',exact:true}).click();await reader.getByRole('button',{name:'Tom +',exact:true}).click();
 assert.match(await reader.locator('.song-sheet pre').innerText(),/D  A\/C#  Bm/);
 await reader.getByRole('button',{name:'Letra',exact:true}).click();assert.equal(await reader.getByRole('button',{name:'Tom +',exact:true}).count(),0);assert.equal(await reader.getByRole('button',{name:'Rolar cifra',exact:true}).count(),0);assert.match(await reader.locator('.song-sheet pre').innerText(),/Letra para cantar/);
 await reader.getByRole('button',{name:'Cifra',exact:true}).click();
 await reader.getByRole('button',{name:'Fonte +',exact:true}).click();assert.equal(await reader.locator('.song-sheet').evaluate(el=>getComputedStyle(el).fontSize),'20px');
 await reader.getByRole('button',{name:'Rolar cifra',exact:true}).click();await reader.getByText('Velocidade de rolagem · 30',{exact:true}).waitFor();await reader.getByRole('button',{name:'Parar rolagem',exact:true}).click();
 assert.equal(await reader.getByRole('button',{name:'Imprimir',exact:true}).count(),0);
 assert.equal(await reader.getByRole('link',{name:'Ouvir no YouTube',exact:true}).count(),0);assert.equal(await reader.getByLabel('Metrônomo (BPM)',{exact:true}).count(),0);
 const bounds=await reader.boundingBox();assert.equal(bounds.x,0);assert.equal(bounds.y,0);assert.equal(bounds.width,390);assert.equal(bounds.height,844);
 assert.equal(await reader.getByRole('button',{name:'Imprimir',exact:true}).count(),0);
 await reader.screenshot({path:'test-results/worship/reader.png'});
 assert.ok((await reader.locator('.song-sheet').boundingBox()).height>400,'Leitura ocupa o espaço livre: '+JSON.stringify(await reader.locator('.song-sheet').boundingBox()));
 await reader.screenshot({path:'test-results/worship/reader.png'});await page.keyboard.press('Escape');await reader.waitFor({state:'hidden'});await expect(opener).toBeFocused();
 await tab('Escalas');await page.locator('.schedule-board').getByRole('button',{name:/Pessoa Teste.*Abertura/}).last().click();
 await page.getByRole('button',{name:'Editar escala',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Editar escala',exact:true});await editor.waitFor();
 const picker=editor.locator('.worship-role-picker').filter({has:page.locator('summary').filter({hasText:/^Abertura/})});await picker.locator('summary').click();
 await picker.getByRole('checkbox',{name:'Outra Pessoa',exact:true}).check();
 await editor.getByLabel('Buscar música para o repertório',{exact:true}).fill('cancao 02');await editor.getByLabel('Adicionar música',{exact:true}).selectOption(songs[1].id);await editor.getByRole('button',{name:'Adicionar ao repertório',exact:true}).click();
 await editor.getByRole('button',{name:'Subir música 2',exact:true}).click();
 await editor.getByRole('button',{name:'Salvar',exact:true}).click();await editor.waitFor({state:'hidden'});
 assert.deepEqual(writes[0].body.playlist,[songs[1].id,songs[0].id]);assert.deepEqual(writes[0].body.assignments.Abertura,[pid,other]);
 for(const width of [320,390,575,1440]){
  await page.setViewportSize({width,height:900});
  await tab('Biblioteca');
  const panel=page.locator('.worship-filter-panel');const panelBox=await panel.boundingBox();
  for(const selector of ['.worship-category-filters','.worship-quick-filters']){const filterBox=await panel.locator(selector).boundingBox();assert.equal(filterBox.width,panelBox.width,'Filtros usam toda a largura');}
  await opener.click();const box=await reader.boundingBox();assert.equal(box.width,width);assert.equal(box.height,900);await page.keyboard.press('Escape');
  for(const name of ['Biblioteca','Escalas','Calendário mensal','Ensaios','Sala ao vivo','Histórico','Equipe','Configurações']){await tab(name);await fit();}
  await tab('Biblioteca');await page.getByRole('heading',{name:'Canção 01',exact:true}).waitFor();assert.ok(await page.locator('.worship-song-row').first().evaluate(el=>el.getBoundingClientRect().top<650),'Músicas visíveis sem excesso de filtros no topo');
 }
 await page.setViewportSize({width:390,height:844});await tab('Ensaios');await page.getByText('Ensaio pessoal',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Editar ensaio',exact:true}).click();await page.getByLabel('Nome do ensaio',{exact:true}).waitFor();
 await tab('Histórico');await page.getByLabel('Buscar no histórico',{exact:true}).fill('cancao 01');assert.equal(await page.locator('.module-report-row').count(),1);
 await tab('Equipe');await page.getByLabel('Buscar na equipe',{exact:true}).fill('outra');assert.equal(await page.locator('.worship-team-row').count(),1);
 await tab('Sala ao vivo');await page.getByLabel('Culto',{exact:true}).selectOption('s1');await page.getByText('Você conduz esta sala.',{exact:false}).waitFor();
 await tab('Biblioteca');await page.screenshot({path:'test-results/worship/library.png',fullPage:false});
 const variants=[{id:'a0000000-0000-4000-8000-000000000001',name:'v.1',musical_key:'C',chords:'[C]Primeira [G/B]',lyrics:'Primeira letra',source_files:['primeira.docx']},{id:'a0000000-0000-4000-8000-000000000002',name:'Violão',musical_key:'G',chords:'[G]Segunda [D/F#]',lyrics:'Segunda letra',source_files:['segunda.docx']}];
 Object.assign(songs[0],{title:'Ajuntamento',chord_versions:variants});await page.reload();await page.getByRole('button',{name:'Letra e cifra: Ajuntamento',exact:true}).click();
 await reader.getByRole('button',{name:'Cifra (Violão)',exact:true}).click();assert.equal(await reader.locator('.song-sheet pre').innerText(),variants[1].chords);
 await reader.getByRole('button',{name:'Tom +',exact:true}).click();assert.match(await reader.locator('.song-sheet pre').innerText(),/\[G#\].*\[D#\/G\]/);
 await reader.getByRole('button',{name:'Cifra (v.1)',exact:true}).click();assert.equal(await reader.locator('.song-sheet pre').innerText(),variants[0].chords,'Troca de versão restaura transposição');
 await page.keyboard.press('Escape');manager=true;await page.reload();await page.getByLabel('Opções de Ajuntamento',{exact:true}).click();await page.getByRole('button',{name:'Editar música',exact:true}).click();
 const songEditor=page.getByRole('dialog',{name:'Editar música',exact:true});await songEditor.getByText('Versões da cifra',{exact:true}).click();await songEditor.getByLabel('Nome da versão 2',{exact:true}).fill('Violão acústico');await songEditor.getByRole('button',{name:'Salvar',exact:true}).click();await songEditor.waitFor({state:'hidden'});
 assert.equal(writes[1].body.id,songs[0].id);assert.equal(writes[1].body.chord_versions[1].name,'Violão acústico');assert.equal(writes[1].body.chord_versions[1].id,variants[1].id);assert.deepEqual(writes[1].body.chord_versions[1].source_files,['segunda.docx']);
 await page.getByRole('button',{name:'Letra e cifra: Ajuntamento',exact:true}).click();await reader.getByRole('button',{name:'Cifra (Violão acústico)',exact:true}).click();assert.equal(await reader.locator('.song-sheet pre').innerText(),variants[1].chords);await page.keyboard.press('Escape');
 Object.assign(songs[0],{title:'Canção 01',chord_versions:[]});
 failNextWrite=true;await page.getByRole('button',{name:'Nova música',exact:true}).click();const formDialog=page.getByRole('dialog',{name:'Cadastrar música',exact:true});await formDialog.getByLabel('Título',{exact:true}).fill('Teste de erro');await formDialog.getByLabel('Categoria',{exact:true}).selectOption('Louvor');await formDialog.getByRole('button',{name:'Salvar',exact:true}).click();await formDialog.getByRole('alert').filter({hasText:'Seu perfil não permite esta alteração.'}).waitFor();await page.keyboard.press('Escape');
 manager=false;await page.reload();await page.getByRole('heading',{name:'Canção 01',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Nova música',exact:true}).count(),0);assert.equal(await page.locator('.worship-song-options').count(),0);
 await tab('Sala ao vivo');await page.getByLabel('Culto',{exact:true}).selectOption('s2');await page.getByText('Você está acompanhando.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Subir tom da sala',exact:true}).count(),0);
 const converted=JSON.parse(readFileSync(new URL('../docs/cifras/ajuntamento.json',import.meta.url),'utf8'));
 Object.assign(songs[0],converted);await page.reload();
 await page.getByRole('button',{name:'Letra e cifra: Ajuntamento',exact:true}).click();
 await reader.waitFor();assert.equal(await reader.locator('.song-sheet pre').innerText(),converted.chords);
 await reader.getByRole('button',{name:'Tom +',exact:true}).click();assert.match(await reader.locator('.song-sheet pre').innerText(),/\[F7\/A\]/);
 await reader.getByRole('button',{name:'Letra',exact:true}).click();assert.equal(await reader.locator('.song-sheet pre').innerText(),converted.lyrics);
 await reader.getByRole('button',{name:'Cifra',exact:true}).click();await reader.getByRole('button',{name:'Tom original',exact:true}).click();
 await reader.screenshot({path:'test-results/worship/ajuntamento-mobile.png'});
 await page.setViewportSize({width:1440,height:900});await reader.screenshot({path:'test-results/worship/ajuntamento-desktop.png'});
 await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);assert.equal(writes.length,2);console.log('OK: filtros combinados em largura total, sem ordenação; oito áreas; leitura em tela cheia, transposição/baixo, fonte, rolagem, sem impressão, Escape/foco; versões selecionáveis e renomeadas no mesmo ID; permissões e 320/390/575/1440 px; gravações isoladas.');
 await context.close();
}finally{await browser.close();}
