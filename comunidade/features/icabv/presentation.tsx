"use client";
import { Children, Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { ChevronLeft, ChevronRight, ChevronDown, MoreHorizontal, Search, type LucideIcon } from "lucide-react";

/** Presentation only: content stays mounted so closing a panel preserves form values. */
export function Disclosure({ title, description, children, open = false, lazy = false, onOpenChange }: { title: string; description?: string; children: ReactNode; open?: boolean; lazy?: boolean; onOpenChange?:(open:boolean)=>void }) {
  const [loaded,setLoaded]=useState(open);
  return <details className="ui-disclosure" open={open || undefined} onToggle={event=>{const expanded=event.currentTarget.open;if(expanded)setLoaded(true);onOpenChange?.(expanded);}}>
    <summary><span><strong>{title}</strong>{description && <small>{description}</small>}</span><ChevronDown size={18} aria-hidden="true" /></summary>
    {(!lazy||loaded)&&<div className="ui-disclosure-content">{children}</div>}
  </details>;
}

/** Page complete in-memory result sets without touching API pagination or exports. */
export function PagedList({ children, label = "registros", pageSize = 12, resetKey = "", className = "", empty = "Nenhum resultado. Tente outra busca ou ajuste os filtros.", grouping }: { children: ReactNode; label?: string; pageSize?: number; resetKey?: string; className?: string; empty?: string; grouping?:{keys:string[];heading:(key:string)=>ReactNode} }) {
  const [state, setState] = useState({ page: 0, key: resetKey });
  const printing = usePrintMode();
  const collection = useRef<HTMLDivElement>(null), dirty = useRef(false);
  const id = useId();
  const rows = Children.toArray(children), total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(state.key === resetKey ? state.page : 0, pages - 1);
  const start=printing?0:current*pageSize;
  const visible=printing?rows:rows.slice(start,start+pageSize);
  const change = (page: number) => {
    if (dirty.current && !window.confirm("Há campos alterados nesta página. Confira se salvou antes de continuar. Trocar de página?")) return;
    dirty.current = false; setState({ page, key: resetKey }); collection.current?.scrollIntoView({ block: "start" });
  };
  return <div className={`ui-collection ${className}`} ref={collection} onChangeCapture={() => { dirty.current = true; }}>
    {total > pageSize && <div className="ui-results" aria-live="polite">{current * pageSize + 1}–{Math.min((current + 1) * pageSize, total)} de {total} {label}</div>}
    <div id={id} className="ui-collection-items">{total ? grouping?visible.map((row,index)=><Fragment key={start+index}>{(index===0||grouping.keys[start+index]!==grouping.keys[start+index-1])&&grouping.heading(grouping.keys[start+index])}{row}</Fragment>):visible : <p className="church-empty">{empty}</p>}</div>
    {pages > 1 && <PaginationControls current={current} pages={pages} label={label} onChange={change} controls={id} />}
  </div>;
}

export const searchText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export function SearchField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="icabv-field ui-search"><span>{label}</span><span><Search size={18} aria-hidden="true" /><input type="search" aria-label={label} value={value} onChange={e => onChange(e.target.value)} placeholder="Digite para buscar…" /></span></label>;
}

export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return <div className="ui-loading" role="status"><span>{label}</span><span className="ui-skeleton" aria-hidden="true" /><span className="ui-skeleton" aria-hidden="true" /></div>;
}

export function WorkspaceNavigation({ items, current, onNavigate, mainIds = ["manage", "people", "core-manage", "louvor", "ebd"], buttonClassName = "" }: { items: { id: string; label: string; icon: LucideIcon }[]; current: string; onNavigate: (id: string) => void; mainIds?: string[]; buttonClassName?: string }) {
  const main = items.filter(i => mainIds.includes(i.id)), more = items.filter(i => !mainIds.includes(i.id));
  const [expanded, setExpanded] = useState(more.some(i => i.id === current));
  if(!buttonClassName){
    const sections=[['Painel',['manage']],['Pessoas',['people','families','birthdays','prayers']],['Comunidade',['community','ministries','food-drive']],['Ensino e louvor',['louvor','ebd']],['Administração',['core-manage','records','finance']]] as const;
    return <nav className="ui-workspace-nav" aria-label="Áreas de gestão">{sections.map(([title,ids])=>{const entries=items.filter(item=>(ids as readonly string[]).includes(item.id));return entries.length?<section className="workspace-nav-group" key={title}><p>{title}</p>{entries.map(item=><button type="button" key={item.id} aria-current={current===item.id?'page':undefined} onClick={()=>onNavigate(item.id)}><item.icon size={18} aria-hidden="true"/><span>{item.label}</span></button>)}</section>:null;})}</nav>;
  }
  const item = (n: typeof items[number]) => <button type="button" className={buttonClassName ? buttonClassName + (current === n.id ? " active" : "") : undefined} key={n.id} aria-current={current === n.id ? "page" : undefined} onClick={() => onNavigate(n.id)}><n.icon size={18} aria-hidden="true" /><span>{n.label}</span>{current === n.id && <span className="admin-selected-dot" />}</button>;
  return <nav className="ui-workspace-nav" aria-label="Áreas de gestão">
    {main.map(item)}
    {!!more.length && <details open={expanded} onToggle={e => setExpanded(e.currentTarget.open)}><summary aria-current={more.some(i => i.id === current) ? "page" : undefined}><MoreHorizontal size={18} aria-hidden="true" /><span>Mais áreas</span><ChevronDown size={16} aria-hidden="true" /></summary><div>{more.map(item)}</div></details>}
  </nav>;
}

export function usePrintMode() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true)), after = () => setPrinting(false);
    window.addEventListener("beforeprint", before); window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  return printing;
}
export function PaginationControls({ current, pages, label, onChange, controls }: { current: number; pages: number; label: string; onChange: (page: number) => void; controls?: string }) {
  return <nav className="ui-pagination" aria-label={`Paginação de ${label}`}>
    <button className="secondary" type="button" disabled={current === 0} aria-controls={controls} onClick={() => onChange(current - 1)}><ChevronLeft size={16} aria-hidden="true" />Anterior</button>
    <span aria-live="polite">{current + 1} de {pages}</span>
    <button className="secondary" type="button" disabled={current + 1 >= pages} aria-controls={controls} onClick={() => onChange(current + 1)}>Próxima<ChevronRight size={16} aria-hidden="true" /></button>
  </nav>;
}
