"use client";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import type { Session } from "@supabase/supabase-js";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Home,
  CalendarDays,
  UsersRound,
  Church,
  MessageCircleHeart,
  Network,
  House,
  ShoppingBasket,
  ClipboardList,
  BookOpen,
  Settings,
  Sun,
  Moon,
  LogOut,
  Wallet,
  UserRound,
  Music2,
  GraduationCap,
  Cake,
  DoorOpen,
  LoaderCircle,
} from "lucide-react";
import { SearchField, searchText } from "./presentation";
import { AccountStatus, actionError } from "./account-status";
import { SchedulesPage } from "./schedules-page";
import { MemberHome } from "./member-home";
import { ManagementHome } from "./management-home";
import {
  ChevronRight,
} from "lucide-react";
import { TextLibrary } from "./text-library";
import { supabase } from "./supabase";
import { CoreHome, Agenda, Prayers, CoreManagement } from "./core-screen";
import { CommunityScreen } from "./community-screen";
import { FinanceDemoScreen } from "./finance-screen";
import { Families, People } from "./people";
import { Worship } from "./worship";
import { Ebd } from "./ebd";
import { PersonContacts } from "./person-contacts";
import { Birthdays, FoodDrive } from "./community-care";
import { offlineVersion, savedMessage } from "./offline-transport";
import { SyncStatus } from "./sync-status";
import { NotificationBell } from "./notification-bell";
import { moduleRpc, type Capabilities } from "./module-ui";
import {RecordsWorkspace} from "./records-workspace";
import { Visits } from "./visits";

import { type Role, roleLabels } from "../../packages/shared/src";
const links = [
  { id: "home", label: "Início", icon: Home },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "content", label: "Conteúdos", icon: BookOpen },
  { id: "community", label: "Grupos", icon: UsersRound },
  { id: "ministries", label: "Ministérios", icon: Church },
  { id: "schedules", label: "Minhas escalas", icon: ClipboardList },
  { id: "louvor", label: "Louvor", icon: Music2 },
  { id: "ebd", label: "Painel EBD", icon: GraduationCap },
  { id: "visits", label: "Visitas", icon: DoorOpen },
  { id: "prayers", label: "Oração", icon: MessageCircleHeart },
  { id: "cells", label: "Células", icon: Network },
  { id: "families", label: "Famílias", icon: House },
  { id: "birthdays", label: "Aniversariantes", icon: Cake },
  { id: "food-drive", label: "Cestas básicas", icon: ShoppingBasket },
  { id: "offerings", label: "Ofertas de teste", icon: Wallet },
  { id: "profile", label: "Perfil", icon: UserRound },
];
const routeTabs = new Set([
  ...links.map((l) => l.id),
  "menu",
  "manage",
  "people",
  "core-manage",
  "management-agenda",
  "management-announcements",
  "finance",
  "records",
]);
export default function Platform({
  initialTab = "home",
  recovery = false,
  demo = false,
}: {
  initialTab?: string;
  recovery?: boolean;
  demo?: boolean;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 15000, networkMode: "always" } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Shell initialTab={initialTab} recovery={recovery} demo={demo} />
    </QueryClientProvider>
  );
}
function Shell({
  initialTab,
  recovery,
  demo,
}: {
  initialTab: string;
  recovery: boolean;
  demo: boolean;
}) {
  const client = useQueryClient();
  const [noticeTarget, setNoticeTarget] = useState<{ tab: string; section?: string; key?: string } | null>(null);
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [tab, setTab] = useState(initialTab),
    [workspace, setWorkspace] = useState(initialTab === "manage"),
    [dark, setDark] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [reset, setReset] = useState(recovery);
  useEffect(() => {
    let alive = true;
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js");
    const sub = supabase?.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      client.clear();
      setSession(next);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") setReset(true);
    });
    const init = async () => {
      await Promise.resolve();
      if (!alive) return;
      try {
        const savedTheme=localStorage.getItem("icabv-theme");
        const initialDark=savedTheme==="dark"||(savedTheme!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.dataset.theme=initialDark?"dark":"light";
        setDark(initialDark);
      } catch {}
      if (!supabase) {
        setReady(true);
        return;
      }
      const params = new URLSearchParams(location.search);
      if (routeTabs.has(params.get("tab") ?? "")) setTab(params.get("tab")!);
      if (demo && ["manage", "records"].includes(params.get("tab") ?? ""))
        setWorkspace(true);
      const code = params.get("code");
      if (code && location.pathname === "/auth/callback") {
        const result = await supabase!.auth.exchangeCodeForSession(code);
        if (result.error) {
          setMessage("O link expirou ou é inválido. Solicite outro.");
        } else if (params.get("next") === "/reset-password") setReset(true);
        history.replaceState(null, "", "/app");
      }
      const { data, error } = await supabase!.auth.getSession();
      if (alive) {
        if (error)
          setMessage("Não foi possível restaurar a sessão. Entre novamente.");
        setSession(data.session);
        setReady(true);
      }
    };
    void init();
    return () => {
      alive = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [client, demo]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    if (demo) return;
    const restore = () => {
      const requested = new URLSearchParams(location.search).get("tab");
      setTab(
        requested && routeTabs.has(requested)
          ? requested
          : location.pathname === "/gestao"
            ? "manage"
            : "home",
      );
      setWorkspace(location.pathname === "/gestao");
      setMessage("");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [demo]);
  const profile = useQuery({
    queryKey: ["identity", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const [p, roles, capabilities] = await Promise.all([
        supabase!
          .from("persons")
          .select("id,full_name,onboarded_at")
          .eq("auth_user_id", session!.user.id)
          .single(),
        supabase!.rpc("my_roles"),
        moduleRpc<Capabilities>("module_capabilities"),
      ]);
      if (p.error || roles.error) throw p.error || roles.error;
      return { ...p.data, roles: roles.data as Role[], capabilities };
    },
  });
  const assigned = profile.data?.roles ?? [];
  const admin = assigned.includes("admin"),
    managePeople = admin || assigned.includes("secretary"),
    finance = admin || assigned.includes("treasurer");
  const capabilities = profile.data?.capabilities ?? {
    louvor_manager: false,
    ebd_manager: false,
    ebd_teacher: false,
    ebd_observer: false,
  };
  const hasManagement =
    managePeople ||
    finance ||
    capabilities.louvor_manager ||
    capabilities.ebd_manager ||
    capabilities.ebd_teacher ||
    capabilities.ebd_observer;
  const managementLinks = [
    ...(managePeople ? [{ id: "people", label: "Membros", description: "Cadastros e perfis", icon: UsersRound }] : []),
    ...(managePeople ? [{ id: "management-agenda", label: "Agenda", description: "Eventos e escalas", icon: CalendarDays }] : []),
    ...(managePeople ? [{ id: "management-announcements", label: "Comunicados", description: "Avisos da igreja", icon: MessageCircleHeart }] : []),
    ...(managePeople ? [{ id: "records", label: "Registros", description: "Pessoas e atividades", icon: ClipboardList }] : []),
    ...(finance ? [{ id: "finance", label: "Financeiro", description: "Entradas e relatórios", icon: Wallet }] : []),
    ...(capabilities.louvor_manager ? [{ id: "louvor", label: "Louvor", description: "Músicas e escalas", icon: Music2 }] : []),
    ...(capabilities.ebd_manager || capabilities.ebd_teacher || capabilities.ebd_observer ? [{ id: "ebd", label: "Escola Dominical", description: "Classes e atividades", icon: GraduationCap }] : []),
    ...(managePeople ? [{ id: "core-manage", label: "Conteúdos", description: "Materiais e publicações", icon: BookOpen }] : []),
  ];
  function navigate(next: string) {
    setNoticeTarget(null);
    const nextWorkspace =
      next === "manage"
        ? true
        : ["home", "menu", "profile"].includes(next)
          ? false
          : workspace;
    if (!demo) {
      const destination = new URL(location.href);
      destination.pathname = nextWorkspace ? "/gestao" : "/app";
      destination.search = "";
      if (!["home", "manage"].includes(next))
        destination.searchParams.set("tab", next);
      history.pushState(null, "", destination);
    }
    if (next === "manage") setWorkspace(true);
    if (["home", "menu", "profile"].includes(next)) setWorkspace(false);
    setMessage("");
    setTab(next);
  }
  const managementView = workspace && hasManagement;
  const actionLock = useRef(false);
  async function run(
    task: () => PromiseLike<{ error: unknown }>,
    success = "Salvo com sucesso.",
  ) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const before = offlineVersion();
      const result = await task();
      if (result.error) throw result.error;
      setMessage(savedMessage(before, success));
      await client.invalidateQueries();
    } catch (error) {
      setMessage(actionError(error));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function authenticate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await run(
      () =>
        supabase!.auth.signInWithPassword({
          email: String(form.get("email")).trim(),
          password: String(form.get("password")),
        }),
      "",
    );
  }

  const themeButton = (
    <button
      className="icon-btn"
      aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={() =>
        setDark((v) => {
          const next=!v;
          try {
            localStorage.setItem("icabv-theme", next ? "dark" : "light");
          } catch {}
          document.documentElement.dataset.theme=next?"dark":"light";
          return next;
        })
      }
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
  const name =
    profile.data?.full_name ||
    session?.user.email?.split("@")[0] ||
    "Visitante";
  return (
    <div
      className={
        "icabv-platform " + (demo ? "icabv-device-preview " : "") + (managementView ? "church-admin" : "church-member")
      }
    >
      <a className="ui-skip-link" href="#main-content">Ir para o conteúdo</a>
      <header className="icabv-header">
        <div className="icabv-brand">
        {managementView?<a href="/gestao?tab=manage" className="icabv-identity">
          <Image
            unoptimized
            src="/logo-icabv.png"
            alt="Logo ICABV"
            width={52}
            height={52}
          />
          <span>
            <strong>ICABV</strong>
            <small>Igreja Cristã no Alto da Boa Vista</small>
          </span>
        </a>:
        <a href="/app" className="icabv-identity">
          <Image
            unoptimized
            src="/logo-icabv.png"
            alt="Logo ICABV"
            width={52}
            height={52}
          />
          <span>
            <strong>ICABV</strong>
            <small>Igreja Cristã no Alto da Boa Vista</small>
          </span>
        </a>}
        </div>
        <div className="icabv-header-actions">
          {session && !demo && <SyncStatus key={session.user.id} userId={session.user.id} />}
          {themeButton}
          {session && (
            <NotificationBell onNavigate={(tab, section, key) => { navigate(tab); setNoticeTarget({ tab, section, key }); }} userId={session.user.id} />
          )}
          {session && !managementView && (
            <button
              className="icon-btn"
              aria-label="Sair da conta"
              disabled={busy}
              onClick={() =>
                void run(() => supabase!.auth.signOut(), "Sessão encerrada.")
              }
            >
              <LogOut size={19} />
            </button>
          )}
          {session&&managementView&&<details className="admin-account-menu"><summary aria-label="Minha conta"><UserRound size={19}/></summary><div><strong>{name}</strong><button className="text-btn" disabled={busy} onClick={()=>void run(()=>supabase!.auth.signOut(),'Sessão encerrada.')}>Sair da conta</button></div></details>}
        </div>
      </header>
      <main id="main-content" data-member-page={!managementView?tab:undefined} tabIndex={-1} className="icabv-main">
        <AccountStatus.Provider
          value={{ ready: !!profile.data, manager: managePeople }}
        >
          {demo && <DemoBanner />}
          {managementView && tab !== "manage" && <button type="button" className="management-home-return" onClick={() => navigate("manage")}><ChevronRight size={16} aria-hidden="true"/> Início da gestão</button>}
          {!ready ? (
            <div className="icabv-startup-loading" role="status" aria-label="Carregando aplicativo">
              <LoaderCircle className="icabv-startup-spinner" size={42} strokeWidth={1.7} aria-hidden="true" />
              <span className="sr-only">Carregando…</span>
            </div>
          ) : !session ? (
            <section className="icabv-card icabv-auth">
              <span className="eyebrow">BEM-VINDO À ICABV</span>
              <h1>Igreja Cristã no Alto da Boa Vista</h1>
              <p>Entre para acompanhar a igreja e participar da comunidade.</p>
              <form onSubmit={authenticate}>
                <label>
                  E-mail
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
                <label>
                  Senha
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    maxLength={128}
                    required
                  />
                </label>
                <button className="primary" disabled={busy || !supabase}>
                  {busy ? "Entrando…" : "Entrar"}
                </button>
                <button
                  className="text-btn"
                  type="button"
                  disabled={busy || !supabase}
                  onClick={(e) => {
                    const input = e.currentTarget.form?.elements.namedItem(
                      "email",
                    ) as HTMLInputElement;
                    if (!input?.reportValidity() || !input.value) return;
                    void run(
                      () =>
                        supabase!.auth.resetPasswordForEmail(input.value, {
                          redirectTo:
                            location.origin +
                            "/auth/callback?next=/reset-password",
                        }),
                      "Se houver uma conta para esse e-mail, você receberá as instruções de recuperação.",
                    );
                  }}
                >
                  Esqueci minha senha
                </button>
              </form>
              {!supabase && (
                <>
                  <p role="alert">
                    Configure a URL e a chave pública do Supabase para habilitar o
                    acesso real.
                  </p>
                  {process.env.NODE_ENV === "development" && (
                    <a className="secondary" href="/demo?perfil=membro">
                      Explorar demonstração com dados fictícios
                    </a>
                  )}
                </>
              )}
            </section>
          ) : reset ? (
            <section className="icabv-card">
              <h1>Nova senha</h1>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const password = String(
                    new FormData(e.currentTarget).get("password"),
                  );
                  void run(async () => {
                    const result = await supabase!.auth.updateUser({
                      password,
                    });
                    if (!result.error) {
                      setReset(false);
                      history.replaceState(null, "", "/app");
                    }
                    return result;
                  }, "Senha atualizada.");
                }}
              >
                <label>
                  Senha com pelo menos 12 caracteres
                  <input
                    name="password"
                    type="password"
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Salvar senha
                </button>
              </form>
            </section>
          ) : session.user.app_metadata?.must_change_password === true ? (
            <section className="icabv-card icabv-auth">
              <span className="eyebrow">PRIMEIRO ACESSO</span>
              <h1>Crie sua senha definitiva</h1>
              <p>Esta senha temporária vale apenas para este acesso. Escolha uma nova senha com pelo menos 12 caracteres para continuar.</p>
              <form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);const password=String(data.get("password"));if(password!==String(data.get("confirmPassword"))){setMessage("As senhas não coincidem.");return;}void run(async()=>{const result=await supabase!.auth.updateUser({password});if(result.error)return result;const refreshed=await supabase!.auth.refreshSession();if(refreshed.error)return refreshed;if(refreshed.data.session)setSession(refreshed.data.session);return {error:null};},"Senha definitiva salva. Bem-vindo ao app.");}}>
                <label>Nova senha<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
                <label>Confirme a nova senha<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
                <button className="primary" disabled={busy}>{busy?"Salvando…":"Salvar senha e continuar"}</button>
              </form>
              {message&&<p role="status">{message}</p>}
            </section>
          ) : profile.isPending ? (
            <p role="status">Carregando seu perfil…</p>
          ) : profile.error ? (
            <section className="icabv-card" role="alert">
              <p>Não foi possível carregar seu perfil e permissões.</p>
              <button
                className="secondary"
                onClick={() => void profile.refetch()}
              >
                Tentar novamente
              </button>
            </section>
          ) : (
            <>
              {managementView && tab === "manage" ? (
                <section className="management-menu-page" aria-labelledby="management-menu-title">
                  <header className="management-menu-heading">
                    <h1 id="management-menu-title">Gestão da igreja</h1>
                    <button type="button" className="management-return-app" onClick={() => navigate("home")}><Home size={17}/> Voltar ao app da igreja</button>
                  </header>
                  <nav className="management-menu-grid" aria-label="Áreas de gestão">
                    {managementLinks.map((link) => (
                      <button type="button" className="management-menu-card" key={link.id} aria-current={tab === link.id ? "page" : undefined} onClick={() => navigate(link.id)}>
                        <span className="management-menu-icon"><link.icon size={23} aria-hidden="true" /></span>
                        <strong>{link.label}</strong>
                        <small>{link.description}</small>
                      </button>
                    ))}
                  </nav>
                </section>
              ) : tab === "home" ? (
                <>
                  <MemberHome name={name} personId={profile.data?.id} onNavigate={navigate} />
                </>
              ) : tab === "menu" ? (
                <MemberMenu manager={hasManagement} onNavigate={navigate} />
              ) : tab === "agenda" ? (
                <Agenda personId={profile.data?.id} onLogin={() => {}} onNavigate={(tab,section,key)=>{navigate(tab);setNoticeTarget({tab,section,key});}} />
              ) : tab === "content" ? (
                <>
                  <TextLibrary />
                  <CoreHome personId={profile.data?.id} showEvents={false} />
                </>
              ) : tab === "cells" ? (
                <TextLibrary cells />
              ) : tab === "community" || tab === "ministries" ? (
                <CommunityScreen
                  key={tab}
                  kind={tab === "community" ? "group" : "department"}
                  canCreate={managePeople}
                />
              ) : tab === "schedules" ? (
                <SchedulesPage personId={profile.data!.id} onOpen={(serviceId)=>{navigate("louvor");setNoticeTarget({tab:"louvor",section:"Escalas",key:serviceId?`service:${serviceId}`:`schedule-${Date.now()}`});}}/>
              ) : tab === "louvor" ? (
                <Worship
                  key={noticeTarget?.tab === "louvor" ? noticeTarget.key : "louvor"}
                  initialSection={noticeTarget?.tab === "louvor" ? noticeTarget.section : undefined}
                  initialServiceId={noticeTarget?.tab === "louvor" && noticeTarget.key?.startsWith("service:") ? noticeTarget.key.slice(8) : undefined}
                  manager={capabilities.louvor_manager}
                  personId={profile.data!.id}
                  admin={admin}
                />
              ) : tab === "ebd" ? (
                <Ebd
                  key={noticeTarget?.tab === "ebd" ? noticeTarget.key : "ebd"}
                  initialSection={noticeTarget?.tab === "ebd" ? noticeTarget.section : undefined}
                  initialClass={noticeTarget?.tab === "ebd" ? noticeTarget.key?.split(":")[1] : undefined}
                  capabilities={capabilities}
                  personId={profile.data!.id}
                  admin={admin}
                />
              ) : tab === "visits" ? (
                <Visits personId={profile.data!.id} />
              ) : tab === "prayers" ? (
                <Prayers personId={profile.data!.id} moderator={managePeople} />
              ) : tab === "families" ? (
                <Families busy={busy} run={run} />
              ) : tab === "birthdays" ? (
                <Birthdays />
              ) : tab === "food-drive" ? (
                <FoodDrive manager={managePeople} />
              ) : tab === "offerings" ? (
                <FinanceDemoScreen />
              ) : tab === "profile" ? (
                <section className="icabv-card">
                  <h1>Meu perfil</h1>
                  <p>{session.user.email}</p>
                  <p>{assigned.map((r) => roleLabels[r]).join(" · ")}</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const full_name = String(
                        new FormData(e.currentTarget).get("name"),
                      ).trim();
                      if (full_name.length < 2) {
                        setMessage(
                          "Informe seu nome com pelo menos dois caracteres.",
                        );
                        return;
                      }
                      void run(() =>
                        supabase!
                          .from("persons")
                          .update({ full_name })
                          .eq("id", profile.data!.id),
                      );
                    }}
                  >
                    <label>
                      Nome completo
                      <input
                        name="name"
                        defaultValue={profile.data?.full_name}
                        minLength={2}
                        maxLength={120}
                        required
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Salvar perfil
                    </button>
                  </form>
                  <PersonContacts personId={profile.data!.id} />
                </section>
              ) : tab === "manage" && hasManagement ? (
                <ManagementHome name={name} people={managePeople} finance={finance} capabilities={capabilities} onNavigate={navigate} />
              ) : tab === "management-agenda" && managePeople ? (
                <ManagementAgenda personId={profile.data!.id} admin={admin} manager={managePeople} />
              ) : tab === "management-announcements" && managePeople ? (
                <CoreManagement postsOnly/>
              ) : tab === "people" && managePeople ? (
                <People busy={busy} run={run} admin={admin} />
              ) : tab === "core-manage" && managePeople ? (
                <CoreManagement />
              ) : tab === "records" && (managePeople||finance) ? (
                <RecordsWorkspace finance={finance} people={managePeople} onNavigate={navigate} access={{userId:session.user.id,churchOwner:"icabv",email:session.user.email??"",name,role:admin?"admin":assigned.includes("secretary")?"secretary":"treasurer",ministry:"",memberId:profile.data!.id,active:true,version:1}}/>
              ) : tab === "finance" && finance ? (
                <FinanceDemoScreen management canWrite={finance} />
              ) : (
                <section className="icabv-card">
                  <p>Seu perfil não tem acesso a esta área.</p>
                </section>
              )}
            </>
          )}
          {message && (
            <p role="status" className="icabv-message">
              {message}
            </p>
          )}
          <footer className="icabv-footer">
            Igreja Cristã no Alto da Boa Vista · ICABV
          </footer>
        </AccountStatus.Provider>
      </main>
      {session && !reset && profile.data && !managementView && (
        <nav className="icabv-bottom" aria-label="Navegação do aplicativo">
          {(managementView
            ? [{ id: "manage", label: "Gestão", icon: Settings }]
            : [
            { id: "home", label: "Início", icon: Home },
            { id: "agenda", label: "Agenda", icon: CalendarDays },
            { id: "louvor", label: "Louvor", icon: Music2 },
            { id: "schedules", label: "Escalas", icon: ClipboardList },
            { id: "visits", label: "Visitas", icon: DoorOpen },
            { id: "ebd", label: "EBD", icon: GraduationCap },
            ...(hasManagement ? [{ id: "manage", label: "Gestão", icon: Settings }] : []),
          ]).map((l) => (
            <button
              key={l.id}
              aria-current={tab === l.id ? "page" : undefined}
              onClick={() => {
                setMessage("");
                navigate(l.id);
              }}
            >
              <l.icon size={21} />
              <span>{l.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function DemoBanner() {
  return (
    <aside className="icabv-demo-banner" aria-label="Modo de demonstração">
      <strong>Demonstração · dados fictícios</strong>
      <p>
        Explore as telas. Alterações ficam nesta prévia e são descartadas ao
        recarregar.
      </p>
      <div>
        <a className="secondary" href="/demo?perfil=membro">
          Ver como visitante
        </a>
        <a className="secondary" href="/demo?perfil=gestor&tab=manage">
          Ver gestão
        </a>
        <a className="text-btn" href="/app">
          Voltar ao acesso real
        </a>
      </div>
    </aside>
  );
}

function ManagementPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="icabv-card management-placeholder">
      <span className="eyebrow">EM CONSTRUÇÃO</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}

function ManagementAgenda({personId,admin,manager}:{personId:string;admin:boolean;manager:boolean}) {
  const [section,setSection]=useState<"events"|"scales">("events");
  return <section className="management-agenda-page" aria-labelledby="management-agenda-title">
    <header className="management-agenda-heading"><span className="eyebrow">PLANEJAMENTO DA IGREJA</span><h1 id="management-agenda-title">Gestão de agenda</h1><p>Organize eventos e escalas da comunidade.</p></header>
    <nav className="management-agenda-tabs" aria-label="Seções da gestão de agenda">
      <button type="button" aria-current={section==="events"?"page":undefined} onClick={()=>setSection("events")}><CalendarDays size={17} aria-hidden="true"/> Eventos</button>
      <button type="button" aria-current={section==="scales"?"page":undefined} onClick={()=>setSection("scales")}><ClipboardList size={17} aria-hidden="true"/> Escalas de culto</button>
    </nav>
    {section==="events"?<CoreManagement eventsOnly/>:<Worship key="management-agenda-worship" manager={manager} personId={personId} admin={admin} initialSection="Escalas"/>}
  </section>;
}

function MemberMenu({
  manager,
  onNavigate,
}: {
  manager: boolean;
  onNavigate: (tab: string) => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <section className="member-menu">
      
      <h1>{manager?"Menu de gestão":"Menu da igreja"}</h1>
      <SearchField label={manager?"Buscar na gestão":"Buscar no menu"} value={search} onChange={setSearch} />
      <div>
        {manager ? (
          searchText("Painel de gestão usuários comunicados escalas módulos").includes(searchText(search)) && <section className="member-menu-group"><h2>Gestão da igreja</h2><div><button onClick={() => onNavigate("manage")}><span className="member-menu-icon"><Settings size={21} aria-hidden="true" /></span><span className="member-menu-entry"><strong>Painel de gestão</strong><small>Usuários, comunicados, escalas e módulos</small></span><ChevronRight size={17} aria-hidden="true" /></button></div></section>
        ) : (
          <>
        {[
          { title: "Culto e aprendizado", ids: ["agenda", "louvor", "ebd", "content", "schedules"] },
          { title: "Vida em comunidade", ids: ["visits", "community", "ministries", "cells", "prayers", "food-drive", "birthdays"] },
          { title: "Minha conta e família", ids: ["profile", "families", "offerings"] },
        ].filter(group => links.some(l => group.ids.includes(l.id) && searchText(l.label).includes(searchText(search)))).map(group => <section className="member-menu-group" key={group.title}><h2>{group.title}</h2><div>
          {links.filter(l => group.ids.includes(l.id) && searchText(l.label).includes(searchText(search))).map(l => <button key={l.id} onClick={() => onNavigate(l.id)}><span className="member-menu-icon"><l.icon size={21} aria-hidden="true" /></span><strong>{l.label}</strong><ChevronRight size={17} aria-hidden="true" /></button>)}
        </div></section>)}
          </>
        )}
      </div>
    </section>
  );
}
