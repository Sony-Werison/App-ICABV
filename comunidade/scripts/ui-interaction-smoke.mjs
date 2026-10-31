// Presentation regression: intercepted Supabase, no real data writes.
import { chromium, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const host=readFileSync(new URL('../.env.local',import.meta.url),'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim().replace(/^['"]|['"]$/g,'');
const base=process.env.ICABV_TEST_URL||'http://localhost:5173',ref=new URL(host).hostname.split('.')[0];
const uid='61000000-0000-4000-8000-000000000091',pid='71000000-0000-4000-8000-000000000091';
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
const user={id:uid,email:'design-test@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const session={access_token:token,refresh_token:'test-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
let songs=Array.from({length:29},(_,i)=>({id:`70000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,title:`Canção ${String(i+1).padStart(2,'0')}`,artist:'Equipe de teste',musical_key:'C',category:'Louvor',is_new:false,youtube_url:'',lyrics:'Letra de teste',chords:'C G Am F',bpm:80,pdf_links:[],archived:false}));
const writes=[];
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(({key,session})=>{localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('icabv-theme','dark');},{key:`sb-${ref}-auth-token`,session});
 await context.route(host+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').at(-1),body=req.postDataJSON();let data=[];
  if(url.pathname.startsWith('/auth/'))data=user;
  else if(name==='my_roles')data=['admin'];
  else if(name==='module_capabilities')data={louvor_manager:true,ebd_manager:true,ebd_teacher:true,ebd_observer:true};
  else if(name==='notification_feed')data={items:[],unread_count:0,total_count:0};
  else if(name==='worship_songs')data=songs;
  else if(name==='persons')data=[{id:pid,auth_user_id:uid,full_name:'Pessoa de teste',onboarded_at:new Date().toISOString()}];
  else if(name==='identity_directory')data={items:[]};
  else if(name==='sync_operation'){
   writes.push(body.command);const row=body.command.body;
   if(body.command.target==='worship_songs'){const saved={...row,id:row.id||crypto.randomUUID()};songs=[...songs,saved];data=[saved];}
   else data=null;
  }
  if(req.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/app?tab=louvor');
 await page.getByRole('heading',{name:'Canção 01',exact:true}).waitFor();
 const library=page.locator('.module-list');
 assert.equal(await library.locator('article').count(),12);
 await library.getByRole('button',{name:'Próxima',exact:true}).click();
 await page.getByRole('heading',{name:'Canção 13',exact:true}).waitFor();
 await page.getByLabel('Buscar músicas',{exact:true}).fill('cancao 29');
 await page.getByRole('heading',{name:'Canção 29',exact:true}).waitFor();assert.equal(await library.locator('article').count(),1,'Busca sem acento encontra o nome acentuado');
 await page.getByLabel('Buscar músicas',{exact:true}).fill('não existe');
 await library.getByText('Nenhum resultado. Tente outra busca ou ajuste os filtros.',{exact:true}).waitFor();
 await page.getByLabel('Buscar músicas',{exact:true}).fill('');
 await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
 assert.equal(await library.locator('article').count(),29,'Impressão preserva a lista completa');
 await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
 await expect(library.locator('article')).toHaveCount(12);
 const nav=page.getByRole('navigation',{name:'Áreas do Louvor'});
 await nav.locator('summary').focus();await page.keyboard.press('Enter');
 await nav.getByRole('button',{name:'Configurações',exact:true}).waitFor();
 await nav.getByRole('button',{name:'Configurações',exact:true}).click();
 await page.getByText('Editar várias músicas',{exact:true}).waitFor();
 await nav.getByRole('button',{name:'Biblioteca',exact:true}).click();
 await page.getByRole('button',{name:'Nova música',exact:true}).click();
 const editor=page.locator('.module-editor').filter({has:page.getByRole('heading',{name:'Cadastrar música',exact:true})});
 await editor.getByRole('button',{name:'Salvar',exact:true}).click();
 await editor.getByText('Preencha este campo.',{exact:true}).first().waitFor();assert.equal(writes.length,0,'Validação bloqueia o envio incompleto');
 await editor.getByLabel('Título',{exact:true}).fill('Música criada no teste');
 await editor.getByLabel('Categoria',{exact:true}).selectOption('Louvor');
 await editor.getByText('Conteúdo e opções adicionais',{exact:true}).click();
 const youtube=editor.getByLabel('YouTube (HTTPS)',{exact:true});
 // The visible label is intentionally used so optional fields remain discoverable.
 const optionalUrl=await youtube.count()?youtube:editor.locator('input[name="youtube_url"]');
 await optionalUrl.fill('https://www.youtube.com/watch?v=test-only');
 await editor.locator('details > summary').click();
 await editor.getByRole('button',{name:'Salvar',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(1);
 assert.equal(writes[0].body.youtube_url,'https://www.youtube.com/watch?v=test-only','Fechar o painel preserva e envia o campo opcional');
 assert.equal(writes[0].body.title,'Música criada no teste');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 mkdirSync('test-results/ui-interaction',{recursive:true});
 await page.screenshot({path:'test-results/ui-interaction/louvor-mobile.png',fullPage:false});
 assert.deepEqual(errors,[]);
 console.log('OK: paginação, busca sem acento, estado vazio, impressão completa, teclado, validação inline e preservação dos campos recolhidos.');
 await context.close();
}finally{await browser.close();}
