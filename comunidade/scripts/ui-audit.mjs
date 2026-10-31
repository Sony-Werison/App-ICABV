import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const ref = "ynkfmuseiancpnyloraf",
  email = "pereirawerison@gmail.com",
  url = `https://${ref}.supabase.co`;
const keys = JSON.parse(
  execFileSync(
    "C:/Users/perei/apps/App Igreja/node_modules/supabase/bin/supabase.exe",
    ["projects", "api-keys", "--project-ref", ref, "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
);
const secret =
  keys.find((k) => k.name === "service_role")?.api_key ||
  keys.find((k) => k.type === "secret")?.api_key;
const publicKey =
  keys.find((k) => k.type === "publishable")?.api_key ||
  keys.find((k) => k.name === "anon")?.api_key;
assert.ok(secret && publicKey);
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const service = createClient(url, secret, options),
  actor = createClient(url, publicKey, options);
const link = await service.auth.admin.generateLink({
  type: "magiclink",
  email,
});
assert.ok(!link.error, "Geração da sessão isolada");
assert.equal(link.data.user.email, email);
assert.ok(link.data.user.email_confirmed_at);
const verified = await actor.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: "magiclink",
});
assert.ok(
  !verified.error && verified.data.session,
  "Sessão temporária da conta verificada",
);
const roles = await actor.rpc("my_roles");
assert.ok(!roles.error && roles.data.includes("admin"));
const profile = await actor
  .from("persons")
  .select("id,onboarded_at,full_name")
  .eq("auth_user_id", verified.data.user.id)
  .single();
assert.ok(!profile.error);

const base=process.env.ICABV_TEST_URL||'http://localhost:5173';
const previewOnly=process.argv.includes('--preview-only');
const schedulesOnly=process.argv.includes('--schedules-only');
const agendaOnly=process.argv.includes('--agenda-only');
const worshipOnly=process.argv.includes('--worship-only');
const ebdOnly=process.argv.includes('--ebd-only');
const out=ebdOnly?'test-results/ebd-audit':worshipOnly?'test-results/worship-audit':agendaOnly?'test-results/agenda-audit':schedulesOnly?'test-results/schedule-audit':previewOnly?'test-results/ui-preview':'test-results/ui-audit';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={screens:[],pageErrors:[],apiErrors:[],blockedWrites:[]};
const mutationSource=(await import('node:fs/promises')).readFile;
const mutations=new Set([...((await mutationSource(new URL('../features/icabv/offline-rpcs.ts',import.meta.url),'utf8')).matchAll(/"([^"]+)":/g))].map(m=>m[1]));
try {
 const context=await browser.newContext();
 await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${ref}-auth-token`,session:verified.data.session});
 await context.route(url+'/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,name=path.split('/').at(-1);
  if(path.startsWith('/rest/v1/')&&['POST','PATCH','DELETE'].includes(req.method())&&(!path.includes('/rpc/')||mutations.has(name)||name==='sync_operation')){report.blockedWrites.push(path);await route.abort();}else await route.continue();
 });
 const page=await context.newPage();
 page.on('pageerror',e=>report.pageErrors.push(e.message));
 page.on('response',async r=>{if(r.url().startsWith(url+'/rest/')&&r.status()>=400){const data=await r.json().catch(()=>({}));report.apiErrors.push({path:new URL(r.url()).pathname,status:r.status(),message:data.message});}});
 const routes=[['inicio','/app'],['agenda','/app?tab=agenda'],['menu','/app?tab=menu'],['conteudos','/app?tab=content'],['grupos','/app?tab=community'],['ministerios','/app?tab=ministries'],['escalas','/app?tab=schedules'],['oracao','/app?tab=prayers'],['celulas','/app?tab=cells'],['familias','/app?tab=families'],['aniversarios','/app?tab=birthdays'],['cestas','/app?tab=food-drive'],['perfil','/app?tab=profile'],['louvor','/app?tab=louvor'],['ebd','/app?tab=ebd'],['gestao','/gestao'],['pessoas','/gestao?tab=people'],['publicacoes','/gestao?tab=core-manage'],['registros','/gestao?tab=records'],['financeiro-teste','/gestao?tab=finance']];
 async function capture(name){
  await page.waitForLoadState('networkidle',{timeout:ebdOnly?60000:25000});
  const data=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,width:innerWidth,shortControls:[...document.querySelectorAll('button,summary,a.primary,a.secondary')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<43.5&&getComputedStyle(e).visibility!=='hidden'&&![...e.parentElement.closest('main,aside,nav')?.querySelectorAll('details:not([open])')??[]].some(d=>d.contains(e)&&e!==d.querySelector(':scope > summary'));}).slice(0,12).map(e=>({text:e.getAttribute('aria-label')||e.textContent?.trim().slice(0,70),height:Math.round(e.getBoundingClientRect().height)})),heading:document.querySelector('main h1,main h2')?.textContent}));
  report.screens.push({name,...data});
  await page.screenshot({path:`${out}/${name}.png`,fullPage:false});
 }
 for(const size of [{name:'desktop',width:1440,height:1000,theme:'light'},{name:'mobile',width:390,height:844,theme:'dark'},...(previewOnly?[{name:'compacto',width:320,height:740,theme:'dark'}]:[])]){
  await page.setViewportSize(size);
  await page.addInitScript(theme=>localStorage.setItem('icabv-theme',theme),size.theme);
  for(const [name,path] of routes.filter(([name])=>ebdOnly?name==='ebd':worshipOnly?name==='louvor':agendaOnly?['inicio','agenda'].includes(name):schedulesOnly?['escalas','louvor','registros'].includes(name):!previewOnly||['inicio','gestao','louvor','menu'].includes(name))){await page.goto(base+path);if(schedulesOnly&&name==='louvor')await page.getByRole('navigation',{name:'Áreas do Louvor'}).getByRole('button',{name:'Escalas',exact:true}).click();if(schedulesOnly&&name==='registros')await page.getByRole('button',{name:'Escalas',exact:true}).click();await capture(`${size.name}-${name}`);}
  if(ebdOnly){
    const nav=page.getByRole('navigation',{name:'Áreas da EBD'});
    const tab=async name=>{const button=nav.getByRole('button',{name,exact:true});if(!await button.isVisible())await nav.locator('summary').click();await button.click();};
    await page.locator('.ui-disclosure > summary').filter({hasText:'Acompanhar aluno'}).click();await capture(`${size.name}-acompanhamento`);
    for(const name of ['Atividades','Gravações','Bíblia','Histórico','Relatórios','Diário e presença','Correções','Módulos e atividades','Turmas e pessoas','Configurações']){await tab(name);await capture(`${size.name}-${name.replaceAll(' ','-')}`);}
    await tab('Módulos e atividades');await page.getByRole('button',{name:'Nova atividade',exact:true}).click();await capture(`${size.name}-nova-atividade`);await page.keyboard.press('Escape');
    await tab('Gravações');await page.getByRole('button',{name:'Nova gravação',exact:true}).click();await capture(`${size.name}-nova-gravacao`);await page.keyboard.press('Escape');
    await tab('Correções');const review=page.getByRole('button',{name:'Avaliar atividade',exact:true}).first();if(await review.count()){await review.click();await capture(`${size.name}-avaliacao`);await page.keyboard.press('Escape');}
    await tab('Diário e presença');const person=page.locator('.ui-collection-items > details > summary').first();if(await person.count()){await person.click();await capture(`${size.name}-chamada-aberta`);}
  }
  if(worshipOnly){
    const nav=page.getByRole('navigation',{name:'Áreas do Louvor'});
    const tab=async name=>{const button=nav.getByRole('button',{name,exact:true});if(!await button.isVisible())await nav.locator('summary').click();await button.click();};
    for(const name of ['Escalas','Calendário mensal','Ensaios','Sala ao vivo','Histórico','Equipe','Configurações']){await tab(name);await capture(`${size.name}-${name.replaceAll(' ','-')}`);}
    await tab('Biblioteca');await page.getByRole('button',{name:/^Letra e cifra:/}).first().click();await capture(`${size.name}-leitura`);await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Nova música',exact:true}).click();await capture(`${size.name}-nova-musica`);await page.keyboard.press('Escape');
    await tab('Escalas');await page.getByRole('button',{name:'Nova escala de culto',exact:true}).click();await capture(`${size.name}-nova-escala`);await page.keyboard.press('Escape');
  }
 }
 if(!previewOnly&&!schedulesOnly&&!agendaOnly&&!worshipOnly&&!ebdOnly){
 // Inspect each secondary ministry screen as well as the default screens.
 await page.setViewportSize({width:768,height:1000});
 for(const [area,path,names] of [
  ['louvor','/gestao?tab=louvor',['Biblioteca','Escalas','Calendário mensal','Ensaios','Sala ao vivo','Histórico','Equipe','Configurações']],
  ['ebd','/gestao?tab=ebd',['Meu painel','Atividades','Gravações','Bíblia','Histórico','Relatórios','Diário e presença','Correções','Módulos e atividades','Turmas e pessoas','Configurações']]
 ]){
  await page.goto(base+path);await page.getByRole('heading',{name:area==='ebd'?'Painel EBD':'Louvor',exact:true}).waitFor();
  const nav=page.getByRole('navigation',{name:area==='ebd'?'Áreas da EBD':'Áreas do Louvor'});
  for(const name of names){const button=nav.getByRole('button',{name,exact:true});if(!await button.isVisible())await nav.locator('summary').click();await button.click();await capture(`tablet-${area}-${name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll(' ','-')}`);}
 }

 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/gestao?tab=records');await page.waitForLoadState('networkidle');
 const recordNav=page.getByRole('navigation',{name:'Áreas de gestão'});
 for(const [section,actionName] of [['Membros','Cadastrar membro'],['Finanças','Novo lançamento'],['Eventos','Criar evento'],['Escalas','Criar escala'],['Avisos','Criar aviso'],['Conteúdos','Novo conteúdo'],['Células','Cadastrar célula'],['Orações','Novo pedido']]){
  const item=recordNav.getByRole('button',{name:section,exact:true});if(!await item.isVisible())await recordNav.locator('summary').click();await item.click();
  await page.locator('.page-heading').getByRole('button',{name:actionName,exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();await capture(`mobile-modal-${section}`);
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
 }
 await page.goto(base+'/app');await page.getByRole('button',{name:/Notificações/}).click();
 await page.getByRole('dialog',{name:'Notificações',exact:true}).waitFor();await capture('mobile-notificacoes');
 await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'Notificações',exact:true}).waitFor({state:'hidden'});
 assert.match(await page.locator(':focus').getAttribute('aria-label'),/Notificações/,'O foco volta para o sino ao fechar');
 await page.goto(base+'/gestao?tab=people');await page.getByText('Vincular contas e revisar duplicados',{exact:true}).click();await capture('mobile-revisao-cadastros');
 await page.goto(base+'/gestao?tab=core-manage');await page.getByText('Criar aviso',{exact:true}).click();await capture('mobile-form-publicacao');
 }
 writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({screens:report.screens.length,overflow:report.screens.filter(s=>s.overflow).map(s=>s.name),shortControls:report.screens.filter(s=>s.shortControls.length).map(s=>({name:s.name,controls:s.shortControls})),apiErrors:report.apiErrors,pageErrors:report.pageErrors,blockedWrites:report.blockedWrites},null,2));
 assert.deepEqual(report.blockedWrites,[]);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.apiErrors,[]);assert.deepEqual(report.screens.filter(s=>s.overflow).map(s=>s.name),[]);
 await context.close();
}finally{await browser.close();await actor.auth.signOut({scope:'local'});}
