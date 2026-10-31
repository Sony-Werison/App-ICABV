// Actual imported song payload with isolated auth/transport: no writes to real data.
import {chromium} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const folder=process.env.ICABV_CHORD_IMPORT_DIR||'work/cifras-lote';
const songs=JSON.parse(readFileSync(`${folder}/songs-after.json`,'utf8'));
const expectedChords=songs.filter(s=>s.pdf_links.length||s.chord_versions?.some(v=>v.chords)).length;
const host=readFileSync('.env.local','utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim().replace(/^['"]|['"]$/g,'');
const ref=new URL(host).hostname.split('.')[0],base=process.env.ICABV_TEST_URL||'http://localhost:5173';
const uid='61000000-0000-4000-8000-000000000091',pid='71000000-0000-4000-8000-000000000091';
const user={id:uid,email:'import-test@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{}};
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
const session={access_token:token,refresh_token:'test-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
 await context.addInitScript(({key,session})=>{localStorage.setItem(key,JSON.stringify(session));localStorage.setItem('icabv-theme','dark');},{key:`sb-${ref}-auth-token`,session});
 await context.route(host+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').at(-1);let data=[];
  if(url.pathname.startsWith('/auth/'))data=user;
  else if(name==='persons')data=[{id:pid,auth_user_id:uid,full_name:'Conferência da importação',onboarded_at:new Date().toISOString()}];
  else if(name==='my_roles')data=['admin'];
  else if(name==='module_capabilities')data={louvor_manager:true};
  else if(name==='worship_songs'){
   const start=Number(url.searchParams.get('offset')??req.headers().range?.split('-')[0]??0),limit=Number(url.searchParams.get('limit')??500);
   data=songs.slice(start,start+limit);
  }else if(name==='sync_operation')throw Error('No writes allowed in imported repertoire review.');
  if(req.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]??null;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/app?tab=louvor');await page.getByRole('heading',{name:'Louvor',exact:true}).waitFor();
 const bottom=page.getByRole('navigation',{name:'Navegação do aplicativo',exact:true});
 assert.equal(await bottom.getByRole('button').count(),6);
 assert.equal(await bottom.getByRole('button',{name:'Louvor',exact:true}).getAttribute('aria-current'),'page');
 assert.equal(await bottom.getByRole('button',{name:'Louvor',exact:true}).evaluate(el=>getComputedStyle(el,'::after').content),'none');
 await page.locator('.worship-results').filter({hasText:'859 músicas'}).waitFor();
 const category=page.getByRole('group',{name:'Categoria do repertório',exact:true}),quick=page.getByRole('group',{name:'Filtrar repertório',exact:true});
 for(const [value,label] of [['Todas','Todas'],['Louvor','Louvores'],['Hino','Hinos'],['Infantil','Infantis']])assert.match(await category.getByRole('button',{name:label,exact:true}).innerText(),new RegExp(String(songs.filter(s=>!s.archived&&(value==='Todas'||s.category===value)).length)));
 await quick.getByRole('button',{name:'Com Cifras',exact:true}).click();await page.locator('.worship-results').filter({hasText:`${expectedChords} músicas`}).waitFor();
 await category.getByRole('button',{name:'Hinos',exact:true}).click();assert.ok(await page.locator('.worship-song-row').count()>0);
 await category.getByRole('button',{name:'Louvores',exact:true}).click();assert.ok(await page.locator('.worship-song-row').count()>0);
 await category.getByRole('button',{name:'Todas',exact:true}).click();
 mkdirSync('test-results/worship',{recursive:true});await page.screenshot({path:'test-results/worship/imported-filters-mobile.png',fullPage:false});
 await page.getByLabel('Buscar músicas',{exact:true}).fill('Bondade de Deus');await page.getByRole('button',{name:'Letra e cifra: Bondade de Deus',exact:true}).click();
 const reader=page.getByRole('dialog',{name:'Letra e cifra',exact:true}),song=songs.find(s=>s.title==='Bondade de Deus');
 assert.equal(await reader.locator('.worship-version-select').count(),0);
 for(const version of song.chord_versions){await reader.getByRole('button',{name:`Cifra (${version.name})`,exact:true}).click();assert.equal(await reader.locator('.song-sheet pre').innerText(),version.chords||version.lyrics);}
 await reader.screenshot({path:'test-results/worship/imported-versions-mobile.png'});await page.keyboard.press('Escape');
 for(const width of [320,575,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const panel=await page.locator('.worship-filter-panel').boundingBox();for(const selector of ['.worship-category-filters','.worship-quick-filters'])assert.equal((await page.locator(selector).boundingBox()).width,panel.width);assert.equal(await bottom.evaluate(el=>el.scrollWidth>el.clientWidth),false);}
 await bottom.getByRole('button',{name:'Início',exact:true}).click();assert.equal(await bottom.getByRole('button',{name:'Início',exact:true}).getAttribute('aria-current'),'page');assert.equal(await bottom.getByRole('button',{name:'Início',exact:true}).evaluate(el=>getComputedStyle(el,'::after').content),'none');await bottom.getByRole('button',{name:'Louvor',exact:true}).click();await page.getByRole('heading',{name:'Louvor',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({songs:songs.length,with_chords:expectedChords,version_selection:true,full_width_filters:true,errors:errors.length}));
 await context.close();
}finally{await browser.close();}
