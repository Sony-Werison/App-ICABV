"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cake, HandHeart, ChevronRight } from "lucide-react";
import { PagedList } from "./presentation";
import {CompactCard} from "./compact-card";
import { loadDailyBirthdays, loadWeeklyBirthdays, type Birthday } from "./birthday-week";
import { moduleRpc, ModuleForm, ModuleState, useModuleAction, useModuleRows } from "./module-ui";

export function churchDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
type Campaign = { id: string; title: string; description: string; collection_point: string; deadline: string; status: string };
type Item = { id: string; name: string; unit: string; target_quantity: number; committed_quantity: number; received_quantity: number; my_quantity: number; my_received: number };
type Commitment = { item_id: string; person_id: string; quantity: number; received_quantity: number };

export function Birthdays({ compact = false, weekly = false, date, onNavigate }: { compact?: boolean; weekly?: boolean; date?:string; onNavigate?: (tab: string) => void }) {
  const today = churchDate(), currentMonth = Number(today.slice(5, 7));
  const [month, setMonth] = useState(currentMonth), [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["modules", "anniversaries", date ? "day" : weekly ? "week" : compact ? "today" : "month", month, page, date ?? today],
    queryFn: () => date
      ? loadDailyBirthdays(date, (dayMonth, dayPage) => moduleRpc<Birthday[]>("anniversary_calendar", { month_number: dayMonth, page_number: dayPage }))
      : weekly
      ? loadWeeklyBirthdays(today, (weekMonth, weekPage) => moduleRpc<Birthday[]>("anniversary_calendar", { month_number: weekMonth, page_number: weekPage }))
      : compact
      ? loadDailyBirthdays(today, (weekMonth, weekPage) => moduleRpc<Birthday[]>("anniversary_calendar", { month_number: weekMonth, page_number: weekPage }))
      : moduleRpc<Birthday[]>("anniversary_calendar", { month_number: month, page_number: page }),
  });
  const rows = query.data ?? [];
  const daily=compact&&!weekly&&!date;
  if((daily||date||weekly)&&query.isSuccess&&rows.length===0)return null;
  return <section className={`${daily?"member-birthdays":"icabv-card"} care-birthdays`}>
    <div className="member-heading"><h2>{compact&&<Cake size={16} aria-hidden="true"/>}{compact?"Aniversariantes hoje":`Aniversariantes ${date ? "do dia" : weekly ? "da semana" : "da igreja"}`}</h2>
      {(compact || weekly || date) && <button onClick={() => onNavigate?.("birthdays")}>Ver todos <ChevronRight size={15} /></button>}
    </div>
    {!compact && !weekly && !date && <><p className="birthday-sharing-hint">Para aparecer no informe, preencha sua data de nascimento e ative “Compartilhar meu aniversário com a igreja” no Perfil. Apenas o dia e o mês são exibidos.</p><div className="birthday-month-navigation"><button type="button" className="icon-btn" aria-label="Mês anterior dos aniversariantes" onClick={()=>{setMonth(month===1?12:month-1);setPage(0);}}>‹</button><label className="icabv-field"><span className="sr-only">Mês</span>
      <select aria-label="Mês dos aniversariantes" value={month} onChange={e => { setMonth(Number(e.target.value)); setPage(0); }}>
        {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, i, 1)))}</option>)}
      </select>
    </label><button type="button" className="icon-btn" aria-label="Próximo mês dos aniversariantes" onClick={()=>{setMonth(month===12?1:month+1);setPage(0);}}>›</button></div></>}
    <ModuleState query={query}>
      {rows.length ? daily?<div className="member-birthday-cards icabv-card">{rows.map(person=><CompactCard key={person.person_id} title={person.full_name} titleIcon={Cake} date={today} description={person.anniversary_type==="wedding"?<span className="care-badge">Casamento</span>:"Aniversário"}/>)}</div>:<ul className="care-birthday-list">{rows.map(p => {
        const isToday = p.birth_month === currentMonth && p.birth_day === Number(today.slice(8, 10));
        const year=Number(today.slice(0,4)),now=Date.parse(`${today}T00:00:00Z`),anniversary=Date.UTC(year,p.birth_month-1,p.birth_day),days=Math.round(((anniversary<now?Date.UTC(year+1,p.birth_month-1,p.birth_day):anniversary)-now)/86400000);
        return <li key={p.person_id} className={isToday ? "care-today" : days<=7?"care-upcoming":""}>
          <span className="care-date">{String(p.birth_day).padStart(2, "0")}/{String(p.birth_month).padStart(2, "0")}</span>
          <strong>{p.full_name}</strong>{p.anniversary_type==="wedding"&&<span className="care-badge">Casamento</span>}{isToday ? <span className="care-badge">Hoje 🎉</span>:days<=7&&<span className="care-badge">Em {days} {days===1?'dia':'dias'}</span>}
        </li>;
      })}</ul> : <p className="church-empty">{date ? "Nenhum aniversário nesta data." : weekly ? "Nenhum aniversário nesta semana." : compact ? "Nenhum aniversário compartilhado hoje." : "Nenhum aniversário compartilhado neste mês."}</p>}
    </ModuleState>
    {!compact && !weekly && !date && (page>0||rows.length>=100) && <>
      <div className="card-actions"><button className="secondary" disabled={!page || query.isPending} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button className="secondary" disabled={rows.length < 100 || query.isPending} onClick={() => setPage(page + 1)}>Próxima</button></div>
    </>}
  </section>;
}

export function FoodDrive({ manager = false }: { manager?: boolean }) {
  const campaigns = useModuleRows<Campaign>("food_campaigns", "deadline");
  const [selected, setSelected] = useState(""), [campaignEditor, setCampaignEditor] = useState<Campaign | "new" | null>(null);
  const action = useModuleAction();
  const campaign = campaigns.data?.find(c => c.id === selected) ?? campaigns.data?.find(c => c.status === "open" && c.deadline >= churchDate()) ?? campaigns.data?.[0];
  return <section className="module-page care-page">
    <header className="member-heading"><div><span className="church-label">CUIDADO E SOLIDARIEDADE</span><h1><HandHeart size={26} /> Cestas básicas</h1></div>
      {manager && <button className="primary" onClick={() => setCampaignEditor("new")}>Nova campanha</button>}
    </header>
    <p>Juntos, ajudamos famílias que precisam. Escolha um ou mais itens e informe quanto você se compromete a levar.</p>
    {action.notice}
    {campaignEditor && <ModuleForm key={typeof campaignEditor === "string" ? "new" : campaignEditor.id} title={campaignEditor === "new" ? "Nova campanha de cestas" : "Editar campanha"}
      initial={campaignEditor === "new" ? { status: "open" } : campaignEditor} busy={action.busy} onCancel={() => setCampaignEditor(null)}
      fields={[{ name: "title", label: "Nome da campanha", required: true }, { name: "description", label: "Orientações", type: "textarea" }, { name: "collection_point", label: "Local e horário de entrega", required: true }, { name: "deadline", label: "Prazo de contribuição", type: "date", required: true }, { name: "status", label: "Situação", type: "select", required: true, options: [{ value: "open", label: "Aberta" }, { value: "closed", label: "Encerrada" }] }]}
      onSave={async v => {
        let savedId = "";
        const result = await action.act(async () => { savedId = await moduleRpc<string>("save_food_campaign", { resource: campaignEditor === "new" ? null : campaignEditor.id, campaign_title: v.title, details: v.description, collection: v.collection_point, due_date: v.deadline, campaign_status: v.status }); });
        if (result) { setSelected(savedId); setCampaignEditor(null); }
        return result;
      }} />}
    <ModuleState query={campaigns}>
      {!campaign ? <p className="church-empty">Ainda não há campanhas cadastradas. A igreja informará aqui os itens necessários e o local de entrega.</p> : <>
        <label className="icabv-field">Campanha<select aria-label="Campanha" value={campaign.id} onChange={e => setSelected(e.target.value)}>{campaigns.data?.map(c => <option value={c.id} key={c.id}>{c.title} · {c.status === "closed" ? "Encerrada" : c.deadline < churchDate() ? "Prazo encerrado" : "Aberta"}</option>)}</select></label>
        <article className="icabv-card care-campaign"><div className="member-heading"><h2>{campaign.title}</h2>{manager && <button className="secondary" onClick={() => setCampaignEditor(campaign)}>Editar campanha</button>}</div>
          <p className="care-description">{campaign.description}</p><p><strong>Entrega:</strong> {campaign.collection_point}</p>
          <p><strong>Prazo:</strong> {campaign.deadline.split("-").reverse().join("/")} · {campaign.status === "closed" || campaign.deadline < churchDate() ? "Campanha encerrada para contribuições" : "Recebendo compromissos de contribuição"}</p>
        </article>
        <CampaignItems key={campaign.id} campaign={campaign} manager={manager} />
      </>}
    </ModuleState>
  </section>;
}

function CampaignItems({ campaign, manager }: { campaign: Campaign; manager: boolean }) {
  const query = useQuery({ queryKey: ["modules", "food-summary", campaign.id], queryFn: () => moduleRpc<Item[]>("food_item_summary", { campaign: campaign.id }), refetchInterval: 30000 });
  const [editor, setEditor] = useState<Item | "new" | null>(null);
  const action = useModuleAction();
  const closed = campaign.status !== "open" || campaign.deadline < churchDate();
  return <>
    <div className="member-heading"><h2>Itens da cesta</h2>{manager && <button className="secondary" onClick={() => setEditor("new")}>Adicionar item</button>}</div>
    <p>Comprometido: o que foi combinado. Recebido: o que já foi entregue.</p>
    {action.notice}
    {editor && <ModuleForm key={typeof editor === "string" ? "new" : editor.id} title={editor === "new" ? "Adicionar item à cesta" : "Editar item"} initial={editor === "new" ? { unit: "pacote de 1 kg", target_quantity: 1 } : editor} busy={action.busy} onCancel={() => setEditor(null)}
      fields={[{ name: "name", label: "Nome do item", required: true }, { name: "unit", label: "Unidade / embalagem", required: true, hint: "Ex.: pacote de 5 kg, lata de 900 ml ou unidade." }, { name: "target_quantity", label: "Quantidade necessária", type: "number", min: 1, max: 100000, step: "1", required: true }]}
      onSave={async v => {
        const result = await action.act(() => moduleRpc("save_food_item", { resource: editor === "new" ? null : editor.id, campaign: campaign.id, item_name: v.name, item_unit: v.unit, target: v.target_quantity }));
        if (result) setEditor(null);
        return result;
      }} />}
    <ModuleState query={query}>
      {!query.data?.length && <p className="church-empty">Os itens desta campanha ainda não foram definidos.</p>}
      <div className="care-items">{query.data?.map(item => <article className="icabv-card care-item" key={item.id}>
        <div className="member-heading"><h3>{item.name}</h3>{manager && <button className="text-btn" onClick={() => setEditor(item)}>Editar item</button>}</div>
        <span className="care-badge">{item.unit}</span>
        <dl className="care-totals"><div><dt>Necessário</dt><dd>{item.target_quantity}</dd></div><div><dt>Comprometido</dt><dd>{item.committed_quantity}</dd></div><div><dt>Recebido</dt><dd>{item.received_quantity}</dd></div></dl>
        <progress aria-label={`${item.name}: quantidade recebida`} max={item.target_quantity} value={item.received_quantity} />
        <p><strong>{Math.max(0, item.target_quantity - Number(item.committed_quantity))}</strong> ainda sem compromisso de contribuição.</p>
        <p>Minha contribuição: <strong>{item.my_quantity}</strong> · Recebido: <strong>{item.my_received}</strong></p>
        <CommitmentForm key={`${item.id}-${item.my_quantity}-${item.committed_quantity}-${item.my_received}`} item={item} closed={closed} />
      </article>)}</div>
    </ModuleState>
    {manager && <Receipts campaignId={campaign.id} items={query.data ?? []} />}
  </>;
}
function CommitmentForm({ item, closed }: { item: Item; closed: boolean }) {
  const action = useModuleAction();
  const maximum = item.target_quantity - Number(item.committed_quantity) + item.my_quantity;
  return <form onSubmit={e => {
    e.preventDefault();
    const amount = Number(new FormData(e.currentTarget).get("amount"));
    void action.act(() => moduleRpc("commit_food_item", { item: item.id, amount }), amount ? "Sua contribuição foi registrada. Obrigado por ajudar!" : "Seu compromisso de contribuição foi cancelado.");
  }}>
    <label className="icabv-field">Quantidade de {item.name} que vou levar<input name="amount" type="number" step="1" min={Math.max(item.my_received, item.my_quantity > 0 ? 0 : 1)} max={maximum} defaultValue={item.my_quantity || (maximum > 0 ? 1 : 0)} required disabled={closed || action.busy || maximum === 0} /></label>
    <button className="primary" disabled={closed || action.busy || maximum === 0}>{item.my_quantity ? "Atualizar contribuição" : "Quero contribuir"}</button>
    {item.my_quantity > 0 && !closed && <small>Para cancelar, informe 0. A quantidade já recebida deve ser mantida.</small>}
    {action.notice}
  </form>;
}
function Receipts({ campaignId, items }: { campaignId: string; items: Item[] }) {
  const commitments = useModuleRows<Commitment>("food_commitments", "person_id");
  const people = useModuleRows<{ id: string; full_name: string }>("persons", "full_name");
  return <section className="icabv-card"><h2>Conferir entregas</h2><p>Informe o total recebido de cada pessoa. Apenas a gestão visualiza os nomes dos contribuintes.</p>
    <ModuleState query={commitments}><ModuleState query={people}>
      <PagedList className="care-receipts" label="contribuições recebidas" resetKey={campaignId} empty="Nenhuma contribuição registrada nesta campanha.">{commitments.data?.filter(c => c.quantity > 0).map(c => {
        const item = items.find(i => i.id === c.item_id);
        if (!item) return null;
        return <Receipt key={`${campaignId}-${c.item_id}-${c.person_id}-${c.received_quantity}`} commitment={c} name={people.data?.find(p => p.id === c.person_id)?.full_name ?? "Pessoa cadastrada"} item={item} />;
      })}</PagedList>
    </ModuleState></ModuleState>
  </section>;
}
function Receipt({ commitment: c, name, item }: { commitment: Commitment; name: string; item: Item }) {
  const action = useModuleAction();
  return <form className="care-receipt" onSubmit={e => { e.preventDefault(); const amount = Number(new FormData(e.currentTarget).get("received")); void action.act(() => moduleRpc("receive_food_item", { item: c.item_id, contributor: c.person_id, amount }), "Recebimento atualizado."); }}>
    <strong>{name}</strong><span>{item.name} · {item.unit} · Compromisso: {c.quantity}</span>
    <label className="icabv-field">Total recebido de {name} — {item.name}<input name="received" type="number" min="0" max={c.quantity} step="1" defaultValue={c.received_quantity} required /></label>
    <button className="secondary" disabled={action.busy}>Confirmar recebimento</button>{action.notice}
  </form>;
}
