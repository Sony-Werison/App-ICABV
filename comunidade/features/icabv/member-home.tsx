"use client";
import {useState} from "react";
import {EventDialog,type Event} from "./core-screen";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
} from "lucide-react";
import { supabase } from "./supabase";
import { Birthdays } from "./community-care";
import { CompactCard,CompactAnnouncement } from "./compact-card";
import {calendarDate} from "./agenda-calendar-model";
import {WeekendServices} from "./weekend-services";
import {useAgendaCommitments} from "./agenda-commitments";
import {AgendaCommitmentCard} from "./agenda-commitment-card";
import {Cake,Megaphone,CalendarDays} from "lucide-react";
export function MemberHome({
  name,
  personId,
  onNavigate,
}: {
  name: string;
  personId?:string;
  onNavigate: (tab: string) => void;
}) {
  const [selectedEvent,setSelectedEvent]=useState<Event|null>(null);
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
  const commitments=useAgendaCommitments(personId,today.slice(0,7),false);
  const events = useQuery({
    queryKey: ["member-home", "events"],
    queryFn: async () => {
      const r = await supabase!.rpc("browse_events", {
        page: 0,
        search: "",
        category: "",
        include_past: false,
      });
      if (r.error) throw r.error;
      return (r.data as Event[])
        .filter(
          (e) => e.status === "published" && new Date(e.ends_at) > new Date(),
        )
        .slice(0, 1);
    },
  });
  const news = useQuery({
    queryKey: ["member-home", "news"],
    queryFn: async () => {
      const r = await supabase!
        .from("announcements")
        .select("id,title,body,published,expires_at")
        .eq("published", true)
        .order("created_at", { ascending: false })
        .limit(4);
      if (r.error) throw r.error;
      return r.data.filter(
        (n) => !n.expires_at || new Date(n.expires_at) > new Date(),
      );
    },
  });
  return (
    <>
      <section className="member-intro">
        <p className="member-welcome member-welcome-emphasis">
          Olá, {name.split(" ")[0]}. Que bom ter você aqui.
        </p>
      </section>
      <WeekendServices />
      <div className="member-community-highlights">
      {(news.isPending||news.isError||!!news.data?.length)&&<section className="member-announcements">
        <div className="member-heading">
          <h2><Megaphone size={16} aria-hidden="true"/>Comunicados</h2>
          <button onClick={() => onNavigate("content")}>
            Ver conteúdos <ChevronRight size={15} />
          </button>
        </div>
        {news.isPending ? (
          <p className="church-empty">Carregando comunicados…</p>
        ) : news.error ? (
          <div className="church-empty" role="alert">
            <p>Não foi possível carregar os comunicados.</p>
            <button className="text-btn" onClick={() => void news.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : news.data?.length ? (
          <div className="member-news">
            {news.data.map((n) => (
              <CompactAnnouncement key={n.id} title={n.title} body={n.body}/>
            ))}
          </div>
        ) : (
          null
        )}
      </section>}
      <Birthdays compact onNavigate={onNavigate} />
      </div>
      {(events.isPending||events.isError||!!events.data?.length)&&<section className="member-program">
        <div className="member-heading">
          <h2>Próximo evento</h2>
          <button onClick={() => onNavigate("agenda")}>
            Ver agenda <ChevronRight size={15} />
          </button>
        </div>
        {events.isPending ? (
          <p className="church-empty">Carregando programação…</p>
        ) : events.error ? (
          <div className="church-empty" role="alert">
            <p>Não foi possível carregar a programação.</p>
            <button className="text-btn" onClick={() => void events.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : events.data?.length ? (
          <div className="program-carousel">
            {events.data.map((e) => (
              <CompactCard key={e.id} title={e.title} date={calendarDate(e.starts_at)} description={`${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(e.starts_at))} · Brasília${e.location?` · ${e.location}`:""}`} onClick={()=>setSelectedEvent(e)}/>
            ))}
          </div>
        ) : (
          null
        )}
      </section>}
      <section className="member-program member-commitments">
        <div className="member-heading"><h2 className="member-commitments-title"><CalendarDays size={18} aria-hidden="true"/>Próximos compromissos</h2><button onClick={() => onNavigate("agenda")}>Ver agenda <ChevronRight size={15}/></button></div>
        {commitments.pending ? <p className="church-empty">Carregando seus compromissos…</p> : commitments.errors.length ? <div className="church-empty" role="alert"><p>Não foi possível carregar alguns compromissos.</p><button className="text-btn" onClick={commitments.retry}>Tentar novamente</button></div> : commitments.upcoming.filter(item=>item.kind==="schedule").length ? <div className="member-news">{commitments.upcoming.filter(item=>item.kind==="schedule").slice(0,3).map(item=><AgendaCommitmentCard key={item.id} item={item} onNavigate={onNavigate}/>)}</div> : <p className="church-empty">Você não tem compromissos próximos cadastrados.</p>}
      </section>
      {selectedEvent&&<EventDialog event={selectedEvent} personId={personId} onLogin={()=>onNavigate("profile")} onClose={()=>setSelectedEvent(null)}/>}

    </>
  );
}
