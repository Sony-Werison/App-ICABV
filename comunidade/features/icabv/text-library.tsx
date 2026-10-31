"use client";
import { PagedList, LoadingState } from "./presentation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { readRecords } from "./records";
export function TextLibrary({ cells = false }: { cells?: boolean }) {
  const [search, setSearch] = useState(""),
    [type, setType] = useState("Todos");
  const q = useQuery({
    queryKey: ["management-library"],
    queryFn: readRecords,
  });
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const rows =
    q.data?.filter(
      (i) =>
        i.kind === (cells ? "cell" : "content") &&
        i.data.status === "Publicado" &&
        (cells || type === "Todos" || i.data.type === type) &&
        normalize(Object.values(i.data).join(" ")).includes(normalize(search)),
    ) ?? [];
  return (
    <section className="icabv-library">
      <h2 className="icabv-title">
        {cells ? "Diretório de células" : "Devocionais e estudos"}
      </h2>
      <label className="icabv-field">
        {cells ? "Buscar células" : "Buscar textos"}
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {!cells && (
        <label className="icabv-field">
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {["Todos", "Devocional", "Estudo", "Pregação", "Culto ao vivo"].map(
              (t) => (
                <option key={t}>{t}</option>
              ),
            )}
          </select>
        </label>
      )}
      {q.isPending ? (
        <LoadingState />
      ) : q.error ? (
        <div role="alert">
          <p>Não foi possível carregar.</p>
          <button className="secondary" onClick={() => void q.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : rows.length ? (
        <PagedList label={cells ? "células" : "conteúdos"} resetKey={search + type}>{rows.map((i) => (
          <article className="icabv-card" key={i.id}>
            <span className="eyebrow">{cells ? "CÉLULA" : i.data.type}</span>
            <h3>{i.data.title}</h3>
            {cells ? (
              <>
                <p>Com {i.data.leader}</p>
                <p>
                  {i.data.weekday} · {i.data.time}
                </p>
                <p>{i.data.location}</p>
                <p>{i.data.description}</p>
                {i.data.contactUrl && (
                  <a
                    className="secondary"
                    href={String(i.data.contactUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Falar com a liderança
                  </a>
                )}
              </>
            ) : (
              <>
                <p>{i.data.reference}</p>
                <p>{i.data.speaker}</p>
                <details>
                  <summary>Ler conteúdo</summary>
                  <p>{i.data.body}</p>
                  {i.data.url && (
                    <a
                      className="secondary"
                      href={String(i.data.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir conteúdo
                    </a>
                  )}
                </details>
              </>
            )}
          </article>
        ))}</PagedList>
      ) : (
        <p>
          {cells
            ? "Nenhuma célula publicada."
            : "Nenhum texto publicado para esta busca."}
        </p>
      )}
    </section>
  );
}
