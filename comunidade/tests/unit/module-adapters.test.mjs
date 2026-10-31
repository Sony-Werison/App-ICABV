import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
const urlFor = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64");
const modelUrl = urlFor(
  await readFile(
    new URL("../../features/icabv/worship-model.ts", import.meta.url),
    "utf8",
  ),
);
const model = await import(modelUrl);
const adapter = await import(
  urlFor(
    (
      await readFile(
        new URL(
          "../../features/icabv/legacy-module-adapter.ts",
          import.meta.url,
        ),
        "utf8",
      )
    ).replace('"./worship-model"', JSON.stringify(modelUrl)),
  )
);
test("cifras: baixos invertidos, bemóis e preservação da letra", () => {
  assert.equal(model.transposeChord("G/B", 2), "A/C#");
  assert.equal(model.transposeChord("Bbmaj7/F", -2), "G#maj7/D#");
  assert.equal(
    model.transposeSheet("C  G/B  Am\nDeus é amor\n[C]Cantamos", 2),
    "D  A/C#  Bm\nDeus é amor\n[D]Cantamos",
  );
  assert.equal(model.transposeChord("C", -12), "C");
});

test("cifras: letra legada não é cifra; versões e nomes sobrevivem à normalização", () => {
  const version={id:'bb32d23b-7d5e-4e6c-92df-63ee8d581a32',name:'Violão',musical_key:'G',chords:'[G]Cantamos [D/F#]',lyrics:'Cantamos juntos',source_files:['origem.docx']};
  const song={title:'Exemplo',artist:'Equipe',lyrics:'Cantamos juntos',chords:'Cantamos juntos',pdf_links:[]};
  assert.equal(model.hasChordNotation(song.chords),false);
  assert.equal(model.hasChordNotation('C  G/B  Am\nCantamos juntos'),true);
  assert.equal(model.hasChordNotation('[todos forte]\nCantamos juntos'),false);
  assert.equal(model.hasChordNotation('G7M  D/F#  Bb°7'),true);
  assert.equal(model.songHasChords(song),false);
  assert.equal(model.songHasChords({...song,chord_versions:[version]}),true);
  assert.deepEqual(model.normalizeSong({...song,chord_versions:[version]}).chord_versions,[version]);
  assert.deepEqual(model.normalizeChordVersions([{...version,name:'  Novo nome  '}])[0],{...version,name:'Novo nome'});
  assert.throws(()=>model.normalizeChordVersions([version,version]));
  assert.throws(()=>model.normalizeChordVersions([{...version,name:''}]));
  assert.throws(()=>model.normalizeChordVersions([{...version,chords:'',lyrics:''}]));
});
test("sugestão mensal: elegibilidade, domingos e preservação de escalas existentes", () => {
  const people = [
    { person_id: "a", full_name: "Ana", roles: ["Abertura"], active: true },
    { person_id: "b", full_name: "Beto", roles: ["Pregação"], active: true },
  ];
  const proposal = model.proposeMonth("2026-11", people, []);
  assert.equal(proposal.length, 10);
  assert.ok(
    proposal.every(
      (s) =>
        s.assignments.Abertura[0] === "a" &&
        s.assignments.Pregação[0] === "b" &&
        s.assignments.Multimídia.length === 0,
    ),
  );
  assert.equal(
    model.proposeMonth("2026-11", people, [{ ...proposal[0], id: "existing" }])
      .length,
    9,
  );
});
test("CSV: delimitadores, aspas e quebras de linha", () => {
  const rows = model.parseSongCsv(
    'title;artist;lyrics\n"Canção; especial";Autor;"linha 1\nlinha 2"',
  );
  assert.equal(rows[0].title, "Canção; especial");
  assert.equal(rows[0].lyrics, "linha 1\nlinha 2");
  assert.throws(() => model.parseSongCsv('title\n"não terminou'));
});
test("backup EBD: conta canônica explícita, gabaritos separados e nenhum segredo transferido", () => {
  const data = adapter.adaptModuleBackup("ebd", {
    profiles: [
      {
        id: "student",
        name: "Aluno exemplo",
        role: "student",
        moduleId: 1,
        password: "never-copy",
      },
      {
        id: "parent",
        name: "Responsável",
        role: "parent",
        linked_student_ids: ["student"],
      },
    ],
    curriculum: {
      1: {
        title: "Módulo",
        schedule: [
          {
            title: "Leitura",
            type: "bible",
            question: "Pergunta",
            options: ["A", "B"],
            correct: 1,
            book: "João",
            chapters: [2],
          },
        ],
      },
    },
    submissions: [
      {
        id: "answer",
        user_id: "student",
        contentLabel: "Leitura",
        answer: "B",
        score: 8,
        createdAt: { seconds: 1767225600 },
      },
    ],
    classRecordings: [],
  });
  assert.equal(data.people[0].person_id, "");
  assert.equal(data.activities[0].questions[0].type, "choice");
  assert.equal(data.activities[0].answer_key[0], 1);
  assert.equal(data.guardians[0].student_legacy_id, "student");
  assert.equal(data.history.length, 1);
  assert.ok(!JSON.stringify(data).includes("never-copy"));
  assert.ok(!JSON.stringify(data).includes("password"));
});


const birthdayWeek = await import(urlFor(await readFile(new URL("../../features/icabv/birthday-week.ts", import.meta.url), "utf8")));
test("aniversários da semana: segunda a domingo, incluindo viradas de mês e ano", () => {
  const week = birthdayWeek.birthdayWeekDates("2026-10-25");
  assert.deepEqual(week, [19,20,21,22,23,24,25].map(day=>({month:10,day})));
  assert.deepEqual(birthdayWeek.birthdayWeekDates("2026-10-26"), [26,27,28,29,30,31].map(day=>({month:10,day})).concat({month:11,day:1}));
  assert.deepEqual(birthdayWeek.birthdayWeekDates("2027-01-01"), [28,29,30,31].map(day=>({month:12,day})).concat([1,2,3].map(day=>({month:1,day}))));
  assert.ok(birthdayWeek.birthdayWeekDates("2024-02-29").some(d=>d.month===2&&d.day===29));
});
test("informe semanal carrega os dois meses e todas as páginas antes de filtrar", async () => {
  const person=(id,month,day)=>({person_id:id,full_name:id,birth_month:month,birth_day:day});
  const calls=[];
  const rows=await birthdayWeek.loadWeeklyBirthdays("2027-01-01",async(month,page)=>{
    calls.push([month,page]);
    if(month===12&&page===0)return Array.from({length:100},(_,i)=>person(`Fora ${i}`,12,1));
    if(month===12&&page===1)return [person("Segunda",12,28),person("Antes",12,27)];
    return [person("Domingo",1,3),person("Depois",1,4),person("Sexta",1,1)];
  });
  assert.deepEqual(calls,[[12,0],[12,1],[1,0]]);
  assert.deepEqual(rows.map(p=>p.person_id),["Segunda","Sexta","Domingo"]);
});


const scheduleModel = await import(urlFor(await readFile(new URL("../../features/icabv/schedule-model.ts", import.meta.url), "utf8")));
test("quadro mensal separa manhã/noite, várias pessoas e a data de Brasília", () => {
  const entries=scheduleModel.worshipScheduleEntries([
    {id:"morning",starts_at:"2026-09-06T11:00:00Z",title:"Manhã",period:"manha",status:"planned",assignments:{Abertura:["a"],"Pregação":[],"Multimídia":["a","b"]}},
    {id:"night",starts_at:"2026-09-07T01:00:00Z",title:"Noite",period:"noite",status:"canceled",assignments:{Abertura:["b"],"Pregação":["a"]}},
  ],[{person_id:"a",full_name:"Ana"},{person_id:"b",full_name:"Bruno"}]);
  const grouped=scheduleModel.groupSchedule(entries,"2026-09");
  assert.equal(scheduleModel.scheduleColumn("Abertura manhã"),"Abertura Manhã");
  assert.equal(scheduleModel.scheduleColumn("pregacao","Manhã"),"Pregação Manhã");
  assert.equal(grouped.rows.length,1);
  assert.equal(grouped.rows[0].date,"2026-09-06");
  assert.deepEqual(grouped.columns,["Abertura Manhã","Pregação Manhã","Abertura Noite","Pregação Noite","Multimídia"]);
  assert.deepEqual(grouped.rows[0].cells.at(-1).entries[0].people.map(p=>p.name),["Ana","Bruno"]);
  assert.equal(entries.find(e=>e.id==="night").canceled,true);
  assert.equal(scheduleModel.groupSchedule(entries,"2026-10").rows.length,0);
});
test("quadro aceita equipes/funções novas e preserva todas as páginas", async () => {
  const entries=[{id:"1",date:"2026-09-06",role:"Limpeza",group:"Conservação",people:[]},{id:"2",date:"2026-09-06",role:"Café da manhã",group:"Recepção",people:[]}];
  assert.deepEqual(scheduleModel.groupSchedule(entries,"2026-09","Recepção").columns,["Café da manhã"]);
  const all=Array.from({length:45},(_,i)=>i);
  assert.deepEqual(await scheduleModel.loadSchedulePages(async page=>all.slice(page*20,page*20+21)),all);
});


const agendaModel=await import(urlFor(await readFile(new URL("../../features/icabv/agenda-calendar-model.ts",import.meta.url),"utf8")));
test("agenda: calendário começa na segunda-feira e inclui anos bissextos",()=>{
  const dates=agendaModel.monthDates("2026-11");
  assert.equal(dates[0],null);assert.equal(dates[6],"2026-11-01");
  assert.equal(dates.at(-7),"2026-11-30");
  assert.equal(agendaModel.monthDates("2024-02").filter(Boolean).length,29);
});
test("agenda: marca eventos de vários dias em Brasília sem incluir o fim à meia-noite",()=>{
  const event={id:"e",title:"Evento",status:"published",starts_at:"2026-10-31T22:00:00Z",ends_at:"2026-11-02T03:00:00Z"};
  assert.equal(agendaModel.eventOnDate(event,"2026-10-31"),true);
  assert.equal(agendaModel.eventOnDate(event,"2026-11-01"),true);
  assert.equal(agendaModel.eventOnDate(event,"2026-11-02"),false);
  assert.equal(agendaModel.eventsInMonth([event],"2026-11").length,1);
  assert.equal(agendaModel.eventOnDate({...event,status:"canceled"},"2026-10-31"),false);
});
test("agenda: marcadores incluem eventos além da primeira página sem duplicar a antecipação",async()=>{
  const all=Array.from({length:45},(_,i)=>i);
  assert.deepEqual(await agendaModel.loadAgendaPages(async page=>all.slice(page*20,page*20+21)),all);
});


test("agenda pessoal usa identidade exata, reúne funções e ignora recusas/cancelamentos",()=>{
  const worship=(id,status,assignments)=>({id,title:id,starts_at:"2026-10-24T01:00:00Z",status,assignments});
  const shift=(id,status,canceled=false)=>({id,title:id,unit_title:"Limpeza",starts_at:"2026-10-23T11:00:00Z",ends_at:"2026-10-23T12:00:00Z",status,canceled});
  const record=(id,memberId,status)=>({id,data:{date:"2026-10-23",time:"07:00",ministry:"Café da manhã",duty:"Preparar café",memberId,status}});
  const items=agendaModel.buildAgendaCommitments({month:"2026-10",personId:"me",birthdays:[{person_id:"birthday",full_name:"Ana",birth_day:23,birth_month:10}],worship:[worship("mine","planned",{Abertura:["me"],"Pregação":["me"],Vocal:["other"]}),worship("other","planned",{Abertura:["other"]}),worship("canceled","canceled",{Abertura:["me"]})],shifts:[shift("cleaning","pending"),shift("declined","declined"),shift("cancelled","confirmed",true)],records:[record("breakfast","me","Confirmado"),record("not-mine","other","Confirmado"),record("unavailable","me","Indisponível")]});
  assert.deepEqual(items.map(item=>item.id),["birthday:birthday","record:breakfast","service:cleaning","worship:mine"]);
  const own=items.find(item=>item.id==="worship:mine");assert.equal(own.date,"2026-10-23");assert.equal(own.time,"22:00");assert.equal(own.description,"Abertura · Pregação");
  assert.equal(items.find(item=>item.id==="service:cleaning").status,"Confirmação pendente");
});
test("aniversários na Agenda são recorrentes, sem ano de nascimento e com paginação completa",async()=>{
  const person={person_id:"a",full_name:"Ana",birth_day:29,birth_month:2};
  assert.equal(agendaModel.buildAgendaCommitments({personId:"me",month:"2025-02",birthdays:[person]}).length,0);
  assert.equal(agendaModel.buildAgendaCommitments({personId:"me",month:"2024-02",birthdays:[person]})[0].date,"2024-02-29");
  const all=Array.from({length:101},(_,i)=>({...person,person_id:String(i)}));
  assert.deepEqual(await agendaModel.loadAgendaBirthdays(async page=>all.slice(page*100,page*100+100)),all);
});

test("próximos compromissos atravessam meses e anos, sem repetir aniversários",()=>{
  const items=agendaModel.buildUpcomingAgendaCommitments({today:"2026-12-23",personId:"me",
    birthdays:[{person_id:"past",full_name:"Já fez aniversário",birth_day:22,birth_month:12},{person_id:"jan",full_name:"Janeiro",birth_day:2,birth_month:1},{person_id:"leap",full_name:"Bissexto",birth_day:29,birth_month:2}],
    worship:[{id:"future",title:"Culto",starts_at:"2027-01-10T12:00:00Z",status:"planned",assignments:{Abertura:["me"]}}],
    shifts:[{id:"cleaning",title:"Limpeza",unit_title:"Equipe",starts_at:"2027-02-03T12:00:00Z",ends_at:"2027-02-03T13:00:00Z",status:"confirmed",canceled:false}],
    records:[{id:"past",data:{memberId:"me",date:"2026-12-22"}},{id:"today",data:{memberId:"me",date:"2026-12-23"}},{id:"future",data:{memberId:"me",date:"2027-01-15"}},{id:"other",data:{memberId:"other",date:"2027-01-16"}}]});
  assert.deepEqual(items.map(item=>[item.id,item.date]),[["record:today","2026-12-23"],["birthday:jan","2027-01-02"],["worship:future","2027-01-10"],["record:future","2027-01-15"],["service:cleaning","2027-02-03"],["birthday:past","2027-12-22"],["birthday:leap","2028-02-29"]]);
});

const ebdUi=await import(urlFor(await readFile(new URL("../../features/icabv/ebd-ui-model.ts",import.meta.url),"utf8")));
test("jornada semanal da EBD usa segunda a domingo, Brasília e somente o aluno escolhido",()=>{
  const week=ebdUi.studyWeek("me",[{person_id:"me",created_at:"2026-11-01T02:00:00Z"},{person_id:"me",created_at:"2026-11-01T03:00:00Z"},{person_id:"other",created_at:"2026-11-01T04:00:00Z"},{person_id:"me",created_at:"2026-10-25T12:00:00Z"}],"2026-11-01");
  assert.equal(week[0].date,"2026-10-26");assert.equal(week.at(-1).date,"2026-11-01");assert.equal(week[5].count,1);assert.equal(week[6].count,1);assert.equal(week[6].today,true);
  assert.equal(ebdUi.ebdDate("2026-11-01T02:00:00Z"),"31/10/2026");assert.equal(ebdUi.ebdDate("2026-11-01"),"01/11/2026");
});

const weekendModel=await import(urlFor((await readFile(new URL("../../features/icabv/weekend-model.ts",import.meta.url),"utf8")).replace('"./schedule-model"',JSON.stringify(urlFor(await readFile(new URL("../../features/icabv/schedule-model.ts",import.meta.url),"utf8"))))));
test("fim de semana: Brasília, sábado/domingo atuais, viradas de mês/ano e cancelamentos",()=>{
 assert.deepEqual(weekendModel.weekendRange('2026-10-23'),{start:'2026-10-24',end:'2026-10-25',current:false});
 assert.deepEqual(weekendModel.weekendRange('2026-10-25'),{start:'2026-10-24',end:'2026-10-25',current:true});
 assert.deepEqual(weekendModel.weekendRange('2026-10-26'),{start:'2026-10-31',end:'2026-11-01',current:false});
 assert.deepEqual(weekendModel.weekendRange('2026-12-31'),{start:'2027-01-02',end:'2027-01-03',current:false});
 const make=(id,starts_at,status='planned')=>({id,starts_at,status});
 const meetings=[make('friday','2026-10-24T02:30:00Z'),make('late-sunday','2026-10-26T01:00:00Z'),make('saturday','2026-10-24T22:00:00Z'),make('canceled','2026-10-25T12:00:00Z','canceled'),make('monday','2026-10-26T04:00:00Z')];
 assert.deepEqual(weekendModel.weekendServices(meetings,'2026-10-23').map(s=>s.id),['saturday','late-sunday']);
});


test("Escalas de documentos: identidade confirmada, datas exatas e funções sem duplicar participação",async()=>{
 const {rosterCommitments}=await import(urlFor(await readFile(new URL("../../features/icabv/duty-roster-model.ts",import.meta.url),"utf8")));
 const roster={id:"rota",title:"Lanches",source_name:"fonte.pdf",groups:[{id:"g1",label:"Grupo 1",members:[{id:"a",name:"Nome",role:"Lanche",person_id:"p"},{id:"b",name:"Nome",role:"Suco",person_id:"p"},{id:"c",name:"Nome parecido",role:"Suco",person_id:null}]}],dates:[{date:"2026-03-15",group_id:"g1"}]};
 const items=rosterCommitments([roster],"p");assert.equal(items.length,1);assert.equal(items[0].date,"2026-03-15");assert.match(items[0].description,/Lanche e Suco/);assert.equal(items[0].time,undefined);assert.equal(rosterCommitments([roster],"outro").length,0);
});


test("Informe de hoje filtra dia e mês após percorrer todas as páginas",async()=>{
 const {loadDailyBirthdays}=await import(urlFor(await readFile(new URL("../../features/icabv/birthday-week.ts",import.meta.url),"utf8")));
 const calls=[];const result=await loadDailyBirthdays("2026-10-23",async(month,page)=>{calls.push([month,page]);return page===0?Array.from({length:100},(_,i)=>({person_id:String(i),full_name:"Outra data",birth_month:10,birth_day:24})):[{person_id:"today",full_name:"Hoje",birth_month:10,birth_day:23},{person_id:"othermonth",full_name:"Outro mês",birth_month:11,birth_day:23}];});
 assert.deepEqual(calls,[[10,0],[10,1]]);assert.deepEqual(result.map(p=>p.person_id),["today"]);
});
