"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, X, ChevronRight } from "lucide-react";
import { supabase } from "./supabase";
export type AppNotification = { key: string; version: string; kind: string; title: string; body: string; tab: string; section: string | null; occurred_at: string; actionable: boolean; read_at: string | null };
type Feed = { items: AppNotification[]; unread_count: number; total_count: number };
function vapidKeyBytes(value:string) { const base64=value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4);return Uint8Array.from(atob(base64),char=>char.charCodeAt(0)); }
export function NotificationBell({ userId, onNavigate }: { userId: string; onNavigate: (tab: string, section?: string, key?: string) => void }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(0), [message, setMessage] = useState(""), [pushMessage,setPushMessage]=useState(""), [pushEnabled,setPushEnabled]=useState<boolean|null>(null), [pushBlocked,setPushBlocked]=useState(false), [pushBusy,setPushBusy]=useState(false);
  const autoPushAttempted = useRef(false);
  const panel = useRef<HTMLDivElement>(null), client = useQueryClient();
  const query = useQuery({ queryKey: ["notifications", userId, page], queryFn: async () => {
    const r = await supabase!.rpc("notification_feed", { page_number: page });
    if (r.error) throw r.error;
    return r.data as Feed;
  }, refetchInterval: 60000 });
  useEffect(()=>{if(!("serviceWorker" in navigator)||autoPushAttempted.current)return;autoPushAttempted.current=true;void navigator.serviceWorker.ready.then(async registration=>{const subscription=await registration.pushManager.getSubscription();if(subscription){setPushEnabled(true);setPushBlocked(false);return;}setPushEnabled(false);if(!("Notification" in window)){setPushBlocked(true);setPushMessage("Este navegador não oferece notificações push.");return;}if(Notification.permission==="denied"){setPushBlocked(true);setPushMessage("Permissão bloqueada. Ative as notificações do site nas configurações do navegador.");return;}await enablePush();}).catch(()=>setPushEnabled(false));},[]);
  async function enablePush(){
    setPushBusy(true);setPushMessage("");
    try{
      const publicKey=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if(!publicKey)throw Error("O envio de push ainda não foi configurado no servidor.");
      if(!("Notification" in window)||!("PushManager" in window)){setPushBlocked(true);throw Error("Este navegador não oferece notificações push.");}
      let permission=Notification.permission;if(permission==="default")permission=await Notification.requestPermission();
      if(permission!=="granted"){setPushBlocked(permission==="denied");throw Error(permission==="denied"?"Permissão bloqueada. Ative as notificações do site nas configurações do navegador.":"Permita as notificações do ICABV no navegador para ativar o push.");}
      setPushBlocked(false);
      const registration=await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidKeyBytes(publicKey)});
      const saved=await supabase!.rpc("save_my_push_subscription",{subscription:{...subscription.toJSON(),user_agent:navigator.userAgent}});
      if(saved.error)throw saved.error;
      setPushEnabled(true);setPushBlocked(false);setPushMessage("Push ativado neste dispositivo.");
    }catch(error){setPushMessage(error instanceof Error?error.message:"Não foi possível ativar o push neste dispositivo.");}
    finally{setPushBusy(false);}
  }
  async function disablePush(){
    setPushBusy(true);setPushMessage("");
    try{const registration=await navigator.serviceWorker.ready;const subscription=await registration.pushManager.getSubscription();if(subscription){const removed=await supabase!.rpc("remove_my_push_subscription",{push_endpoint:subscription.endpoint});if(removed.error)throw removed.error;await subscription.unsubscribe();}setPushEnabled(false);setPushBlocked(false);setPushMessage("Push desativado neste dispositivo.");}
    catch(error){setPushMessage(error instanceof Error?error.message:"Não foi possível desativar o push neste dispositivo.");}
    finally{setPushBusy(false);}
  }
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "Tab") {
        const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  async function mark(n: AppNotification) {
    if (n.read_at) return;
    const r = await supabase!.rpc("mark_app_notification", { notification_key: n.key, notification_version: n.version });
    if (r.error) { setMessage("Não foi possível marcar como lida. Tente novamente."); return; }
    client.setQueryData<Feed>(["notifications", userId, page], old => old ? { ...old, unread_count: Math.max(0, old.unread_count - 1), items: old.items.map(i => i.key === n.key ? { ...i, read_at: new Date().toISOString() } : i) } : old);
  }
  const unread = Number(query.data?.unread_count ?? 0);
  return <>
    <button className="icon-btn notification-trigger" aria-label={unread ? `Notificações: ${unread} não lidas` : "Notificações"} title="Notificações" aria-expanded={open} aria-controls="notification-center" onClick={() => { setOpen(!open); setMessage(""); }}>
      <Bell size={20} />{unread > 0 && <span className="notification-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
      {query.error && <span className="notification-warning" aria-hidden="true">!</span>}
    </button>
    {open && <div className="notification-backdrop" onClick={() => setOpen(false)}><div id="notification-center" role="dialog" aria-modal="true" aria-label="Notificações" tabIndex={-1} ref={panel} className="notification-panel" onClick={e => e.stopPropagation()}>
      <header><div><h2>Notificações</h2><small>{unread} não lidas</small></div><button className="icon-btn" aria-label="Fechar notificações" onClick={() => setOpen(false)}><X size={20} /></button></header>
      <section className="notification-push-control"><div><strong>Avisos neste dispositivo</strong><small>{pushEnabled?"Este dispositivo pode receber push.":pushBlocked?"Permissão bloqueada neste navegador.":"Ative o push para receber avisos fora do app."}</small></div>{pushEnabled?<button className="secondary" disabled={pushBusy} onClick={()=>void disablePush()}>{pushBusy?"Salvando…":"Desativar push"}</button>:<button className="secondary" disabled={pushBusy||pushBlocked} onClick={()=>void enablePush()}>{pushBusy?"Ativando…":pushBlocked?"Permissão bloqueada":"Ativar push"}</button>}{pushMessage&&<p role="status">{pushMessage}</p>}</section>
      {query.isPending ? <p role="status">Carregando notificações…</p> : query.error ? <div role="alert"><p>Não foi possível carregar suas notificações.</p><button className="secondary" onClick={() => void query.refetch()}>Tentar novamente</button></div> : !query.data?.items.length ? <p>Nenhuma notificação no momento.</p> : <div className="notification-list">{query.data.items.map(n => <article key={n.key} className={n.read_at ? "" : "notification-unread"}>
        <span className="church-label">{n.actionable ? "PRECISA DA SUA ATENÇÃO" : "IGREJA ICABV"}</span><h3>{n.title}</h3><p>{n.body}</p>
        <small>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(n.occurred_at))}</small>
        <div className="card-actions"><button className="text-btn" onClick={() => { void mark(n); setOpen(false); onNavigate(n.tab, n.section ?? undefined, n.key); }}>Abrir <ChevronRight size={15} /></button>{!n.read_at && <button className="text-btn" onClick={() => void mark(n)}>Marcar como lida</button>}</div>
      </article>)}</div>}
      {message && <p role="alert">{message}</p>}
      {Number(query.data?.total_count ?? 0) > 30 && <div className="card-actions"><button className="secondary" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button className="secondary" disabled={(page + 1) * 30 >= Number(query.data?.total_count ?? 0)} onClick={() => setPage(page + 1)}>Próxima</button></div>}
    </div></div>}
  </>;
}
