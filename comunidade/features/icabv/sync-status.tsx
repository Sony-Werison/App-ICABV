"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Wifi, WifiOff, X } from "lucide-react";
import { offlineTransport } from "./offline-transport";
import type { PendingChange } from "./offline-store";
function changeLabel(change:PendingChange){
  if(change.command.kind==="rpc"&&change.command.target==="save_visit_availability"){
    const kind=(change.command.body as {availability_kind?:unknown}|null)?.availability_kind;
    return kind==="visitor"?"Disponibilidade para visitar":kind==="host"?"Disponibilidade para receber visitas":"Disponibilidade de visita";
  }
  if(change.command.kind==="rpc"&&change.command.target==="remove_visit_availability")return "Remoção de disponibilidade de visita";
  return change.description;
}
function changeError(change:PendingChange){
  return change.error??"A alteração precisa de revisão.";
}
export function SyncStatus({ userId }: { userId: string }) {
  const [online, setOnline] = useState(true), [changes, setChanges] = useState<PendingChange[]>([]), [open, setOpen] = useState(false), [storageError, setStorageError] = useState(""), [loaded, setLoaded] = useState(false);
  const client = useQueryClient();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  useEffect(() => {
    let alive = true, previous = -1;
    const refresh = async () => {
      if (!alive) return;
      try {
        const next = await offlineTransport?.pending(userId) ?? [];
        if (!alive) return;
        setOnline(navigator.onLine); setChanges(next); setStorageError(""); setLoaded(true);
        if (previous > next.length && navigator.onLine) await client.invalidateQueries();
        previous = next.length;
      } catch { if (alive) setStorageError("Não foi possível acessar as alterações guardadas neste dispositivo."); }
    };
    const reconnect = () => { void refresh(); void offlineTransport?.flush(userId).catch(() => {}); };
    reconnect();
    window.addEventListener("icabv-sync", refresh);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", refresh);
    const timer = window.setInterval(reconnect, 15000);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("icabv-sync", refresh); window.removeEventListener("online", reconnect); window.removeEventListener("offline", refresh); };
  }, [userId, client]);
  const review = changes.some(c => c.state === "review");
  const state = storageError || review ? "review" : !online ? "offline" : !loaded ? "checking" : changes.length ? "syncing" : "synced";
  const Icon = online ? Wifi : WifiOff;
  const message = storageError || (!loaded ? "Verificando alterações deste dispositivo…" : review ? "Há alterações que precisam de revisão" : changes.length ? `${changes.length} alteração(ões) aguardando envio${online ? "" : " · Sem conexão"}` : online ? "Tudo sincronizado" : "Sem conexão · usando dados deste dispositivo");
  return <div className={`sync-control is-${state}`} ref={root}>
    <button ref={trigger} className="sync-trigger icon-btn" type="button" aria-label={`Sincronização: ${message}`} title={message} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
      <Icon size={19} aria-hidden="true" />
    </button>
    <span className="sr-only" role="status">{message}</span>
    {open && <section id={panelId} className="sync-popover" aria-label="Sincronização">
      <div className="sync-popover-heading"><h2>Sincronização</h2><button className="icon-btn" aria-label="Fechar sincronização" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={18} /></button></div>
      <p className="sync-message"><Icon size={18} aria-hidden="true" />{message}</p>
      <p>As alterações ficam guardadas neste navegador e são enviadas pela mesma conta quando a conexão volta.</p>
      {changes.length > 0 && <div className="sync-details">
        {changes.map(c => <article key={c.id}><strong>{changeLabel(c)}</strong><small>{c.state === "review" ? changeError(c) : "Aguardando confirmação do servidor"}</small><button className="text-btn" onClick={async () => {
          if (!confirm("Remover esta alteração da fila? Se ela já tiver sido recebida pelo servidor antes de a conexão cair, isso não desfaz o que foi salvo no app. Outras alterações que dependam dela podem precisar de revisão.")) return;
          await offlineTransport?.cancel(userId, c.key!);
          await client.invalidateQueries();
        }}>Cancelar envio</button></article>)}
        <button className="secondary" disabled={!online} onClick={() => void offlineTransport?.retry(userId).catch(() => setStorageError("Não foi possível sincronizar agora. Tente novamente."))}>Tentar sincronizar</button>
      </div>}
    </section>}
  </div>;
}
