import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(
  process.env.ICABV_TEST_PACKAGE || new URL("../package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const host = env
  .match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1]
  .trim()
  .replace(/^['"]|['"]$/g, "");
const uid = "00000000-0000-4000-8000-000000000001",
  pid = "10000000-0000-4000-8000-000000000001";
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "qa@example.com",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
};
const token = [
  "eyJhbGciOiJIUzI1NiJ9",
  Buffer.from(
    JSON.stringify({
      sub: uid,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url"),
  "signature",
].join(".");
const base = process.env.ICABV_TEST_URL || "http://localhost:5173";
const observed = [];
const recordOffsets = [];
await page.route(host + "/**", async (route) => {
  const url = new URL(route.request().url());
  observed.push(url.pathname);
  let data = [];
  let status = 200;
  if (url.pathname === "/auth/v1/token")
    data = {
      access_token: token,
      refresh_token: "qa-only",
      token_type: "bearer",
      expires_in: 3600,
      user,
    };
  else if (url.pathname === "/auth/v1/user") data = user;
  else if (url.pathname === "/auth/v1/logout") {
    status = 204;
    data = null;
  } else if (url.pathname === "/rest/v1/persons")
    data = {
      id: pid,
      full_name: "Pessoa Teste",
      onboarded_at: new Date().toISOString(),
    };
  else if (url.pathname === "/rest/v1/management_records") {
    data = [
      {
        id: "20000000-0000-4000-8000-000000000001",
        kind: "content",
        version: 1,
        data: {
          title: "Devocional de teste",
          type: "Devocional",
          body: "Reflexão publicada de teste",
          reference: "Salmo 23",
          speaker: "Equipe fictícia",
          url: "",
          date: "2026-10-21",
          status: "Publicado",
        },
        created_at: "2026-10-21T12:00:00Z",
        updated_at: "2026-10-21T12:00:00Z",
      },
    ];
    const date = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    data.push(
      ...Array.from({ length: 150 }, (_, i) => ({
        id: `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        kind: "transaction",
        version: 1,
        data: {
          description: "Entrada fictícia",
          direction: "Entrada",
          amount: 100,
          category: "Teste",
          date,
          status: "Realizado",
          notes: "",
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    );
    const offset = Number(url.searchParams.get("offset") || 0);
    recordOffsets.push(offset);
    data = data.slice(
      offset,
      offset + Number(url.searchParams.get("limit") || 100),
    );
  } else if (url.pathname.endsWith("/browse_events")) data = [{id:"test-event",title:"Encontro de teste com título longo para verificar o espaço",starts_at:new Date(Date.now()+86400000).toISOString(),ends_at:new Date(Date.now()+90000000).toISOString(),location:"Local de teste",status:"published"}, {id:"later-event",title:"Evento posterior de teste",starts_at:new Date(Date.now()+172800000).toISOString(),ends_at:new Date(Date.now()+176400000).toISOString(),location:"Outro local",status:"published",capacity:null}];
  else if (url.pathname.endsWith('/event_availability_for')) data=[{event_id:'test-event',registered_count:2}];
  else if (url.pathname.endsWith('/event_registrations')) data=null;
  else if (url.pathname.endsWith('/item_availability_page')) data=[{id:'test-item',name:'Pacotes de arroz',quantity:10,remaining:7,my_quantity:0}];
  else if (url.pathname.endsWith("/anniversary_calendar")) {
    const today = new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
    const date = new Date(`${today}T12:00:00Z`), outside = new Date(date);
    outside.setUTCDate(date.getUTCDate() - (date.getUTCDay()+6)%7 - 1);
    const people = [{person_id:"birthday-today",full_name:"Aniversariante desta semana",birth_month:date.getUTCMonth()+1,birth_day:date.getUTCDate()}, {person_id:"birthday-outside",full_name:"Aniversariante fora da semana",birth_month:outside.getUTCMonth()+1,birth_day:outside.getUTCDate()}];
    data = people.filter(p=>p.birth_month===route.request().postDataJSON().month_number);
  }
  else if (url.pathname.endsWith("/announcements")) data = [{id:"test-news",title:"Comunicado de teste",body:"Informações para toda a comunidade. ".repeat(20),published:true,expires_at:null}];
  else if (url.pathname.endsWith("/identity_directory")) data = { items: [] };
  else if (url.pathname.endsWith('/management_summary')) data={persons:2,event_count:2,group_count:0,events:[]};
  else if (url.pathname.endsWith('/management_people')) data={items:[{id:pid,full_name:'Pessoa Teste',membership_status:'visitor',membership_reviewed_at:null}],total:1};
  else if (url.pathname.endsWith("/my_roles")) data = ["admin"];
  else if (url.pathname.endsWith("/finance_demo_enabled")) data = false;
  await route.fulfill({
    status,
    contentType: "application/json",
    body: status === 204 ? "" : JSON.stringify(data),
  });
});
try {
  await page.goto(base + "/app");
  await page.getByRole("button", { name: "Entrar", exact: true }).waitFor();
  mkdirSync("test-results/icabv", { recursive: true });
  await page.screenshot({
    path: "test-results/icabv/login-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ativar tema escuro" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.screenshot({
    path: "test-results/icabv/login-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ativar tema claro" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill("qa@example.com");
  await page.getByLabel("Senha", { exact: true }).fill("qa-password-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByText("Olá, Pessoa. Que bom ter você aqui.", { exact: true })
    .waitFor();
  assert.ok(observed.includes("/auth/v1/token"));
  await page.locator('.member-program .compact-card').waitFor();
  assert.equal(await page.locator('.member-program .compact-card').count(),1,'Início mostra somente o evento mais próximo');
  assert.equal(await page.getByText('Evento posterior de teste',{exact:true}).count(),0);
  await page.getByText('Comunicado de teste',{exact:true}).waitFor();
  const newsCard=page.locator('.member-news article').first();
  assert.equal(await newsCard.evaluate(el=>el.getBoundingClientRect().height<=80),true,'Comunicado longo ocupa uma linha compacta');
  await page.getByRole('button',{name:'Ler comunicado: Comunicado de teste',exact:true}).click();
  const announcementDialog=page.getByRole('dialog',{name:'Comunicado de teste',exact:true});
  await announcementDialog.waitFor();
  assert.ok((await announcementDialog.locator('.announcement-full-text').textContent()).length>100,'Modal mostra o texto completo');
  assert.equal(await newsCard.evaluate(el=>el.getBoundingClientRect().height<=80),true,'Card permanece compacto');
  await page.keyboard.press('Escape');
  await announcementDialog.waitFor({state:'hidden'});
  await page.locator('.member-program .compact-card button').click();
  const eventDialog=page.getByRole('dialog');
  await eventDialog.waitFor();
  await eventDialog.getByText('Vagas',{exact:true}).waitFor();
  await eventDialog.getByText('Pagamento',{exact:true}).waitFor();
  await eventDialog.getByText('Sem limite de vagas · 2 confirmações',{exact:true}).waitFor();
  await eventDialog.getByText('Pacotes de arroz · Restam 7 de 10. Sua reserva: 0.',{exact:true}).waitFor();
  await eventDialog.getByRole('button',{name:'Inscrever-me',exact:true}).waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await eventDialog.waitFor({state:'hidden'});
  assert.equal(await page.getByText('Conecte-se à vida da nossa igreja.',{exact:true}).count(),0);
  assert.equal(await page.locator('.member-access-grid').count(),0);
  assert.equal(await page.locator('.member-participation').count(),0);
  await page.getByRole('heading',{name:'Aniversariantes de hoje',exact:true}).waitFor();
  await page.getByText('Aniversariante desta semana',{exact:true}).waitFor();
  assert.equal(await page.getByText('Aniversariante fora da semana',{exact:true}).count(),0);
  assert.equal(await page.locator('.member-program .program-date').evaluate(el=>getComputedStyle(el).borderLeftWidth),'0px');
  assert.equal(await page.locator('.member-news article').first().evaluate(el=>getComputedStyle(el).borderLeftWidth),'1px');
  assert.equal(await page.locator('.icabv-header-actions .sync-trigger').count(),1);
  assert.equal(await page.locator('.icabv-header-actions .sync-control').evaluate(el=>el.nextElementSibling?.getAttribute('aria-label')),'Abrir gestão');
  for (const width of [320,390,575,1440]) {
    await page.setViewportSize({width,height:900});
    const metrics=await page.evaluate(()=>{
      const title=document.querySelector('.member-intro h1'),range=document.createRange();range.selectNodeContents(title);
      return {lines:range.getClientRects().length, fits:title.scrollWidth<=title.clientWidth, overflow:document.documentElement.scrollWidth>innerWidth,
        eventHeight:document.querySelector('.member-program .compact-card').getBoundingClientRect().height,
        headings:[...document.querySelectorAll('#main-content > section h2')].map(e=>e.textContent)};
    });
    assert.equal(metrics.lines,1,`Nome em uma linha em ${width}px`);
    assert.equal(metrics.fits,true,`Nome completo cabe em ${width}px`);
    assert.equal(metrics.overflow,false,`Sem transbordamento em ${width}px`);
    assert.ok(metrics.eventHeight<=90,`Evento compacto em ${width}px`);
    assert.ok(metrics.headings.indexOf('Comunicados')<metrics.headings.indexOf('Próximo evento'));
    assert.equal(metrics.headings.includes('Acessos'),false);
    const sync=page.getByRole('button',{name:'Sincronização: Tudo sincronizado',exact:true});
    await sync.click();
    await page.getByRole('heading',{name:'Sincronização',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.keyboard.press('Escape');
    assert.equal(await sync.evaluate(el=>el===document.activeElement),true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({
    path: "test-results/icabv/home-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ver agenda", exact: true }).click();
  await page.getByRole("heading", { name: "Agenda", exact: true }).waitFor();
  await page.getByText("Evento posterior de teste", { exact: true }).waitFor();
  await page.getByText("Encontro de teste com título longo para verificar o espaço", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.getByRole("button", { name: "Ver conteúdos", exact: true }).click();
  await page.getByRole("heading", { name: "Devocional de teste" }).waitFor();
  await page.getByText("Ler conteúdo", { exact: true }).click();
  await page
    .getByText("Reflexão publicada de teste", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByLabel("Buscar no menu", {exact:true}).fill("Famílias");
  await page.getByRole("button", {name:"Famílias",exact:true}).click();
  await page.getByRole("heading", { name: "Famílias", exact: true }).waitFor();
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Gestão", exact: true }).click();
  await page
    .getByRole("main").getByRole("button", { name: "Finanças e arquivo", exact: true })
    .click();
  await page.getByRole('navigation',{name:'Localização no painel',exact:true}).getByText('Finanças e arquivo',{exact:true}).waitFor();
  for (const width of [320,390]) {
    await page.setViewportSize({width,height:844});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,15).map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right}))));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Cabeçalho de registros em ${width}px`);
    await page.getByRole('button',{name:/^Sincronização:/}).click();
    await page.getByRole('heading',{name:'Sincronização',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByText("R$ 150,00", { exact: true }).first().waitFor();
  assert.ok(
    recordOffsets.includes(100),
    "Carrega a segunda página antes de calcular os totais",
  );
  await page.getByRole("button", { name: "Finanças", exact: true }).click();
  assert.equal(await page.locator("tbody tr").count(), 20, "A lista mostra 20 lançamentos por página");
  await page.getByRole("navigation", { name: "Paginação de registros" }).getByRole("button", { name: "Próxima", exact: true }).click();
  assert.equal(await page.locator("tbody tr").count(), 20);
  const exportWait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV", exact: true }).click();
  const download = await exportWait;
  const downloadPath = await download.path();
  const exported = await import("node:fs/promises").then(fs => fs.readFile(downloadPath, "utf8"));
  assert.equal(exported.trim().split("\r\n").length,151,"Exportação mantém todos os 150 lançamentos");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  assert.equal(await page.locator("tbody tr").count(),150,"Impressão inclui os registros de todas as páginas");
  await page.emulateMedia({media:"print"});
  assert.equal(await page.locator('.table-scroll').evaluate(el=>getComputedStyle(el).maxHeight),'none','A impressão não recorta a altura da tabela');
  assert.equal(await page.locator('.table-scroll').evaluate(el=>getComputedStyle(el).overflow),'visible');
  await page.emulateMedia({media:"screen"});
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.getByRole('navigation',{name:'Áreas de gestão',exact:true}).getByRole("button", { name: "Pessoas", exact: true }).click();
  await page
    .getByRole("button", { name: "Cadastrar pessoa", exact: true })
    .first()
    .click();
  await page.getByRole("dialog", { name: "Cadastrar pessoa" }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole("button", { name: "Abrir app da igreja" }).first().click();
  await page
    .getByRole("button", { name: "Grupos", exact: true })
    .first()
    .click();
  await page.getByText("Não foi possível carregar.", { exact: true }).count();
  await page.screenshot({
    path: "test-results/icabv/groups.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ativar tema escuro" }).click();
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.screenshot({
    path: "test-results/icabv/home-dark.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Sem transbordamento horizontal no celular",
  );
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await page.getByRole("button", { name: "Entrar", exact: true }).waitFor();
  assert.equal(
    (await page.request.get(base + "/api/records")).status(),
    410,
  );
  assert.deepEqual(errors, []);
  console.log(
    "OK: login Supabase simulado, temas, navegação, famílias, gestão, modal, grupos, logout, isolamento D1 e largura mobile.",
  );
} finally {
  await browser.close();
}
