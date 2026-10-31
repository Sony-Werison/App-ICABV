"use client";
import { useState } from "react";
import { SearchField, searchText } from "./presentation";
import {useManagementSummary} from "./management-data";
import {RecordTitle} from "./record-title";
import {
  UsersRound,
  CalendarDays,
  HandHeart,
  ClipboardList,
  ArrowUpRight,
  ChevronRight,
  BookOpen,
  Wallet,
  Music2,
  GraduationCap,
  Cake,
} from "lucide-react";
import type { Capabilities } from "./module-ui";

const modules = [
  { id: "food-drive", label: "Cestas básicas", description: "Campanhas, contribuições e recebimentos", icon: HandHeart },
  { id: "birthdays", label: "Aniversariantes", description: "Informe dos aniversários compartilhados", icon: Cake },
  {
    id: "louvor",
    label: "Louvor",
    description: "Repertório, cultos, ensaios e equipe",
    icon: Music2,
  },
  {
    id: "ebd",
    label: "Painel EBD",
    description: "Turmas, atividades e acompanhamento",
    icon: GraduationCap,
  },
  {
    id: "people",
    label: "Pessoas",
    description: "Cadastros, vínculos e permissões",
    icon: UsersRound,
  },
  {
    id: "core-manage",
    label: "Eventos e conteúdos",
    description: "Agenda, comunicados e publicações",
    icon: CalendarDays,
  },
  {
    id: "community",
    label: "Grupos e encontros",
    description: "Participação, presença e cuidado",
    icon: UsersRound,
  },
  {
    id: "ministries",
    label: "Equipes e escalas",
    description: "Ministérios e serviço voluntário",
    icon: HandHeart,
  },
  {
    id: "records",
    label: "Finanças e arquivo",
    description: "Lançamentos financeiros e consulta ao arquivo anterior",
    icon: BookOpen,
  },
  {
    id: "finance",
    label: "Simulador financeiro",
    description: "Ambiente de simulação financeira",
    icon: Wallet,
  },
];
export function ManagementHome({
  name,
  people,
  finance,
  capabilities,
  onNavigate,
}: {
  name: string;
  people: boolean;
  finance: boolean;
  capabilities: Capabilities;
  onNavigate: (tab: string) => void;
}) {
  const [search, setSearch] = useState("");
  const summary = useManagementSummary();
  const visible = modules.filter((m) =>
    m.id === "louvor"
      ? capabilities.louvor_manager
      : m.id === "ebd"
        ? capabilities.ebd_manager ||
          capabilities.ebd_teacher ||
          capabilities.ebd_observer
        : m.id === "records"
          ? people || finance
          : m.id === "finance"
            ? finance
            : people,
  );
  return (
    <>
      <header className="management-heading">
        <div>
          <span className="church-label">ICABV / PAINEL DE GESTÃO</span>
          <h1>Gestão da igreja</h1>
          <p>
            Bem-vindo, {name.split(" ")[0]}. Acompanhe a comunidade e organize a
            semana.
          </p>
        </div>
        <button
          className="primary"
          onClick={() =>
            onNavigate(
              people
                ? "people"
                : finance
                  ? "records"
                  : capabilities.louvor_manager
                    ? "louvor"
                    : "ebd",
            )
          }
        >
          {people
            ? "Gerenciar pessoas"
            : finance
              ? "Abrir registros"
              : "Abrir meu módulo"}
          <ArrowUpRight size={16} />
        </button>
      </header>
      {summary.error ? (
        <div role="alert" className="icabv-card">
          <p>Não foi possível carregar o resumo.</p>
          <button className="secondary" onClick={() => void summary.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="management-stats">
          {people && (
            <article>
              <span className="management-stat-icon">
                <UsersRound size={20} />
              </span>
              <div>
                <p>Pessoas cadastradas</p>
                <strong>
                  {summary.isPending ? "—" : (summary.data?.persons ?? "—")}
                </strong>
                <small>Cadastros não arquivados</small>
              </div>
            </article>
          )}
          <article>
            <span className="management-stat-icon">
              <CalendarDays size={20} />
            </span>
            <div>
              <p>Próximos eventos</p>
              <strong>
                {summary.isPending ? "—" : (summary.data?.event_count ?? "—")}
              </strong>
              <small>Eventos publicados</small>
            </div>
          </article>
          <article>
            <span className="management-stat-icon">
              <UsersRound size={20} />
            </span>
            <div>
              <p>Grupos publicados</p>
              <strong>
                {summary.isPending ? "—" : (summary.data?.group_count ?? "—")}
              </strong>
              <small>Grupos publicados</small>
            </div>
          </article>
        </div>
      )}
      <section className="management-modules">
        <div className="member-heading">
          <h2>Áreas de trabalho</h2>
          <span className="church-label">ACESSO CONFORME SEU PERFIL</span>
        </div>
        <SearchField label="Buscar área de gestão" value={search} onChange={setSearch} />
        <div className="management-module-grid">
          {visible.filter(m => searchText(m.label + " " + m.description).includes(searchText(search))).map((m) => (
            <button
              key={m.id}
              aria-label={m.label}
              onClick={() => onNavigate(m.id)}
            >
              <span className="module-symbol">
                <m.icon size={23} />
              </span>
              <span>
                <strong>{m.label}</strong>
                <small>{m.description}</small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      </section>
      <div className="management-lower">
        <section className="icabv-card">
          <div className="member-heading">
            <h2>Próximos eventos</h2>
            <button onClick={() => onNavigate("core-manage")}>
              Abrir agenda
              <ChevronRight size={15} />
            </button>
          </div>
          {summary.data?.events.length ? (
            summary.data.events.slice(0, 4).map((e) => (
              <div className="management-agenda-row" key={e.id}>
                <span className="agenda-date">
                  {new Intl.DateTimeFormat("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    timeZone: "America/Sao_Paulo",
                  }).format(new Date(e.starts_at))}
                </span>
                <span>
                  <strong><RecordTitle title={e.title}/></strong>
                  <small>{e.location}</small>
                </span>
              </div>
            ))
          ) : (
            <p className="church-empty">
              A programação publicada aparecerá aqui.
            </p>
          )}
        </section>
        <section className="icabv-card">
          <div className="member-heading">
            <h2>Organizar o serviço</h2>
            <ClipboardList size={18} />
          </div>
          <p className="management-help">
            Acompanhe os responsáveis, as solicitações de participação e as
            próximas escalas de cada equipe.
          </p>
          <button
            className="secondary"
            onClick={() => onNavigate("ministries")}
          >
            Ver equipes e escalas
            <ChevronRight size={15} />
          </button>
        </section>
      </div>
    </>
  );
}
