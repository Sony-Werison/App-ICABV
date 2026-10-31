"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import {
  ModuleForm,
  ModuleState,
  ModuleTabs,
  csvData,
  downloadData,
  moduleRpc,
  safeHttps,
  useModuleAction,
  useModulePeople,
  useModuleRows,
  type Capabilities,
  type Data,
} from "./module-ui";
import {
  type Activity,
  type Attendance,
  type EbdClass,
  type EbdMember,
  type EbdModule,
  type Question,
  type Recording,
  type LessonSession,
  type Submission,
  type LegacyHistory,
  studentSummary,
} from "./ebd-model";
import { ModuleAccess } from "./worship";
import { BibleReader } from "./bible-reader";
import { ModuleImport } from "./module-import";
import { Disclosure, PagedList, SearchField, searchText } from "./presentation";
import {ModuleDialog} from "./module-dialog";
import {CompactCard} from "./compact-card";
import {EbdActivityModules,EbdStudyWeek,EbdWeeklyActivityTable} from "./ebd-ui";
import {kindLabel,ebdToday,ebdDate} from "./ebd-ui-model";
import {GraduationCap,ClipboardCheck,MessageSquare,BookOpen,Check,UserRound,UsersRound,Settings,ArrowLeft} from "lucide-react";

const today = ebdToday;
const ebdRoleOptions = [
  { role:"student", label:"Aluno", description:"Acesse atividades, aulas e seu histórico.", icon:UserRound },
  { role:"teacher", label:"Professor", description:"Gerencie atividades, chamadas, gravações e histórico.", icon:GraduationCap },
  { role:"guardian", label:"Pai ou responsável", description:"Acompanhe os estudos dos alunos vinculados.", icon:UsersRound },
  { role:"management", label:"Gestão", description:"Organize turmas, pessoas e conteúdos da EBD.", icon:Settings },
] as const;
export function Ebd({
  capabilities,
  personId,
  admin,
  initialSection,
  initialClass,
}: {
  capabilities: Capabilities;
  personId: string;
  admin: boolean;
  initialSection?: string;
  initialClass?: string;
}) {
  const [selected, setSelected] = useState(initialClass ?? ""),
    [tab, setTab] = useState(initialSection ?? "Meu painel"),
    [attendanceDirty,setAttendanceDirty]=useState(false),
    [viewRole, setViewRole] = useState<"student" | "teacher" | "guardian" | "management" | null>(null);
  const profiles = useQuery({ queryKey: ["modules", "ebd-profiles", personId], queryFn: () => moduleRpc<{view_role:"student"|"teacher"|"guardian"|"management";class_id:string|null}[]>("my_ebd_profiles") });
  const guardianLinks = useModuleRows<{student_id:string;guardian_id:string}>("ebd_guardians","student_id",["guardian_id",personId]);
  const classes = useModuleRows<EbdClass>("ebd_classes", "name");
  const profilesForRole=profiles.data?.filter(item=>item.view_role===viewRole)??[];
  const availableClasses=viewRole==="management"?classes.data??[]:(classes.data??[]).filter(item=>profilesForRole.some(profile=>profile.class_id===item.id));
  const c=availableClasses.find(item=>item.id===selected)??availableClasses.find(item=>!item.archived);
  const profileRoles=[...new Set(profiles.data?.map(item=>item.view_role)??[])];
  const compactAttendance=viewRole==="teacher"&&tab==="Chamada";
  const requestTabChange=(next:string)=>{
    if(attendanceDirty&&next!==tab&&!window.confirm("Há alterações na chamada ou no tema da aula que ainda não foram salvas. Deseja sair sem salvar?"))return;
    if(attendanceDirty&&next!==tab)setAttendanceDirty(false);
    setTab(next);
  };
  useEffect(()=>{
    if(!attendanceDirty)return;
    const message="Há alterações na chamada que ainda não foram salvas.";
    const beforeUnload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=message;return message;};
    const guardNavigation=(event:MouseEvent)=>{
      const target=event.target;
      if(!(target instanceof Element))return;
      const anchor=target.closest<HTMLAnchorElement>("a[href]");
      const bottomButton=target.closest<HTMLButtonElement>("nav.icabv-bottom button, .icabv-menu-button, .member-menu-group button");
      const destination=anchor?new URL(anchor.href,window.location.href):null;
      const leavesPage=!!destination&&(destination.pathname+destination.search!==window.location.pathname+window.location.search);
      const leavesEbd=!!bottomButton&&bottomButton.getAttribute("aria-current")!=="page";
      if((leavesPage||leavesEbd)&&!window.confirm("Há alterações na chamada ou no tema da aula que ainda não foram salvas. Deseja sair sem salvar?")){
        event.preventDefault();event.stopImmediatePropagation();
      }else if(leavesPage||leavesEbd)setAttendanceDirty(false);
    };
    window.addEventListener("beforeunload",beforeUnload);
    document.addEventListener("click",guardNavigation,true);
    return()=>{window.removeEventListener("beforeunload",beforeUnload);document.removeEventListener("click",guardNavigation,true);};
  },[attendanceDirty]);
  useEffect(()=>{
    if(viewRole==="teacher"){
      if(tab==="Diário e presença"||tab==="Chamadas")setTab("Chamada");
      else if(!["Atividades","Chamada","Gravações","Histórico"].includes(tab))setTab("Atividades");
    }else if(tab==="Chamada"||tab==="Chamadas"||tab==="Diário e presença")setTab("Meu painel");
  },[viewRole,tab]);
  useEffect(()=>{
    if(!viewRole||classes.isPending||(viewRole==="guardian"&&guardianLinks.isPending))return;
    if(selected&&availableClasses.some(item=>item.id===selected))return;
    setSelected(availableClasses.find(item=>!item.archived)?.id??availableClasses[0]?.id??"");
  },[availableClasses,selected,viewRole,classes.isPending,guardianLinks.isPending]);
  const chooseRole=(role:typeof ebdRoleOptions[number]["role"])=>{
    setViewRole(role);
    setSelected("");
    setTab(role==="teacher"?"Atividades":"Meu painel");
  };
  const openRolePicker=()=>{
    if(attendanceDirty&&!window.confirm("Há alterações na chamada que ainda não foram salvas. Deseja sair sem salvar?"))return;
    setAttendanceDirty(false);
    setViewRole(null);
  };
  const roleLabel=ebdRoleOptions.find(option=>option.role===viewRole)?.label??"Perfil de acesso";
  const roleTabs=viewRole==="teacher"?["Atividades","Chamada","Gravações","Histórico"]:viewRole==="management"?["Meu painel","Atividades","Gravações","Bíblia","Histórico","Relatórios",...(capabilities.ebd_manager&&admin?["Turmas e pessoas","Configurações"]:[])]:["Meu painel","Atividades","Gravações","Bíblia","Histórico","Relatórios"];
  return (
      <div className={`module-page ebd-page${compactAttendance?" ebd-compact-attendance":""}`}>
      {!viewRole ? <section className="icabv-card ebd-profile-picker" aria-labelledby="ebd-profile-title">
        <span className="church-label"><GraduationCap size={15} aria-hidden="true"/> ESCOLA BÍBLICA DOMINICAL</span>
        <h1 id="ebd-profile-title">Escolha seu perfil de acesso</h1>
        <p>Selecione como deseja acessar a Escola Bíblica Dominical.</p>
        {profiles.isPending&&<p role="status">Carregando seus perfis…</p>}
        {profiles.isError&&<p role="alert">Não foi possível carregar seus perfis da EBD. Tente novamente.</p>}
        <div className="ebd-profile-options">{ebdRoleOptions.map(option=>{
          const available=profileRoles.includes(option.role);
          const Icon=option.icon;
          return <button type="button" key={option.role} className={`ebd-profile-option${available?"":" is-unavailable"}`} disabled={!available||profiles.isPending} aria-disabled={!available} onClick={()=>chooseRole(option.role)}>
            <Icon size={28} strokeWidth={1.8} aria-hidden="true"/><strong>{option.label}</strong><span>{option.description}</span>{!available&&<small>Sem acesso neste perfil</small>}
          </button>;
        })}</div>
        {!profiles.isPending&&profiles.isSuccess&&!profileRoles.length&&<p>Seu acesso à EBD ainda não está vinculado a um perfil. Peça à secretaria que confirme seu vínculo.</p>}
      </section> : <>
        {viewRole==="teacher"?<section className="ebd-teacher-navigation" aria-label="Navegação do professor">
          <div className="ebd-attendance-role ebd-profile-pill">Professor</div>
          <button type="button" className="secondary ebd-profile-back" onClick={openRolePicker}><ArrowLeft size={16} aria-hidden="true"/>Voltar à seleção de perfil</button>
          <ModuleTabs current={tab} onChange={requestTabChange} label="Áreas da EBD" unified tabs={roleTabs}/>
        </section>:<>
          <header className="module-heading">
            <span className="church-label"><GraduationCap size={15} aria-hidden="true"/> ESCOLA BÍBLICA DOMINICAL</span>
            <h1>Painel EBD</h1>
            <p>Estudo e acompanhamento da sua turma.</p>
          </header>
          <button type="button" className="ebd-attendance-role ebd-profile-pill" onClick={openRolePicker} title="Trocar perfil de acesso">{roleLabel}</button>
          <ModuleTabs current={tab} onChange={requestTabChange} label="Áreas da EBD" unified primaryTabs={viewRole==="management"?["Meu painel","Relatórios"]:undefined} tabs={roleTabs}/>
        </>}
      <ModuleState query={profiles}>
      <ModuleState query={viewRole==="guardian"?guardianLinks:classes}>
      <ModuleState query={classes}>
        {tab === "Bíblia" ? (
          <BibleReader />
        ) : tab === "Turmas e pessoas" && capabilities.ebd_manager && admin && viewRole === "management" ? (
          <EbdAdministration classes={classes.data ?? []} />
        ) : tab === "Configurações" && capabilities.ebd_manager && admin && viewRole === "management" ? (
          <EbdSettings classes={classes.data ?? []} admin={admin} />
        ) : (
          <>
            {viewRole==="teacher"?<p className="ebd-teacher-class" aria-label="Turma do professor">{c?`Turma: ${c.name}`:"Sua turma ainda não está vinculada."}</p>:<label className="icabv-field ebd-class-picker">
              Turma
              <select
                value={c?.id ?? ""}
                aria-label="Turma"
                onChange={(e) => {if(attendanceDirty&&!window.confirm("Há alterações na chamada que ainda não foram salvas. Deseja sair sem salvar?"))return;setAttendanceDirty(false);setSelected(e.target.value);}}
              >
                <option value="">Selecione</option>
            {availableClasses.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                    {c.archived ? " · Arquivada" : ""}
                  </option>
                ))}
              </select>
            </label>}
            {c ? (
              <ClassWorkspace
                key={c.id}
                schoolClass={c}
                personId={personId}
                viewRole={viewRole??"student"}
                guardianStudentIds={guardianLinks.data?.map(row=>row.student_id)??[]}
                canManageActivities={capabilities.ebd_manager&&admin}
                tab={tab}
                onChangeTab={requestTabChange}
                onAttendanceDirtyChange={setAttendanceDirty}
              />
            ) : (
              <section className="icabv-card">
                <h2>Bem-vindo à EBD</h2>
                <p>
                  Você ainda não está vinculado a uma turma. A gestão pode
                  vincular sua conta como aluno, professor ou responsável em
                  “Turmas e pessoas”.
                </p>
                {viewRole==="management" && capabilities.ebd_manager && admin && (
                  <button
                    className="primary"
                    onClick={() => setTab("Turmas e pessoas")}
                  >
                    Cadastrar turma
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </ModuleState>
      </ModuleState>
      </ModuleState>
      </>}
    </div>
  );
}
function ClassWorkspace({
  schoolClass: c,
  personId,
  viewRole,
  canManageActivities,
  guardianStudentIds,
  tab,
  onChangeTab,
  onAttendanceDirtyChange,
}: {
  schoolClass: EbdClass;
  personId: string;
  viewRole: "student" | "teacher" | "guardian" | "management";
  canManageActivities:boolean;
  guardianStudentIds: string[];
  tab: string;
  onChangeTab:(tab:string)=>void;
  onAttendanceDirtyChange:(dirty:boolean)=>void;
}) {
  const [reviewOpen,setReviewOpen]=useState(false);
  const staffActivityView=tab==="Atividades"&&(viewRole==="teacher"||viewRole==="management");
  const needsStudy=( ["Meu painel","Atividades","Histórico","Relatórios","Correções"].includes(tab)&&!staffActivityView)||reviewOpen;
  const needsCurriculum=needsStudy||staffActivityView||tab==="Módulos e atividades";
  const needsAttendance=["Meu painel","Relatórios"].includes(tab)||(viewRole==="teacher"&&["Chamada","Chamadas","Diário e presença","Histórico"].includes(tab));
  const members = useQuery({
    queryKey: ["modules", "ebd-directory", c.id],
    queryFn: () =>
      moduleRpc<EbdMember[]>("ebd_directory", { target_class: c.id }),
  });
  const modules = useModuleRows<EbdModule>("ebd_modules", "position", [
    "class_id",
    c.id,
  ],needsCurriculum);
  const activities = useModuleRows<Activity>("ebd_activities", "position",undefined,needsCurriculum),
    submissions = useModuleRows<Submission>("ebd_submissions", "created_at",undefined,needsStudy),
    attendance = useModuleRows<Attendance>("ebd_attendance", "lesson_date", [
      "class_id",
      c.id,
    ],needsAttendance),
    recordings = useModuleRows<Recording>("ebd_recordings", "lesson_date", [
      "class_id",
      c.id,
    ],tab==="Gravações");
  const [studentId, setStudentId] = useState(personId),
    [active, setActive] = useState<Activity | null>(null);
  const legacy = useModuleRows<LegacyHistory>(
    "ebd_legacy_history",
    "created_at",
    ["class_id", c.id],
    needsStudy,
  );
  const teacher = viewRole === "teacher";
  const managementView = viewRole === "management";
  const guardianView = viewRole === "guardian";
  const currentLessons =
    activities.data?.filter((a) =>
      modules.data?.some((m) => m.id === a.module_id),
    ) ?? [];
  const legacyLessons: Activity[] = (legacy.data ?? []).map((h) => ({
    id: "legacy:" + h.id,
    module_id: "legacy",
    title: h.title + " · Histórico importado",
    kind: h.kind,
    body: "",
    passages: "",
    video_url: "",
    questions: [{ prompt: h.question || "Resposta", type: "text" }],
    available_on: h.created_at.slice(0, 10),
    due_on: null,
    published: false,
    minimum_seconds: 0,
  }));
  const legacySubmissions: Submission[] = (legacy.data ?? []).map((h) => ({
    source:"legacy",
    legacy_score:h.score_original,
    legacy_scale:h.score_scale,
    id: h.id,
    activity_id: "legacy:" + h.id,
    person_id: h.person_id,
    answers: { 0: h.answer },
    status: ["pending","pending_review"].includes(h.status)?"pending":h.status === "graded" || h.score !== null ? "graded" : "pending",
    score: h.score,
    teacher_comment: h.teacher_comment,
    teacher_id: h.teacher_id??null,
    student_reply: h.student_reply,
    created_at: h.created_at,
    graded_at: null,
  }));
  const lessons = [...currentLessons, ...legacyLessons],
    roster = members.data ?? [],
    visibleRoster = guardianView ? roster.filter(member=>guardianStudentIds.includes(member.person_id)) : roster,
    delivered = [
      ...(submissions.data?.filter((s) =>
        currentLessons.some((a) => a.id === s.activity_id) && visibleRoster.some(member=>member.person_id===s.person_id),
      ) ?? []),
      ...legacySubmissions.filter(submission=>visibleRoster.some(member=>member.person_id===submission.person_id)),
    ];
  const students = visibleRoster.filter((m) => m.role === "student"||m.role==="historical"),
    viewing = students.find((s) => s.person_id === studentId) ?? students[0],
    mine = viewRole === "student" ? visibleRoster.find((m) => m.person_id === personId && m.role === "student") : undefined;
  const studentOverview=(<>
                    {viewing && students.length>1 && (
                      <label className="icabv-field">
                        Acompanhar aluno
                        <select
                          value={viewing.person_id}
                          aria-label="Acompanhar aluno"
                          onChange={(e) => setStudentId(e.target.value)}
                        >
                          {students.map((s) => (
                            <option key={s.person_id} value={s.person_id}>
                              {s.full_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  {viewing && (
                    <StudentPanel
                      person={viewing}
                      own={viewRole === "student" && viewing.person_id === personId}
                      submissions={delivered}
                      attendance={attendance.data ?? []}
                      activities={lessons}
                      modules={modules.data ?? []}
                    />
                  )}
                  {!viewing&&<p className="church-empty">Ainda não há alunos vinculados para acompanhar nesta turma.</p>}
                  </>);
  return (
    <ModuleState query={members}>
      <ModuleState query={needsCurriculum?modules:{...modules,isPending:false,error:null}}>
        <ModuleState query={needsCurriculum?activities:{...activities,isPending:false,error:null}}>
          <ModuleState loadingLabel="Carregando atividades entregues…" query={needsStudy?submissions:{...submissions,isPending:false,error:null}}>
            <ModuleState query={needsAttendance?attendance:{...attendance,isPending:false,error:null}}>
            <ModuleState loadingLabel="Carregando histórico da turma…" query={needsStudy?legacy:{...legacy,isPending:false,error:null}}>
              {tab === "Meu painel" && (
                <>
                  <section className="icabv-card ebd-class-overview">
                    <div className="module-row">
                      <h2>{c.name}</h2>
                      <span className="ebd-badge">
                        {viewRole==="teacher"?"Professor":managementView?"Gestão · visualização":guardianView?"Pai/responsável":"Aluno"}
                      </span>
                    </div>
                    {teacher&&<p>
                      {modules.data?.filter((m) => !m.archived).length ?? 0}{" "}
                      módulos · {students.length} {students.length===1?"aluno visível":"alunos visíveis"} para seu
                      perfil
                    </p>}
                    <div className="ebd-shortcuts">{(teacher?[["Diário e presença","Fazer chamada",ClipboardCheck],["Correções",`${delivered.filter(s=>s.status==="pending").length} para corrigir`,MessageSquare],["Módulos e atividades","Gerenciar atividades",BookOpen]] as const:mine?[["Atividades","Continuar estudos",BookOpen]] as const:[["Histórico","Notas e comentários",MessageSquare],["Gravações","Assistir às aulas",GraduationCap]] as const).map(([destination,label,Icon])=><button className="secondary" key={destination} onClick={()=>onChangeTab(destination)}><Icon size={18} aria-hidden="true"/>{label}</button>)}</div>
                  </section>
                  {teacher?<Disclosure title="Acompanhar aluno" description={viewing?.full_name}>{studentOverview}</Disclosure>:<div className="ebd-student-context">{studentOverview}</div>}
                </>
              )}
              {tab === "Atividades" && (teacher||managementView ? <div className="ebd-staff-activities"><EbdWeeklyActivityTable classId={c.id} students={students} activities={lessons}/>{managementView&&canManageActivities&&<Disclosure lazy title="Gerenciar módulos e atividades" description="Publicar e organizar os estudos"><ActivityManagement schoolClass={c} modules={modules.data??[]} activities={lessons}/></Disclosure>}{teacher&&<Disclosure lazy onOpenChange={setReviewOpen} title="Correções" description={`${delivered.filter(s=>s.status==="pending").length} atividades aguardando revisão`}><Grading submissions={delivered} activities={lessons} members={visibleRoster}/></Disclosure>}</div> : active ? <ActivityExecutor key={active.id} activity={active} onClose={()=>setActive(null)}/> : <EbdActivityModules modules={modules.data??[]} activities={lessons} submissions={delivered} mine={mine} personId={personId} onStart={setActive}/>) }
              {tab === "Gravações" && (
                <Recordings
                  schoolClass={c}
                  teacher={teacher}
                  recordings={recordings.data ?? []}
                  query={recordings}
                />
              )}
              {tab === "Histórico" && teacher&&<EbdAnnualHistoryChart members={students.filter(student=>student.role==="student")} submissions={delivered} attendance={attendance.data??[]} activities={lessons}/>}
              {tab === "Histórico" && (
                <SubmissionHistory
                  submissions={delivered}
                  activities={lessons}
                  members={visibleRoster}
                  personId={personId}
                  readOnly={managementView || guardianView}
                />
              )}
              {tab === "Relatórios" && (
                <EbdReports
                  schoolClass={c}
                  members={students}
                  submissions={delivered}
                  activities={lessons}
                  attendance={attendance.data ?? []}
                />
              )}
              {(tab === "Chamada" || tab === "Chamadas" || tab === "Diário e presença") && teacher && (
                <AttendanceBook
                  schoolClass={c}
                  students={students.filter(s=>s.role==="student")}
                  attendance={attendance.data ?? []}
                  teacherId={personId}
                  teacherName={roster.find(member=>member.person_id===personId)?.full_name??roster.find(member=>member.role==="teacher")?.full_name??"Professor"}
                  onDirtyChange={onAttendanceDirtyChange}
                />
              )}
              {tab === "Correções" && teacher && (
                <Grading
                  submissions={delivered}
                  activities={lessons}
                  members={visibleRoster}
                />
              )}
              {tab === "Módulos e atividades" && teacher && (
                <ActivityManagement
                  schoolClass={c}
                  modules={modules.data ?? []}
                  activities={lessons}
                />
              )}
            </ModuleState></ModuleState>
          </ModuleState>
        </ModuleState>
      </ModuleState>
    </ModuleState>
  );
}
function StudentPanel({
  person,
  own,
  submissions,
  attendance,
  activities,
  modules,
}: {
  person: EbdMember;
  own: boolean;
  submissions: Submission[];
  attendance: Attendance[];
  activities: Activity[];
  modules: EbdModule[];
}) {
  const action = useModuleAction();
  const current = modules.find((m) => m.id === person.module_id),
    stats = studentSummary(
      person.person_id,
      submissions,
      attendance,
      activities,
    ),
    year = String(new Date().getFullYear());
  return (
    <>
      <div className="module-stats ebd-stats">
        <article className="icabv-card">
          <span>Atividades entregues</span>
          <strong>{stats.submitted}</strong>
          <small>{stats.pending} aguardando correção</small>
        </article>
        <article className="icabv-card">
          <span>Média das atividades</span>
          <strong>{stats.average?.toFixed(1) ?? "—"}</strong>
          <small>Escala de 0 a 10</small>
        </article>
        <article className="icabv-card">
          <span>Presença registrada</span>
          <strong>
            {stats.present}/{stats.lessons}
          </strong>
          <small>Aulas com registro</small>
        </article>
      </div>
      <EbdStudyWeek personId={person.person_id} submissions={submissions}/>
      <section className="icabv-card">
        <h2>Jornada de {person.full_name}</h2>
        <p>
          Módulo atual: {current?.title ?? "Não definido"} · Próximo:{" "}
          {modules.find((m) => m.id === person.next_module_id)?.title ??
            "Não definido"}
        </p>
        <p>Leitura em grupos de {person.reading_group_size} capítulo(s).</p>
        {action.notice}
        {own && current && person.next_module_id && (
          <button
            className="primary"
            disabled={
              action.busy ||
              !activities.some(
                (a) => a.module_id === current.id && a.published,
              ) ||
              activities.some(
                (a) =>
                  a.module_id === current.id &&
                  a.published &&
                  !submissions.some(
                    (s) =>
                      s.person_id === person.person_id &&
                      s.activity_id === a.id,
                  ),
              )
            }
            onClick={() =>
              void action.act(
                () =>
                  moduleRpc("advance_ebd_module", {
                    target_class: current.class_id,
                  }),
                "Você avançou para o próximo módulo.",
              )
            }
          >
            Avançar para o próximo módulo
          </button>
        )}
        {activities.filter((a) => a.published).length > 0 && (
          <>
            <label>
              Atividades concluídas
              <progress
                max={activities.filter((a) => a.published).length}
                value={
                  submissions.filter((s) => s.person_id === person.person_id)
                    .length
                }
              />
            </label>
            <p>O progresso considera as atividades publicadas na turma.</p>
          </>
        )}
        <Disclosure title={`Progresso anual · ${year}`} description="Entregas por mês">
        <div className="module-year-chart">
          {Array.from({ length: 12 }, (_, i) => {
            const month = year + "-" + String(i + 1).padStart(2, "0"),
              s = studentSummary(
                person.person_id,
                submissions,
                attendance,
                activities,
                month,
              );
            return (
              <div key={month}>
                <span>
                  {new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(
                    new Date(Number(year), i, 1),
                  )}
                </span>
                <meter
                  min={0}
                  max={Math.max(
                    1,
                    ...Array.from(
                      { length: 12 },
                      (_, i) =>
                        submissions.filter(
                          (s) =>
                            s.person_id === person.person_id &&
                            s.created_at.startsWith(
                              year + "-" + String(i + 1).padStart(2, "0"),
                            ),
                        ).length,
                    ),
                  )}
                  value={s.submitted}
                />
                <strong>{s.submitted}</strong>
              </div>
            );
          })}
        </div>
        </Disclosure>
      </section>
    </>
  );
}
function ActivityExecutor({
  activity: a,
  onClose,
}: {
  activity: Activity;
  onClose: () => void;
}) {
  const action = useModuleAction(),
    [answers, setAnswers] = useState<Record<string, string | number>>({}),
    [clock, setClock] = useState(() => Date.now()),
    [submitted, setSubmitted] = useState(false);
  const startRequest=useRef<Promise<string>|null>(null);
  const start = useQuery({
    queryKey: ["modules", "ebd-start", a.id],
    queryFn: () => {
      // The idempotent start is a write. Reuse it during global query invalidations.
      startRequest.current??=moduleRpc<string>("start_ebd_activity",{activity:a.id});
      return startRequest.current;
    },
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = start.data
    ? Math.max(
        0,
        Math.ceil(
          (new Date(start.data).getTime() + a.minimum_seconds * 1000 - clock) /
            1000,
        ),
      )
    : a.minimum_seconds;
  if (submitted)
    return (
      <section className="icabv-card">
        <h2>Atividade enviada</h2>
        <p>
          Sua resposta foi salva. Acompanhe a nota e os comentários em
          Histórico.
        </p>
        <button className="primary" onClick={onClose}>
          Voltar às atividades
        </button>
      </section>
    );
  return (
    <section className="icabv-card ebd-executor">
      <div className="module-row">
        <h2>{a.title}</h2>
        <button className="secondary" onClick={onClose}>
          Voltar às atividades
        </button>
      </div>
      <p>{kindLabel[a.kind]}</p>
      <div className="module-prose">{a.body}</div>
      {a.passages && (
        <p>
          <strong>Leitura:</strong> {a.passages}. Consulte a aba Bíblia para ler
          os capítulos.
        </p>
      )}
      {safeHttps(a.video_url) && (
        <a
          className="secondary"
          href={a.video_url}
          target="_blank"
          rel="noreferrer"
        >
          Assistir ao vídeo da atividade
        </a>
      )}
      <ModuleState query={{...start,refetch:()=>{startRequest.current=null;return start.refetch();}}}>
        <p className="ebd-study-clock" role="timer" aria-live="off">
          {remaining > 0
            ? `Tempo de estudo restante: ${remaining}s`
            : "Você já pode enviar suas respostas."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action
              .act(
                () =>
                  moduleRpc("submit_ebd_activity", {
                    activity: a.id,
                    responses: answers,
                  }),
                "Atividade enviada.",
              )
              .then((ok) => {
                if (ok) setSubmitted(true);
              });
          }}
        >
          {a.questions.map((q, i) => (
            <fieldset key={i}>
              <legend>
                {i + 1}. {q.prompt}
              </legend>
              {q.type === "choice" ? (
                q.options?.map((option, n) => (
                  <label className="module-choice" key={n}>
                    <input
                      type="radio"
                      required
                      name={"question-" + i}
                      value={n}
                      checked={answers[i] === n}
                      onChange={() => setAnswers({ ...answers, [i]: n })}
                    />
                    {option}
                  </label>
                ))
              ) : (
                <textarea
                  aria-label={q.prompt}
                  required
                  maxLength={6000}
                  value={String(answers[i] ?? "")}
                  onChange={(e) =>
                    setAnswers({ ...answers, [i]: e.target.value })
                  }
                />
              )}
            </fieldset>
          ))}
          {!a.questions.length && (
            <label className="icabv-field">
              O que você aprendeu?
              <textarea
                required
                maxLength={6000}
                value={String(answers.reflection ?? "")}
                onChange={(e) =>
                  setAnswers({ ...answers, reflection: e.target.value })
                }
              />
            </label>
          )}
          {action.notice}
          <p className="ebd-muted">{a.questions.length?`${Object.keys(answers).length} de ${a.questions.length} perguntas preenchidas`:"Escreva sua reflexão antes de enviar."}</p>
          <button className="primary" disabled={action.busy || remaining > 0}>
            Enviar atividade
          </button>
        </form>
      </ModuleState>
    </section>
  );
}
function SubmissionHistory({
  submissions,
  activities,
  members,
  personId,
  readOnly = false,
}: {
  submissions: Submission[];
  activities: Activity[];
  members: EbdMember[];
  personId: string;
  readOnly?: boolean;
}) {
  const action = useModuleAction(), [search, setSearch] = useState("");
  return (
    <>
      {action.notice}
      <h2>Histórico de atividades</h2>
      <SearchField label="Buscar no histórico" value={search} onChange={setSearch} />
      <PagedList label="atividades entregues" resetKey={personId + search} empty={submissions.length ? undefined : "Nenhuma atividade entregue."}>
      {[...submissions].reverse().filter(s => searchText((activities.find(a => a.id === s.activity_id)?.title ?? "Atividade") + " " + (members.find(m => m.person_id === s.person_id)?.full_name ?? "") + " " + s.created_at).includes(searchText(search))).map((s) => (
        <section className="icabv-card" key={s.id}>
          <h3>
            {activities.find((a) => a.id === s.activity_id)?.title ??
              "Atividade"}
          </h3>
          <p>
            {members.find((m) => m.person_id === s.person_id)?.full_name ??
              "Aluno"}{" "}
            · {ebdDate(s.created_at)} ·{" "}
            {s.status === "graded" ? `Nota ${s.score}` : "Aguardando correção"}
          </p>
          <Disclosure title="Ver respostas e comentários">
          <Answers
            submission={s}
            activity={activities.find((a) => a.id === s.activity_id)}
          />
          {s.teacher_comment && (
            <p>
              <strong>Professor:</strong> {s.teacher_comment}
            </p>
          )}
          {s.student_reply && (
            <p>
              <strong>Resposta do aluno:</strong> {s.student_reply}
            </p>
          )}
          {!readOnly && s.person_id === personId && s.status === "graded" && (
            <ModuleForm
              key={s.id}
              title="Responder ao professor"
              fields={[
                {
                  name: "reply",
                  label: "Seu comentário",
                  type: "textarea",
                  required: true,
                },
              ]}
              initial={{ reply: s.student_reply }}
              busy={action.busy}
              onSave={(v) =>
                action.act(() =>
                  moduleRpc(
                    (s.source==="legacy"||s.activity_id.startsWith("legacy:"))
                      ? "reply_ebd_history"
                      : "reply_ebd_submission",
                    { submission: s.id, reply: v.reply },
                  ),
                )
              }
            />
          )}
          </Disclosure>
        </section>
      ))}
      </PagedList>

    </>
  );
}
function EbdAnnualHistoryChart({members,submissions,attendance,activities}:{members:EbdMember[];submissions:Submission[];attendance:Attendance[];activities:Activity[]}){
  const thisYear=today().slice(0,4),[year,setYear]=useState(thisYear),[personId,setPersonId]=useState("");
  const orderedMembers=[...members].sort((a,b)=>a.full_name.localeCompare(b.full_name,"pt-BR")),person=orderedMembers.find(member=>member.person_id===personId)??orderedMembers[0];
  const years=[...new Set([thisYear,...submissions.map(item=>item.created_at.slice(0,4)),...attendance.map(item=>item.lesson_date.slice(0,4))])].filter(value=>/^\d{4}$/.test(value)).sort((a,b)=>b.localeCompare(a));
  const excludedKinds=["class_evaluation","sunday_presence","daily_grade","weekly_grade"];
  const entries=person?submissions.filter(item=>item.person_id===person.person_id&&item.created_at.startsWith(year+"-")&&!excludedKinds.includes(activities.find(activity=>activity.id===item.activity_id)?.kind??"")):[];
  const monthly=Array.from({length:12},(_,index)=>{
    const month=year+"-"+String(index+1).padStart(2,"0"),lessons=person?attendance.filter(item=>item.person_id===person.person_id&&item.lesson_date.startsWith(month)):[];
    return {label:new Intl.DateTimeFormat("pt-BR",{month:"short",timeZone:"UTC"}).format(new Date(Date.UTC(Number(year),index,1))).replace(".",""),activities:entries.filter(item=>item.created_at.startsWith(month)).length,present:lessons.filter(item=>item.present).length,lessons:lessons.length};
  });
  const maxActivities=Math.max(1,...monthly.map(item=>item.activities));
  return <section className="icabv-card ebd-annual-history" aria-labelledby="ebd-annual-history-title">
    <div className="module-row"><div><h2 id="ebd-annual-history-title">Presenças e atividades no ano</h2><p>Resumo mensal por aluno.</p></div><div className="module-filters"><label className="icabv-field">Aluno<select value={person?.person_id??""} onChange={event=>setPersonId(event.target.value)} disabled={!orderedMembers.length}>{orderedMembers.map(member=><option key={member.person_id} value={member.person_id}>{member.full_name}</option>)}</select></label><label className="icabv-field">Ano<select value={year} onChange={event=>setYear(event.target.value)}>{years.map(value=><option key={value} value={value}>{value}</option>)}</select></label></div></div>
    {!person?<p className="church-empty">Nenhum aluno vinculado a esta turma.</p>:<>
      <div className="ebd-history-legend"><span><i className="is-activity"/>Atividades enviadas</span><span><i className="is-presence"/>Presença nas aulas</span></div>
      <div className="ebd-annual-chart" role="list" aria-label={`${person.full_name}: atividades e presenças por mês em ${year}`}>
        {monthly.map(item=>{const presence=item.lessons?Math.round(item.present/item.lessons*100):0,activityHeight=Math.round(item.activities/maxActivities*100);return <div className="ebd-annual-month" role="listitem" key={item.label}>
          <div className="ebd-annual-bars" role="img" aria-label={`${item.label}: ${item.activities} atividades, ${item.present} presenças em ${item.lessons} aulas`} title={`${item.label}: ${item.activities} atividades · ${item.present}/${item.lessons} presenças`}><span className="is-activity" style={{height:`${activityHeight}%`}}/><span className="is-presence" style={{height:`${presence}%`}}/></div>
          <strong>{item.label}</strong><small>{item.activities} · {item.present}/{item.lessons}</small>
        </div>;})}
      </div>
      <p className="ebd-annual-chart-note">Atividades · presenças/aulas registradas</p>
    </>}
  </section>;
}
function Answers({
  submission: s,
  activity: a,
}: {
  submission: Submission;
  activity?: Activity;
}) {
  return (
    <div className="ebd-answers">
      <h3>Respostas enviadas</h3>
      {Object.entries(s.answers).map(([key, value]) => (
        <p key={key}>
          <strong>{a?.questions[Number(key)]?.prompt ?? "Reflexão"}:</strong>{" "}
          {typeof value === "number"
            ? (a?.questions[Number(key)]?.options?.[value] ?? value)
            : value}
        </p>
      ))}
    </div>
  );
}
function Grading({
  submissions,
  activities,
  members,
}: {
  submissions: Submission[];
  activities: Activity[];
  members: EbdMember[];
}) {
  const [pending, setPending] = useState(true),[search,setSearch]=useState(""),[selected,setSelected]=useState<Submission|null>(null),
    action = useModuleAction();
  return (
    <>
      {action.notice}
      <h2>Correção de atividades</h2>
      <SearchField label="Buscar correções" value={search} onChange={setSearch}/>
      <label className="module-choice">
        <input
          type="checkbox"
          checked={pending}
          onChange={(e) => setPending(e.target.checked)}
        />
        Apenas atividades sem correção
      </label>
      <PagedList label="respostas para corrigir" resetKey={String(pending)+search} empty="Nenhuma resposta para corrigir com este filtro.">
      {submissions
        .filter((s) => (!pending || s.status === "pending")&&searchText((members.find(m=>m.person_id===s.person_id)?.full_name??"")+" "+(activities.find(a=>a.id===s.activity_id)?.title??"")).includes(searchText(search)))
        .map((s) => (
          <section className="icabv-card" key={s.id}>
            <h2>
              {members.find((m) => m.person_id === s.person_id)?.full_name ??
                "Aluno"}{" "}
              · {activities.find((a) => a.id === s.activity_id)?.title}
            </h2>
            <p className="ebd-muted">{ebdDate(s.created_at)} · {s.status==="graded"?`Nota ${s.score}`:"Aguardando correção"}</p>
            <button className="secondary" onClick={()=>setSelected(s)}>{s.status==="graded"?"Revisar avaliação":"Avaliar atividade"}</button>
          </section>
        ))}
      </PagedList>
      {selected&&<ModuleDialog title="Avaliar atividade" onClose={()=>setSelected(null)}><section className="icabv-card ebd-grading-editor"><h3>{members.find(m=>m.person_id===selected.person_id)?.full_name} · {activities.find(a=>a.id===selected.activity_id)?.title}</h3>{action.notice}<Answers submission={selected} activity={activities.find(a=>a.id===selected.activity_id)}/>
            <ModuleForm
              title="Avaliação do professor"
              initial={{ grade: selected.score, comment: selected.teacher_comment }}
              fields={[
                {
                  name: "grade",
                  label: "Nota (0 a 10)",
                  type: "number",
                  min: 0,
                  max: 10,
                  step: "0.1",
                  required: true,
                },
                {
                  name: "comment",
                  label: "Comentário do professor",
                  type: "textarea",
                },
              ]}
              busy={action.busy}
              onCancel={()=>setSelected(null)}
              onSave={async(v) =>{
                const ok=await action.act(() =>
                  moduleRpc(
                    (selected.source==="legacy"||selected.activity_id.startsWith("legacy:"))
                      ? "grade_ebd_history"
                      : "grade_ebd_submission",
                    { submission: selected.id, grade: v.grade, comment: v.comment },
                  ),
                );if(ok)setSelected(null);return ok;}}
            />
            {selected.student_reply&&<p>Aluno: {selected.student_reply}</p>}
        </section></ModuleDialog>}
    </>
  );
}
function AttendanceBook({
  schoolClass: c,
  students,
  attendance,
  teacherId,
  teacherName,
  onDirtyChange,
}: {
  schoolClass: EbdClass;
  students: EbdMember[];
  attendance: Attendance[];
  teacherId:string;
  teacherName:string;
  onDirtyChange:(dirty:boolean)=>void;
}) {
  type AttendanceDraft = { present: boolean; criteria: Record<string, boolean> };
  const [date,setDate]=useState(today()),[topic,setTopic]=useState(""),[topicWarning,setTopicWarning]=useState(""),[draft,setDraft]=useState<Record<string,AttendanceDraft>>({}),action=useModuleAction();
  const sessions=useModuleRows<LessonSession>("ebd_lesson_sessions","lesson_date",["class_id",c.id]);
  const session=sessions.data?.find(item=>item.lesson_date===date);
  useEffect(()=>{setTopic(session?.topic??"");setDraft({});},[c.id,date,session?.id,session?.topic]);
  const recordFor=(student:EbdMember)=>attendance.find(item=>item.person_id===student.person_id&&item.lesson_date===date);
  const valueFor=(student:EbdMember):AttendanceDraft=>draft[student.person_id]??{present:recordFor(student)?.present??false,criteria:recordFor(student)?.criteria??{}};
  const criteria=c.criteria.filter((criterion)=>criterion.trim());
  const topicDirty=topic!==(session?.topic??"");
  const hasChanges=Object.keys(draft).length>0||topicDirty;
  useEffect(()=>{onDirtyChange(hasChanges);return()=>onDirtyChange(false);},[hasChanges,onDirtyChange]);
  const saveAll=async()=>{
    if(!topic.trim()){setTopicWarning("Informe o tema da aula antes de salvar.");return;}
    setTopicWarning("");
    if(!hasChanges)return;
    const ok=await action.act(async()=>{
      const operations=[];
      for(const [personId,value] of Object.entries(draft)){
        const record=attendance.find(item=>item.person_id===personId&&item.lesson_date===date);
        operations.push(supabase!.from("ebd_attendance").upsert({...(record?{id:record.id}:{}),class_id:c.id,person_id:personId,lesson_date:date,present:value.present,score:record?.score??null,note:record?.note??"",criteria:value.criteria},{onConflict:"class_id,person_id,lesson_date"}));
      }
      if(topicDirty)operations.push(supabase!.from("ebd_lesson_sessions").upsert({...(session?{id:session.id}:{}),class_id:c.id,lesson_date:date,teacher_id:teacherId,topic},{onConflict:"class_id,lesson_date"}));
      const results=await Promise.all(operations),failed=results.find(result=>result.error);
      if(failed?.error)throw failed.error;
      return {error:null};
    },"Chamada e tema salvos.");
    if(ok){setDraft({});onDirtyChange(false);}
  };
  const marked=(student:EbdMember,criterion:string|null)=>{
    const current=valueFor(student);
    return criterion?!!current.criteria[criterion]:current.present;
  };
  const toggleMark=(student:EbdMember,criterion:string|null)=>setDraft(previous=>{
    const id=student.person_id,record=recordFor(student),baseline:AttendanceDraft={present:record?.present??false,criteria:record?.criteria??{}},current=previous[id]??baseline;
    const next=criterion?{...current,criteria:{...current.criteria,[criterion]:!current.criteria[criterion]}}:{...current,present:!current.present};
    const same=next.present===baseline.present&&Object.keys({...baseline.criteria,...next.criteria}).every(key=>!!next.criteria[key]===!!baseline.criteria[key]);
    if(same){const rest={...previous};delete rest[id];return rest;}
    return {...previous,[id]:next};
  });
  const toggleColumn=(criterion:string|null)=>setDraft(previous=>{
    const isMarked=(student:EbdMember)=>{const baseline=recordFor(student),current=previous[student.person_id]??{present:baseline?.present??false,criteria:baseline?.criteria??{}};return criterion?!!current.criteria[criterion]:current.present;};
    const markAll=students.length>0&&!students.every(isMarked),next={...previous};
    for(const student of students){
      const id=student.person_id,record=recordFor(student),baseline:AttendanceDraft={present:record?.present??false,criteria:record?.criteria??{}},current=next[id]??baseline;
      const value=criterion?{...current,criteria:{...current.criteria,[criterion]:markAll}}:{...current,present:markAll};
      const same=value.present===baseline.present&&Object.keys({...baseline.criteria,...value.criteria}).every(key=>!!value.criteria[key]===!!baseline.criteria[key]);
      if(same)delete next[id];else next[id]=value;
    }
    return next;
  });
  const markButton=(student:EbdMember,criterion:string|null,label:string)=><button type="button" className={`ebd-attendance-mark${marked(student,criterion)?" is-marked":""}`} aria-label={`${student.full_name}: ${label} ${marked(student,criterion)?"registrado":"não registrado"}`} aria-pressed={marked(student,criterion)} disabled={action.busy} onClick={()=>toggleMark(student,criterion)}><span aria-hidden="true"/></button>;
  return (
    <>
      {action.notice}
      <ModuleState query={sessions}>
        <section className="icabv-card ebd-attendance-sheet">
          <div className="ebd-attendance-meta">
            <label className="icabv-field">Selecionar dia<input type="date" value={date} onChange={event=>{if(hasChanges&&!window.confirm("Há alterações que ainda não foram salvas. Deseja descartá-las e selecionar outro dia?"))return;setDraft({});onDirtyChange(false);setDate(event.target.value);}}/></label>
            <label className="icabv-field">Professor<input value={teacherName} readOnly/></label>
            <label className="icabv-field ebd-lesson-topic">Tema da aula<input value={topic} maxLength={200} disabled={action.busy} aria-invalid={!!topicWarning} aria-describedby={topicWarning?"ebd-topic-warning":undefined} onChange={event=>{setTopic(event.target.value);if(event.target.value.trim())setTopicWarning("");}} placeholder="Digite o tema da aula"/></label>
          </div>
          <div className="ebd-attendance-counts" role="status"><span>{students.filter(student=>marked(student,null)).length} presentes</span><span>{students.length-students.filter(student=>marked(student,null)).length} ausentes</span>{hasChanges&&<span>Alterações pendentes</span>}</div>
          <div className="ebd-attendance-table-scroll" role="region" aria-label={`Chamada de ${c.name} em ${date}`} tabIndex={0}>
            <table className="ebd-attendance-table" style={{"--ebd-criterion-count":Math.max(criteria.length,1)} as React.CSSProperties}><caption className="sr-only">Presença e critérios da aula de {date}</caption><thead><tr><th scope="col">Aluno</th><th scope="col"><span>Presença</span><button type="button" className="ebd-mark-column" onClick={()=>toggleColumn(null)} disabled={!students.length||action.busy} aria-pressed={students.length>0&&students.every(student=>marked(student,null))} aria-label={`${students.length>0&&students.every(student=>marked(student,null))?"Desmarcar":"Marcar"} presença de todos`} title="Marcar ou desmarcar todos"><Check size={13} aria-hidden="true"/></button></th>{criteria.map((criterion,index)=><th scope="col" key={`${criterion}-${index}`}><span title={criterion}>{criterion}</span><button type="button" className="ebd-mark-column" onClick={()=>toggleColumn(criterion)} disabled={!students.length||action.busy} aria-pressed={students.length>0&&students.every(student=>marked(student,criterion))} aria-label={`${students.length>0&&students.every(student=>marked(student,criterion))?"Desmarcar":"Marcar"} ${criterion} de todos`} title="Marcar ou desmarcar todos"><Check size={13} aria-hidden="true"/></button></th>)}</tr></thead><tbody>
              {[...students].sort((a,b)=>a.full_name.localeCompare(b.full_name,"pt-BR")).map(student=><tr key={student.person_id}><th scope="row">{student.full_name}</th><td>{markButton(student,null,"presença")}</td>{criteria.map((criterion)=><td key={criterion}>{markButton(student,criterion,criterion)}</td>)}</tr>)}
            </tbody></table>
          </div>
          {!students.length&&<p className="church-empty">Vincule os alunos à turma para preencher a chamada.</p>}
          <p className="ebd-attendance-hint">As marcações e o tema da aula ficam pendentes até serem salvos.</p>
          {topicWarning&&<p className="ebd-topic-warning" id="ebd-topic-warning" role="alert">{topicWarning}</p>}
          <button type="button" className="primary ebd-save-attendance" aria-label="Salvar chamada e tema da aula" disabled={!hasChanges||action.busy} onClick={()=>void saveAll()}>{action.busy?"Salvando…":"Salvar"}</button>
        </section>
      </ModuleState>
    </>
  );
}
function EbdReports({
  schoolClass: c,
  members,
  submissions,
  activities,
  attendance,
}: {
  schoolClass: EbdClass;
  members: EbdMember[];
  submissions: Submission[];
  activities: Activity[];
  attendance: Attendance[];
}) {
  const [period, setPeriod] = useState(today().slice(0, 7)),
    [range, setRange] = useState("monthly"),
    [date, setDate] = useState(today()),[search,setSearch]=useState(""),[copyStatus,setCopyStatus]=useState("");
  const included = (value: string) =>
    range === "annual"
      ? value.startsWith(period.slice(0, 4))
      : range === "weekly"
        ? value.slice(0, 10) >= date &&
          value.slice(0, 10) <=
            new Date(Date.parse(date + "T12:00:00Z") + 6 * 86400000)
              .toISOString()
              .slice(0, 10)
        : value.startsWith(period);
  const deliveries = submissions.filter((s) => included(s.created_at)),
    lessons = attendance.filter((a) => included(a.lesson_date));
  const rows = members.map((m) => ({
    member: m,
    stats: studentSummary(m.person_id, deliveries, lessons, activities),
  }));
  return (
    <section className="icabv-card">
      <h2>Relatórios · {c.name}</h2>
      <div className="module-filters">
        <label className="icabv-field">
          Período
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensal</option>
            <option value="annual">Anual</option>
          </select>
        </label>
        {range === "weekly" ? (
          <label className="icabv-field">
            Início da semana
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        ) : (
          <label className="icabv-field">
            Mês / ano
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </label>
        )}
        <button
          className="secondary"
          onClick={() =>
            downloadData(
              "relatorio-ebd.csv",
              csvData([
                [
                  "Aluno",
                  "Entregas",
                  "Pendentes",
                  "Média",
                  "Presenças",
                  "Aulas registradas",
                  ...c.criteria,
                ],
                ...rows.map(({ member: m, stats: s }) => [
                  m.full_name,
                  s.submitted,
                  s.pending,
                  s.average?.toFixed(1),
                  s.present,
                  s.lessons,
                  ...c.criteria.map(
                    (criterion) =>
                      lessons.filter(
                        (a) =>
                          a.person_id === m.person_id && a.criteria[criterion],
                      ).length,
                  ),
                ]),
              ]),
            )
          }
        >
          Exportar relatório CSV
        </button>
        <button className="secondary" onClick={() => window.print()}>
          Imprimir relatório
        </button>
      </div>
      <SearchField label="Buscar aluno no relatório" value={search} onChange={setSearch}/>
      {copyStatus&&<p role="status">{copyStatus}</p>}
      <div className="module-table-wrap ui-responsive-table">
        <table>
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Entregas</th>
              <th>Pendentes</th>
              <th>Média</th>
              <th>Presenças</th>
              {c.criteria.map((criterion) => (
                <th key={criterion}>{criterion}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.filter(({member:m})=>searchText(m.full_name).includes(searchText(search))).map(({ member: m, stats: s }) => (
              <tr key={m.person_id}>
                <th scope="row">{m.full_name}</th>
                <td data-label="Entregas">{s.submitted}</td>
                <td data-label="Pendentes">{s.pending}</td>
                <td data-label="Média">{s.average?.toFixed(1) ?? "—"}</td>
                <td data-label="Presenças">
                  {s.present}/{s.lessons}
                </td>
                {c.criteria.map((criterion) => (
                  <td key={criterion} data-label={criterion}>
                    {
                      lessons.filter(
                        (a) =>
                          a.person_id === m.person_id && a.criteria[criterion],
                      ).length
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Disclosure title="Lembretes de acompanhamento" description="Revise e copie uma mensagem para compartilhar">
      <PagedList label="lembretes" resetKey={search}>
      {rows.filter(({member:m})=>searchText(m.full_name).includes(searchText(search))).map(({ member: m }) => {
        const last = submissions
            .filter((s) => s.person_id === m.person_id)
            .map((s) => s.created_at)
            .sort()
            .at(-1),
          message = c.whatsapp_template
            .replaceAll("{{nome}}", m.full_name)
            .replaceAll("{{classe}}", c.name)
            .replaceAll(
              "{{ultimaAtividade}}",
              last
                ? new Date(last).toLocaleDateString("pt-BR")
                : "ainda não registrada",
            );
        return (
          <details key={m.person_id}>
            <summary>
              {m.full_name} · Última entrega:{" "}
              {last
                ? new Date(last).toLocaleDateString("pt-BR")
                : "sem entrega"}
            </summary>
            <p className="module-prose">{message}</p>
            <button
              className="secondary"
              onClick={async()=>{try{await navigator.clipboard.writeText(message);setCopyStatus("Lembrete copiado. Revise antes de compartilhar.");}catch{setCopyStatus("Não foi possível copiar. Selecione o texto da mensagem e copie manualmente.");}}}
            >
              Copiar lembrete para compartilhar
            </button>
          </details>
        );
      })}
      </PagedList>
      <p>Os lembretes são preparados para revisão e compartilhamento manual.</p>
      </Disclosure>
    </section>
  );
}
function Recordings({
  schoolClass: c,
  teacher,
  recordings,
  query,
}: {
  schoolClass: EbdClass;
  teacher: boolean;
  recordings: Recording[];
  query: { isPending: boolean; error: unknown; refetch: () => unknown };
}) {
  const [search, setSearch] = useState(""),[status,setStatus]=useState("all"),[openId,setOpenId]=useState<string|null>(null), [editing, setEditing] = useState<Recording | null | undefined>(),
    action = useModuleAction();
  return (
    <>
      {editing===undefined&&action.notice}
      {teacher&&<button className="primary" onClick={()=>setEditing(null)}>Nova gravação</button>}
      {teacher && editing!==undefined&&(
        <ModuleDialog title={editing ? "Editar gravação" : "Cadastrar gravação de aula"} onClose={()=>setEditing(undefined)}>
        {action.failed&&action.notice}
        <ModuleForm
          key={editing?.id ?? "new-recording"}
          title={editing ? "Editar gravação" : "Cadastrar gravação de aula"}
          initial={{ ...editing, status: editing?.status ?? "normal", lesson_date: editing?.lesson_date ?? today() }}
          busy={action.busy}
          fields={[
            { name: "title", label: "Título da aula", required: true },
            {
              name: "lesson_date",
              label: "Data da aula",
              type: "date",
              required: true,
            },
            { name: "teacher", label: "Professor da gravação" },
            {
              name: "url",
              label: "Link HTTPS da gravação",
              type: "url",
              hint: "Opcional para aulas sem gravação ou canceladas.",
            },
            { name: "status", label: "Situação da aula", type: "select", required: true, options: [{ value: "normal", label: "Realizada / prevista" }, { value: "canceled", label: "Cancelada" }] },
            { name: "justification", label: "Motivo do cancelamento", type: "textarea" },
            {
              name: "published",
              label: "Disponível para alunos",
              type: "checkbox",
            },
          ]}
          onCancel={()=>setEditing(undefined)}
          onSave={async (v) => {
            const ok = await action.act(() =>
              supabase!.from("ebd_recordings").upsert({
                ...v,
                class_id: c.id,
                ...(editing ? { id: editing.id } : {}),
              }),
            );
            if (ok) setEditing(undefined);
            return ok;
          }}
        />
        </ModuleDialog>
      )}
      <ModuleState query={query}>
        <SearchField label="Buscar aulas" value={search} onChange={setSearch} />
        <label className="icabv-field">Situação da aula<select aria-label="Situação da aula" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">Todas</option><option value="available">Com gravação</option><option value="missing">Sem gravação</option><option value="canceled">Canceladas</option></select></label>
        <PagedList label="aulas" resetKey={c.id + search+status} empty={recordings.length ? undefined : "Nenhuma gravação disponível."}>
        {[...recordings].reverse().filter(r => searchText(r.title + " " + r.teacher + " " + r.lesson_date).includes(searchText(search))&&(status==="all"||(status==="canceled"?r.status==="canceled":r.status!=="canceled"&&(status==="available"?safeHttps(r.url):!safeHttps(r.url))))).map((r) => (
          <CompactCard key={r.id} date={r.lesson_date} title={r.title} description={`${r.teacher||"Professor não informado"} · ${r.status==="canceled"?"Aula cancelada":r.published?"Publicada":"Rascunho"}`} expanded={openId===r.id} label={`${openId===r.id?"Recolher":"Ver"} aula: ${r.title}`} onClick={()=>setOpenId(openId===r.id?null:r.id)}>
            {r.status === "canceled" && r.justification && <p>Motivo: {r.justification}</p>}
            {r.status !== "canceled" && !safeHttps(r.url) && <p>Esta aula ainda não tem um link de gravação cadastrado.</p>}
            <div className="card-actions">
              {r.status !== "canceled" && safeHttps(r.url) && (
                <a
                  className="secondary"
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Assistir à aula
                </a>
              )}
              {teacher && (
                <>
                  <button className="secondary" onClick={() => setEditing(r)}>
                    Editar gravação
                  </button>
                  <button
                    className="secondary"
                    disabled={action.busy}
                    onClick={() => {
                      if (confirm("Excluir este link de gravação?"))
                        void action.act(() =>
                          supabase!
                            .from("ebd_recordings")
                            .delete()
                            .eq("id", r.id),
                        );
                    }}
                  >
                    Excluir link
                  </button>
                </>
              )}
            </div>
          </CompactCard>
        ))}
        </PagedList>

      </ModuleState>
    </>
  );
}
function ActivityManagement({
  schoolClass: c,
  modules,
  activities,
}: {
  schoolClass: EbdClass;
  modules: EbdModule[];
  activities: Activity[];
}) {
  const [editing, setEditing] = useState<Activity | null | undefined>(),
    [search,setSearch]=useState(""),
    [moduleEdit, setModuleEdit] = useState<EbdModule | null>(null),
    action = useModuleAction();
  return (
    <>
      {action.notice}
      <Disclosure key={moduleEdit?.id??"new"} title={moduleEdit?"Editar módulo":"Criar módulo"} description="Organize o conteúdo e os limites de estudo" open={!!moduleEdit}>
      <ModuleForm
        key={moduleEdit?.id ?? "new-module"}
        title={moduleEdit ? "Editar módulo" : "Novo módulo"}
        initial={{
          ...moduleEdit,
          position: moduleEdit?.position ?? modules.length,
          daily_limit: moduleEdit?.daily_limit ?? 0,
          weekly_bible_limit: moduleEdit?.weekly_bible_limit ?? 0,
          weekly_video_limit: moduleEdit?.weekly_video_limit ?? 0,
        }}
        busy={action.busy}
        fields={[
          { name: "title", label: "Nome do módulo", required: true },
          {
            name: "description",
            label: "Descrição do módulo",
            type: "textarea",
          },
          {
            name: "position",
            label: "Ordem",
            type: "number",
            min: 0,
            required: true,
          },
          {
            name: "daily_limit",
            label: "Limite diário de atividades",
            type: "number",
            min: 0,
            max: 100,
            required: true,
            hint: "0 permite estudar sem limite diário.",
          },
          {
            name: "weekly_bible_limit",
            label: "Leituras bíblicas por semana",
            type: "number",
            min: 0,
            max: 100,
            required: true,
            hint: "0 permite leituras sem limite semanal.",
          },
          {
            name: "weekly_video_limit",
            label: "Vídeos por semana",
            type: "number",
            min: 0,
            max: 100,
            required: true,
            hint: "0 permite vídeos sem limite semanal.",
          },
          { name: "archived", label: "Módulo arquivado", type: "checkbox" },
        ]}
        onCancel={moduleEdit ? () => setModuleEdit(null) : undefined}
        onSave={async (v) => {
          const ok = await action.act(() =>
            supabase!.from("ebd_modules").upsert({
              ...v,
              class_id: c.id,
              ...(moduleEdit ? { id: moduleEdit.id } : {}),
            }),
          );
          if (ok) setModuleEdit(null);
          return ok;
        }}
      />
      </Disclosure>
      <div className="card-actions">
        <button
          className="primary"
          disabled={!modules.length}
          onClick={() => setEditing(null)}
        >
          Nova atividade
        </button>
      </div>
      {editing !== undefined && (
        <ActivityEditor
          key={editing?.id ?? "new-activity"}
          activity={editing}
          modules={modules}
          onClose={() => setEditing(undefined)}
        />
      )}{" "}
      <SearchField label="Buscar módulos e atividades" value={search} onChange={setSearch}/>
      {modules.filter(m=>!search||searchText(m.title).includes(searchText(search))||activities.some(a=>a.module_id===m.id&&searchText(a.title).includes(searchText(search)))).map((m,index) => (
        <Disclosure key={m.id} title={`${m.title}${m.archived?" · Arquivado":""}`} description={`${activities.filter(a=>a.module_id===m.id).length} atividades`} open={!!search||index===0||moduleEdit?.id===m.id}>
          <div className="module-row">
            <h2>
              {m.title}
              {m.archived && " · Arquivado"}
            </h2>
            <button className="secondary" onClick={() => setModuleEdit(m)}>
              Editar módulo
            </button>
          </div>
          <p>{m.description}</p>
          <PagedList label="atividades do módulo" resetKey={m.id+search}>
          {activities
            .filter((a) => a.module_id === m.id&&searchText(m.title+" "+a.title).includes(searchText(search)))
            .map((a) => (
              <div className="module-report-row" key={a.id}>
                <div>
                  <strong>{a.title}</strong>
                  <p>
                    {kindLabel[a.kind]} ·{" "}
                    {a.published ? "Publicada" : "Rascunho"} · {a.available_on}
                  </p>
                </div>
                <button className="secondary" onClick={() => setEditing(a)}>
                  Editar atividade
                </button>
              </div>
            ))}
          </PagedList>
        </Disclosure>
      ))}
    </>
  );
}
function ActivityEditor({
  activity,
  modules,
  onClose,
}: {
  activity: Activity | null;
  modules: EbdModule[];
  onClose: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>(
      activity?.questions ?? [],
    ),
    [keys, setKeys] = useState<Record<string, number>>({});
  const action = useModuleAction();
  const answerKeys = useQuery({
    queryKey: ["modules", "ebd-key", activity?.id],
    enabled: !!activity,
    queryFn: async () => {
      const r = await supabase!
        .from("ebd_activity_keys")
        .select("answers")
        .eq("activity_id", activity!.id)
        .single();
      if (r.error) throw r.error;
      return r.data.answers as Record<string, number>;
    },
  });
  return (
    <ModuleDialog title={activity ? "Editar atividade" : "Nova atividade"} onClose={onClose}><section className="icabv-card ebd-activity-editor">
      {action.notice}
      {activity && answerKeys.isPending ? (
        <p>Carregando gabarito…</p>
      ) : activity && answerKeys.error ? (
        <p role="alert">
          Não foi possível carregar o gabarito. Feche e tente novamente.
        </p>
      ) : (
        <>
          <h3>Perguntas</h3>
          {questions.map((q, i) => (
            <Disclosure key={i} title={`Pergunta ${i + 1}`} description={q.prompt || "Escreva o enunciado"} open={i === 0 || !q.prompt}><fieldset>
              <legend>Pergunta {i + 1}</legend>
              <label className="icabv-field">
                Enunciado
                <input
                  value={q.prompt}
                  aria-label="Enunciado"
                  maxLength={2000}
                  onChange={(e) =>
                    setQuestions(
                      questions.map((v, n) =>
                        n === i ? { ...v, prompt: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <label className="icabv-field">
                Tipo de resposta
                <select
                  value={q.type}
                  aria-label="Tipo de resposta"
                  onChange={(e) =>
                    setQuestions(
                      questions.map((v, n) =>
                        n === i
                          ? {
                              ...v,
                              type: e.target.value as Question["type"],
                              options:
                                e.target.value === "choice"
                                  ? ["", ""]
                                  : undefined,
                            }
                          : v,
                      ),
                    )
                  }
                >
                  <option value="text">Texto livre</option>
                  <option value="choice">Múltipla escolha</option>
                </select>
              </label>
              {q.type === "choice" && (
                <>
                  <label className="icabv-field">
                    Alternativas (uma por linha)
                    <textarea
                      value={q.options?.join("\n")}
                      aria-label="Alternativas (uma por linha)"
                      onChange={(e) =>
                        setQuestions(
                          questions.map((v, n) =>
                            n === i
                              ? { ...v, options: e.target.value.split("\n") }
                              : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="icabv-field">
                    Alternativa correta
                    <select
                      value={keys[i] ?? answerKeys.data?.[i] ?? 0}
                      aria-label="Alternativa correta"
                      onChange={(e) =>
                        setKeys({ ...keys, [i]: Number(e.target.value) })
                      }
                    >
                      {q.options?.map((o, n) => (
                        <option value={n} key={n}>
                          {n + 1}. {o}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <button
                className="secondary"
                onClick={() => {
                  if ((q.prompt.trim() || q.options?.some(o => o.trim())) && !window.confirm("Remover esta pergunta e suas alternativas da edição?")) return;
                  setQuestions(questions.filter((_, n) => n !== i));
                  setKeys(
                    Object.fromEntries(
                      questions
                        .map((_, n) => [
                          n,
                          keys[n] ?? answerKeys.data?.[n] ?? 0,
                        ])
                        .filter((_, n) => n !== i)
                        .map((entry, n) => [n, entry[1]]),
                    ),
                  );
                }}
              >
                Remover pergunta
              </button>
            </fieldset></Disclosure>
          ))}
          <button
            className="secondary"
            disabled={questions.length >= 50}
            onClick={() =>
              setQuestions([...questions, { prompt: "", type: "text" }])
            }
          >
            Adicionar pergunta
          </button>
          <p>
            Sem perguntas, o aluno envia uma reflexão. Questões de múltipla
            escolha são corrigidas pelo servidor; respostas em texto aguardam o
            professor.
          </p>
          <ModuleForm
            title="Conteúdo e publicação"
            initial={{
              ...activity,
              available_on: activity?.available_on ?? today(),
              minimum_seconds: activity?.minimum_seconds ?? 0,
              position: activity?.position ?? 0,
            }}
            busy={action.busy}
            fields={[
              {
                name: "module_id",
                label: "Módulo",
                type: "select",
                required: true,
                options: modules.map((m) => ({ value: m.id, label: m.title })),
              },
              { name: "title", label: "Título da atividade", required: true },
              { name: "position", label: "Ordem no módulo", type: "number", min: 0, max: 100000, step: "1", required: true },
              {
                name: "kind",
                label: "Tipo de atividade",
                type: "select",
                required: true,
                options: Object.entries(kindLabel).map(([value, label]) => ({
                  value,
                  label,
                })),
              },
              {
                name: "body",
                label: "Conteúdo e instruções",
                type: "textarea",
              },
              {
                name: "passages",
                label: "Referências bíblicas",
                hint: "Ex.: João 3; Salmos 23",
              },
              { name: "video_url", label: "Link do vídeo", type: "url" },
              {
                name: "available_on",
                label: "Disponível em",
                type: "date",
                required: true,
              },
              { name: "due_on", label: "Prazo de entrega", type: "date" },
              {
                name: "minimum_seconds",
                label: "Tempo mínimo de estudo (segundos)",
                type: "number",
                required: true,
                min: 0,
                max: 7200,
              },
              {
                name: "published",
                label: "Publicar para a turma",
                type: "checkbox",
              },
            ]}
            onCancel={onClose}
            onSave={async (v) => {
              if (
                questions.some(
                  (q) =>
                    !q.prompt.trim() ||
                    (q.type === "choice" &&
                      ((q.options?.length ?? 0) < 2 ||
                        q.options?.some((o) => !o.trim()))),
                )
              )
                return action.act(() =>
                  Promise.reject(Error("invalid_questions")),
                );
              const answer_key = Object.fromEntries(
                questions
                  .map((q, i) => [
                    i,
                    q.type === "choice"
                      ? (keys[i] ?? answerKeys.data?.[i] ?? 0)
                      : null,
                  ])
                  .filter(([, v]) => v !== null),
              );
              const ok = await action.act(() =>
                moduleRpc("save_ebd_activity", {
                  resource: activity?.id ?? null,
                  data: { ...v, questions },
                  answer_key,
                }),
              );
              if (ok) onClose();
              return ok;
            }}
          />
        </>
      )}
    </section></ModuleDialog>
  );
}
function EbdAdministration({ classes }: { classes: EbdClass[] }) {
  const [editing, setEditing] = useState<EbdClass | null>(null),
    [directorySearch,setDirectorySearch]=useState(""),
    [selected, setSelected] = useState(""),
    people = useModulePeople("ebd", true),
    action = useModuleAction(),
    c = classes.find((c) => c.id === selected) ?? classes[0];
  const directory = useQuery({
      queryKey: ["modules", "ebd-directory", c?.id],
      enabled: !!c,
      queryFn: () =>
        moduleRpc<EbdMember[]>("ebd_directory", { target_class: c!.id }),
    }),
    modules = useModuleRows<EbdModule>("ebd_modules", "position"),
    guardians = useModuleRows<{ student_id: string; guardian_id: string }>(
      "ebd_guardians",
      "student_id",
    ),
    [memberEdit, setMemberEdit] = useState<EbdMember | null>(null);
  const options =
    people.data?.map((p) => ({ value: p.id, label: p.full_name })) ?? [];
  return (
    <>
      {action.notice}
      <Disclosure key={editing?.id??"new-class"} title={editing?"Editar turma":"Cadastrar turma"} description="Dados, critérios e configuração do diário" open={!!editing}>
      <ModuleForm
        key={editing?.id ?? "new-class"}
        title={editing ? "Editar turma" : "Cadastrar turma"}
        busy={action.busy}
        initial={{
          ...editing,
          start_date: editing?.start_date ?? today(),
          criteria:
            editing?.criteria.join(", ") ??
            "Presença, Bíblia, Oferta, Atividade",
          kind: editing?.kind ?? "youth",
          report_style: editing?.report_style ?? "marking",
        }}
        fields={[
          { name: "name", label: "Nome da turma", required: true },
          {
            name: "kind",
            label: "Tipo de turma",
            type: "select",
            required: true,
            options: [
              { value: "youth", label: "Jovens" },
              { value: "teen", label: "Adolescentes" },
              { value: "standard", label: "Infantil / padrão" },
            ],
          },
          {
            name: "start_date",
            label: "Início das aulas",
            type: "date",
            required: true,
          },
          {
            name: "criteria",
            label: "Critérios do diário",
            required: true,
            hint: "Separe os critérios por vírgula.",
          },
          {
            name: "report_style",
            label: "Estilo do diário",
            type: "select",
            required: true,
            options: [
              { value: "marking", label: "Marcação de critérios" },
              { value: "grades", label: "Notas e critérios" },
            ],
          },
          {
            name: "include_saturday",
            label: "Incluir sábado no acompanhamento",
            type: "checkbox",
          },
          { name: "archived", label: "Turma arquivada", type: "checkbox" },
        ]}
        onCancel={editing ? () => setEditing(null) : undefined}
        onSave={async (v) => {
          const ok = await action.act(() =>
            supabase!.from("ebd_classes").upsert({
              ...v,
              criteria: String(v.criteria)
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              ...(editing ? { id: editing.id } : {}),
            }),
          );
          if (ok) setEditing(null);
          return ok;
        }}
      />
      </Disclosure>
      {classes.map((c) => (
        <div className="icabv-card module-row" key={c.id}>
          <h3>
            {c.name}
            {c.archived && " · Arquivada"}
          </h3>
          <button className="secondary" onClick={() => setEditing(c)}>
            Editar turma
          </button>
        </div>
      ))}
      <ModuleState query={people}>
        {c && (
          <>
            <section className="icabv-card">
              <h2>Alunos e professores</h2>
              <label className="icabv-field">
                Turma do vínculo
                <select
                  value={c.id}
                  aria-label="Turma do vínculo"
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setMemberEdit(null);
                  }}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <Disclosure key={c.id+(memberEdit?.person_id??"new-member")} title={memberEdit?"Editar vínculo na turma":"Adicionar aluno ou professor"} open={!!memberEdit}>
              <ModuleForm
                key={c.id + (memberEdit?.person_id ?? "new")}
                title={
                  memberEdit
                    ? "Editar vínculo na turma"
                    : "Vincular pessoa à turma"
                }
                busy={action.busy}
                initial={{
                  ...memberEdit,
                  role: memberEdit?.role ?? "student",
                  reading_group_size: memberEdit?.reading_group_size ?? 1,
                }}
                fields={[
                  {
                    name: "person_id",
                    label: "Pessoa do cadastro da igreja",
                    type: "select",
                    required: true,
                    options,
                  },
                  {
                    name: "role",
                    label: "Função na turma",
                    type: "select",
                    required: true,
                    options: [
                      { value: "student", label: "Aluno" },
                      { value: "teacher", label: "Professor" },
                    ],
                  },
                  {
                    name: "module_id",
                    label: "Módulo atual",
                    type: "select",
                    options: modules.data
                      ?.filter((m) => m.class_id === c.id)
                      .map((m) => ({ value: m.id, label: m.title })),
                  },
                  {
                    name: "next_module_id",
                    label: "Próximo módulo",
                    type: "select",
                    options: modules.data
                      ?.filter((m) => m.class_id === c.id)
                      .map((m) => ({ value: m.id, label: m.title })),
                  },
                  {
                    name: "reading_group_size",
                    label: "Capítulos por grupo de leitura",
                    type: "number",
                    required: true,
                    min: 1,
                    max: 100,
                  },
                ]}
                onCancel={memberEdit ? () => setMemberEdit(null) : undefined}
                onSave={async (v) => {
                  const ok = await action.act(() =>
                    supabase!.from("ebd_class_members").upsert({
                      ...v,
                      module_id: v.module_id || null,
                      next_module_id: v.next_module_id || null,
                      class_id: c.id,
                    }),
                  );
                  if (ok) setMemberEdit(null);
                  return ok;
                }}
              />
              </Disclosure>
              <ModuleState query={directory}>
                <SearchField label="Buscar pessoa na turma" value={directorySearch} onChange={setDirectorySearch}/>
                <PagedList label="pessoas da turma" resetKey={c.id+directorySearch}>
                {directory.data?.filter(m=>searchText(m.full_name).includes(searchText(directorySearch))).map((m) => (
                  <div className="module-report-row" key={m.person_id}>
                    <p>
                      {m.full_name} ·{" "}
                      {m.role === "teacher" ? "Professor" : "Aluno"}
                    </p>
                    <div className="card-actions">
                      <button
                        className="secondary"
                        onClick={() => setMemberEdit(m)}
                      >
                        Editar vínculo
                      </button>
                      <button
                        className="secondary"
                        disabled={action.busy}
                        onClick={() => {
                          if (
                            confirm(
                              `Remover o vínculo de ${m.full_name} nesta turma? O histórico será preservado.`,
                            )
                          )
                            void action.act(() =>
                              supabase!
                                .from("ebd_class_members")
                                .delete()
                                .eq("class_id", c.id)
                                .eq("person_id", m.person_id),
                            );
                        }}
                      >
                        Remover da turma
                      </button>
                    </div>
                  </div>
                ))}
                </PagedList>
              </ModuleState>
            </section>
          </>
        )}
        <Disclosure title="Responsáveis e alunos" description="Vínculos de acompanhamento e acesso ao histórico">
        <ModuleForm
          title="Vincular responsável a aluno"
          busy={action.busy}
          fields={[
            {
              name: "student_id",
              label: "Aluno",
              type: "select",
              required: true,
              options,
            },
            {
              name: "guardian_id",
              label: "Responsável",
              type: "select",
              required: true,
              options,
            },
          ]}
          onSave={(v) =>
            action.act(() => supabase!.from("ebd_guardians").upsert(v))
          }
        />
        <ModuleState query={guardians}>
          {guardians.data?.map((g) => (
            <div
              className="icabv-card module-row"
              key={g.student_id + g.guardian_id}
            >
              <p>
                {people.data?.find((p) => p.id === g.guardian_id)?.full_name}{" "}
                acompanha{" "}
                {people.data?.find((p) => p.id === g.student_id)?.full_name}
              </p>
              <button
                className="secondary"
                disabled={action.busy}
                onClick={() => {
                  if (
                    confirm(
                      "Remover o acesso deste responsável ao histórico do aluno?",
                    )
                  )
                    void action.act(() =>
                      supabase!
                        .from("ebd_guardians")
                        .delete()
                        .eq("student_id", g.student_id)
                        .eq("guardian_id", g.guardian_id),
                    );
                }}
              >
                Desvincular responsável
              </button>
            </div>
          ))}
        </ModuleState>
        </Disclosure>
      </ModuleState>
      <p>
        A conta é a mesma do app da igreja. Para cadastrar uma pessoa nova, use
        Pessoas e papéis; os vínculos acima não criam outra conta nem outra
        senha.
      </p>
    </>
  );
}
function EbdSettings({
  classes,
  admin,
}: {
  classes: EbdClass[];
  admin: boolean;
}) {
  const action = useModuleAction();
  return (
    <>
      {action.notice}
      {classes.map((c) => (
        <Disclosure key={c.id} title={"Lembretes · "+c.name} description="Modelo de mensagem para acompanhamento">
        <ModuleForm
          key={c.id}
          title={"Lembretes · " + c.name}
          initial={{ whatsapp_template: c.whatsapp_template }}
          busy={action.busy}
          fields={[
            {
              name: "whatsapp_template",
              label: "Mensagem de acompanhamento",
              type: "textarea",
              required: true,
              hint: "Use {{nome}}, {{classe}} e {{ultimaAtividade}}. O envio é manual.",
            },
          ]}
          onSave={(v) =>
            action.act(() =>
              supabase!.from("ebd_classes").update(v).eq("id", c.id),
            )
          }
        /></Disclosure>
      ))}
      <Disclosure title="Exportar dados da EBD" description="Prepare uma cópia dos dados autorizados"><EbdExport /></Disclosure>
      <Disclosure title="Importar histórico da EBD" description="Backup antigo e correspondência de pessoas"><ModuleImport module="ebd" /></Disclosure>
      {admin && <Disclosure title="Responsáveis pelo módulo" description="Acesso à gestão da EBD"><ModuleAccess module="ebd" /></Disclosure>}
    </>
  );
}
function EbdExport() {
  const action = useModuleAction();
  return (
    <section className="icabv-card">
      <h2>Cópia dos dados da EBD</h2>
      <p>
        Exporta os dados a que sua conta tem acesso. Contas e senhas não são
        exportadas.
      </p>
      {action.notice}
      <button
        className="secondary"
        disabled={action.busy}
        onClick={() =>
          void action.act(async () => {
            const tables = [
              "ebd_classes",
              "ebd_class_members",
              "ebd_guardians",
              "ebd_modules",
              "ebd_activities",
              "ebd_activity_keys",
              "ebd_submissions",
              "ebd_attendance",
              "ebd_recordings",
              "ebd_legacy_history",
            ];
            const data: Data = {
              version: 1,
              exported_at: new Date().toISOString(),
              people: await moduleRpc("module_people", {
                target_module: "ebd",
              }),
            };
            for (const table of tables) {
              const all: Data[] = [];
              for (let offset = 0; ; offset += 500) {
                const r = await supabase!
                  .from(table)
                  .select("*")
                  .range(offset, offset + 499);
                if (r.error) throw r.error;
                all.push(...r.data);
                if (r.data.length < 500) break;
              }
              data[table] = all;
            }
            downloadData("ebd-icabv.json", data);
          }, "Cópia preparada.")
        }
      >
        Exportar dados da EBD
      </button>
    </section>
  );
}

