"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  type Data,
  type FormField,
} from "./module-ui";
import {
  normalizeSong,
  normalizeChordVersions,
  songVersions,
  songHasChords,
  hasChordNotation,
  type ChordVersion,
  parseSongCsv,
  proposeMonth,
  transposeChord,
  transposeSheet,
  parseChordLine,
  type Live,
  type Rehearsal,
  type Service,
  type Song,
  type WorshipMember,
} from "./worship-model";
import { displayBrasilia, formatBrasilia, parseBrasilia } from "./event-format";
import { ScheduleBoard } from "./schedule-board";
import { scheduleDate, worshipScheduleEntries } from "./schedule-model";
import { ModuleImport } from "./module-import";
import { Disclosure, PagedList, searchText } from "./presentation";
import {Search,Music2,ChevronRight,MoreHorizontal,ArrowUp,ArrowDown,Trash2,Plus,Play,Pause,Radio,FileText,ZoomIn,ZoomOut} from "lucide-react";
import {WorshipDialog,WorshipRolePicker} from "./worship-ui";

const tabs = ["Biblioteca"];
const SONG_PAGE_SIZE = 12;
const localDate = (iso: string) => formatBrasilia(iso);
export function Worship({
  manager,
  personId,
  admin,
  initialSection,
  initialServiceId,
}: {
  manager: boolean;
  personId: string;
  admin: boolean;
  initialSection?: string;
  initialServiceId?: string;
}) {
  const [tab, setTab] = useState(initialSection && tabs.includes(initialSection) ? initialSection : "Biblioteca"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("Todas"),
    [quickFilter,setQuickFilter]=useState("all"),
    [song, setSong] = useState<Song | null>(null),
    [editing, setEditing] = useState<Song | null | undefined>(undefined);
  const [backgroundSongs, setBackgroundSongs] = useState<Song[]>([]),
    [backgroundLoading, setBackgroundLoading] = useState(true),
    [backgroundError, setBackgroundError] = useState(false),
    [backgroundAttempt, setBackgroundAttempt] = useState(0);
  const songs = useQuery({
    queryKey: ["modules", "worship_songs", "library-first-page"],
    queryFn: async () => {
      const result = await supabase!.from("worship_songs").select("*").order("title").order("id").range(0, SONG_PAGE_SIZE - 1);
      if (result.error) throw result.error;
      return result.data as Song[];
    },
  }),
    services = useModuleRows<Service>("worship_services", "starts_at", undefined, tab !== "Biblioteca"),
    members = useQuery({
      queryKey: ["modules", "worship-directory"],
      queryFn: () => moduleRpc<WorshipMember[]>("worship_directory"),
      enabled: tab !== "Biblioteca",
    });
  const action = useModuleAction();
  const rows = [...(songs.data ?? []), ...backgroundSongs],
    team = members.data ?? [],
    schedule = services.data ?? [];
  useEffect(() => {
    let cancelled = false;
    const firstPage = songs.data ?? [];
    setBackgroundSongs([]);
    setBackgroundError(false);
    if (firstPage.length < SONG_PAGE_SIZE) {
      setBackgroundLoading(false);
      return () => { cancelled = true; };
    }
    setBackgroundLoading(true);
    const loadRemaining = async () => {
      let offset = firstPage.length;
      try {
        while (!cancelled) {
          const result = await supabase!.from("worship_songs").select("*").order("title").order("id").range(offset, offset + 99);
          if (result.error) throw result.error;
          if (cancelled) return;
          const batch = result.data as Song[];
          setBackgroundSongs(current => [...current, ...batch]);
          if (batch.length < 100) break;
          offset += batch.length;
          await new Promise(resolve => window.setTimeout(resolve, 0));
        }
      } catch {
        if (!cancelled) setBackgroundError(true);
      } finally {
        if (!cancelled) setBackgroundLoading(false);
      }
    };
    void loadRemaining();
    return () => { cancelled = true; };
  }, [songs.data, backgroundAttempt]);
  const filteredSongs=rows.filter(s=>!s.archived&&(category==="Todas"||s.category===category)&&(quickFilter!=="new"||s.is_new)&&(quickFilter!=="chords"||songHasChords(s))&&searchText(s.title+" "+s.artist+" "+s.lyrics).includes(searchText(search))).sort((a,b)=>a.title.localeCompare(b.title,"pt-BR"));
  const change = (next: string) => {
    setTab(next);
    setEditing(undefined);
    setSong(null);
  };
  const saveSong = async (v: Data) => {
    let pdf_links: { name: string; url: string }[] = [];
    try {
      pdf_links = String(v.pdf_links ?? "")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, url] = line.split("|").map((x) => x.trim());
          if (!name || !safeHttps(url)) throw Error();
          return { name, url };
        });
    } catch {
      return action.act(() => Promise.reject(Error("invalid_pdf")));
    }
    const data = { ...v, pdf_links };
    return action
      .act(() =>
        supabase!
          .from("worship_songs")
          .upsert({ ...data, ...(editing ? { id: editing.id } : {}) })
          .select()
          .single(),
      )
      .then((ok) => {
        if (ok) setEditing(undefined);
        return ok;
      });
  };
  return (
    <div className="module-page worship-page">
      <header className="module-heading">
        <span className="church-label"><Music2 size={15} aria-hidden="true"/> MINISTÉRIO DE LOUVOR</span>
        <h1>Louvor</h1>
        <p>Músicas e preparação dos cultos.</p>
      </header>
      {tabs.length > 1 && <ModuleTabs
        tabs={tabs}
        current={tab}
        onChange={change}
        label="Áreas do Louvor"
        unified
        primaryTabs={["Biblioteca", "Escalas", "Sala ao vivo", "Ensaios"]}
      />}
      {editing===undefined&&action.notice}
      <ModuleState query={songs}>
            {tab === "Biblioteca" && (
              <>
                <div className="worship-library-toolbar">
                  <label className="icabv-field worship-search">
                    Buscar músicas
                    <span><Search size={18} aria-hidden="true"/><input type="search" placeholder="Título, artista ou trecho da letra"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    /></span>
                  </label>
                  {manager&&<button className="secondary" aria-label="Nova música" onClick={()=>setEditing(null)}><Plus size={17} aria-hidden="true"/><span className="worship-new-label">Nova música</span></button>}
                </div>
                <div className="worship-library-options worship-filter-panel">
                  <div className="worship-category-filters" role="group" aria-label="Categoria do repertório">
                    {[["Todas","Todas"],["Louvor","Louvores"],["Hino","Hinos"],["Infantil","Infantis"]].map(([value,label])=><button className="worship-filter-button" type="button" key={value} aria-label={label} aria-pressed={category===value} onClick={()=>setCategory(value)}><span>{label}</span></button>)}
                  </div>
                  <div className="worship-quick-filters" role="group" aria-label="Filtrar repertório">{[["all","Todas"],["new","Novas"],["chords","Com Cifras"]].map(([value,label])=><button className="worship-filter-button" key={value} type="button" aria-pressed={quickFilter===value} onClick={()=>setQuickFilter(value)}>{label}</button>)}</div>
                </div>
                <p className="worship-results" role="status">{backgroundLoading ? `Carregando o restante da biblioteca em segundo plano · ${rows.length} carregadas` : backgroundError ? `Biblioteca parcialmente carregada · ${rows.length} músicas` : `${filteredSongs.length} ${filteredSongs.length===1?"música":"músicas"}`}{backgroundError&&<button className="text-btn" onClick={()=>{setBackgroundError(false);setBackgroundAttempt(value=>value+1);}}>Tentar carregar o restante</button>}{(search||category!=="Todas"||quickFilter!=="all")&&<button className="text-btn" onClick={()=>{setSearch("");setCategory("Todas");setQuickFilter("all");}}>Limpar filtros</button>}</p>
                {editing !== undefined && (
                  <WorshipDialog title={editing?"Editar música":"Cadastrar música"} onClose={()=>setEditing(undefined)}>
                  {action.failed&&action.notice}
                  <SongForm key={editing?.id ?? "new-song"} song={editing} busy={action.busy} onSave={saveSong} onCancel={()=>setEditing(undefined)}
                  /></WorshipDialog>
                )}
                {song && (
                  <SongReader key={song.id} song={song} onClose={() => setSong(null)} />
                )}
                <PagedList className="module-list worship-song-list" label="músicas" resetKey={search + category + quickFilter} empty={rows.some(s => !s.archived) ? undefined : "Nenhuma música cadastrada. A equipe de gestão pode cadastrar ou importar o repertório."}>
                  {filteredSongs
                    .map((s) => (
                      <article className="icabv-card worship-song-row" key={s.id}>
                        <div className="module-row">
                          <button className="worship-song-open" aria-label={`Letra e cifra: ${s.title}`} onClick={()=>setSong(s)}><span className="worship-song-copy">
                            <h3>{s.title}</h3>
                            <p>
                              {s.artist||"Artista não informado"} · {s.category}{s.is_new&&" · Nova"}{songHasChords(s)&&" · Cifra"}{songVersions(s).length>1&&` · ${songVersions(s).length} versões`}
                            </p>
                          </span><ChevronRight size={17} aria-hidden="true"/></button>
                            {manager && (
                              <details className="worship-song-options"><summary aria-label={`Opções de ${s.title}`}><MoreHorizontal size={20}/></summary><div>
                                <button
                                  className="secondary"
                                  onClick={() => setEditing(s)}
                                >
                                  Editar música
                                </button>
                                <button
                                  className="secondary"
                                  disabled={action.busy}
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Arquivar a música “${s.title}”? Ela continuará nas escalas anteriores.`,
                                      )
                                    )
                                      void action.act(() =>
                                        supabase!
                                          .from("worship_songs")
                                          .update({ archived: true })
                                          .eq("id", s.id),
                                      );
                                  }}
                                >
                                  Arquivar
                                </button>
                              </div></details>
                            )}
                        </div>
                      </article>
                    ))}
                </PagedList>

              </>
            )}
            {tab !== "Biblioteca" && <ModuleState query={services}><ModuleState query={members}>
            {tab === "Escalas" && (
              <ServiceManager
                initialServiceId={initialServiceId}
                services={schedule}
                songs={rows}
                members={team}
                manager={manager}
                personId={personId}
              />
            )}
            {tab === "Calendário mensal" && (
              <MonthlyCalendar
                services={schedule}
                members={team}
                manager={manager}
              />
            )}
            {tab === "Ensaios" && (
              <Rehearsals songs={rows} personId={personId} />
            )}
            {tab === "Sala ao vivo" && (
              <LiveRoom
                songs={rows}
                services={schedule}
                manager={manager}
                personId={personId}
              />
            )}
            {tab === "Histórico" && (
              <WorshipHistory services={schedule} songs={rows} members={team} />
            )}
            {tab === "Equipe" && (
              <WorshipTeam members={team} manager={manager} />
            )}
            {tab === "Configurações" && (
              <>
              {manager && <Disclosure title="Editar várias músicas" description="Alterações em lote para a equipe de gestão"><BulkSongEdit songs={rows} /></Disclosure>}
              <WorshipSettings
                songs={rows}
                services={schedule}
                members={team}
                manager={manager}
                admin={admin}
              />
              </>
            )}
            </ModuleState></ModuleState>}
      </ModuleState>
    </div>
  );
}
const songFields: FormField[] = [
  { name: "title", label: "Título", required: true },
  { name: "artist", label: "Artista / compositor" },
  { name: "musical_key", label: "Tom original", required: true },
  {
    name: "category",
    label: "Categoria",
    type: "select",
    required: true,
    options: ["Hino", "Louvor", "Infantil"].map((value) => ({
      value,
      label: value,
    })),
  },
  { name: "is_new", label: "Música nova", type: "checkbox" },
  { name: "lyrics", label: "Letra", type: "textarea" },
  {
    name: "chords",
    label: "Cifra",
    type: "textarea",
    hint: "Use linhas de acordes ou acordes entre colchetes, como [C] e [Am].",
  },
  {
    name: "pdf_links",
    label: "Partituras e PDFs",
    type: "textarea",
    hint: "Um por linha: Nome | https://endereço-do-arquivo",
  },
];
function SongForm({song,busy,onSave,onCancel}:{song:Song|null;busy:boolean;onSave:(v:Data)=>Promise<boolean>;onCancel:()=>void}) {
  const [versions,setVersions]=useState<ChordVersion[]>(()=>(song?songVersions(song):[]).map(v=>({...v})));
  const [error,setError]=useState("");
  const update=(id:string,patch:Partial<ChordVersion>)=>setVersions(old=>old.map(v=>v.id===id?{...v,...patch}:v));
  return <ModuleForm title={song?"Editar música":"Cadastrar música"} fields={songFields}
    initial={{...song,...(versions[0]?{chords:versions[0].chords,lyrics:versions[0].lyrics,musical_key:versions[0].musical_key}:{}),musical_key:versions[0]?.musical_key??song?.musical_key??"C",pdf_links:song?.pdf_links.map(p=>p.name+" | "+p.url).join("\n")??""}}
    busy={busy} onCancel={onCancel} onSave={async values=>{
      try {
        setError("");
        const next=normalizeChordVersions(versions.map((v,i)=>i===0?{...v,chords:String(values.chords??""),lyrics:String(values.lyrics??""),musical_key:String(values.musical_key)}:v));
        return onSave({...values,chord_versions:next});
      }catch{setError("Confira o nome, o tom e o conteúdo de cada versão.");return false;}
    }}>
    <Disclosure title="Versões da cifra" description={versions.length?`${versions.length} ${versions.length===1?"versão":"versões"}`:"Adicione arranjos à mesma música"}>
      <p className="worship-hint">A primeira versão usa os campos Tom original, Letra e Cifra acima. Renomeie as versões para identificar cada arranjo.</p>
      {versions.map((v,i)=><fieldset className="worship-version-editor" key={v.id}><legend>Versão {i+1}</legend>
        <label className="icabv-field">Nome da versão {i+1}<input aria-label={`Nome da versão ${i+1}`} value={v.name} maxLength={100} required onChange={e=>update(v.id,{name:e.target.value})}/></label>
        {i>0&&<>
          <label className="icabv-field">Tom da versão {i+1}<input aria-label={`Tom da versão ${i+1}`} value={v.musical_key} maxLength={20} required onChange={e=>update(v.id,{musical_key:e.target.value})}/></label>
          <label className="icabv-field">Cifra da versão {i+1}<textarea aria-label={`Cifra da versão ${i+1}`} rows={6} value={v.chords} maxLength={60000} onChange={e=>update(v.id,{chords:e.target.value})}/></label>
          <label className="icabv-field">Letra da versão {i+1}<textarea aria-label={`Letra da versão ${i+1}`} rows={5} value={v.lyrics} maxLength={60000} onChange={e=>update(v.id,{lyrics:e.target.value})}/></label>
        </>}
      </fieldset>)}
      <button type="button" className="secondary" disabled={versions.length>=50} onClick={()=>setVersions(old=>{
        const base=old.length?old:[{id:crypto.randomUUID(),name:"v.1",musical_key:song?.musical_key??"C",chords:song?.chords??"",lyrics:song?.lyrics??""}];
        return [...base,{id:crypto.randomUUID(),name:`v.${base.length+1}`,musical_key:song?.musical_key??"C",chords:"",lyrics:""}];
      })}>Adicionar versão</button>
    </Disclosure>
    {error&&<p role="alert">{error}</p>}
  </ModuleForm>;
}
export function SongReader({
  song,
  onClose,
  remoteTranspose,
  remoteScroll,
  remoteSpeed,
  initialView="chords",
  navigation,
}: {
  song: Song;
  onClose?: () => void;
  remoteTranspose?: number;
  remoteScroll?: boolean;
  remoteSpeed?: number;
  initialView?: "lyrics"|"chords";
  navigation?: ReactNode;
}) {
  const versions=songVersions(song);
  const [versionId,setVersionId]=useState(versions[0]?.id ?? "");
  const selected=versions.find(v=>v.id===versionId);
  const content=selected ?? song;
  const sheet=hasChordNotation(content.chords)?content.chords:"";
  const lyrics=content.lyrics||(!sheet?content.chords:"");
  const [amount, setAmount] = useState(0),
    [readerView,setReaderView]=useState(initialView==="lyrics"&&lyrics?"lyrics":"chords"),
    [scroll, setScroll] = useState(false),
    [speed, setSpeed] = useState(30),
    [font, setFont] = useState(18);
  const panel = useRef<HTMLDivElement>(null),
    transposition = remoteTranspose ?? amount,
    scrolling = remoteScroll ?? scroll,
    scrollSpeed = remoteSpeed ?? speed;
  const showingChords=readerView==="chords"&&!!sheet;
  useEffect(() => {
    if (!scrolling||!showingChords) return;
    const id = setInterval(() => {
      if (panel.current) panel.current.scrollTop += scrollSpeed / 20;
    }, 50);
    return () => clearInterval(id);
  }, [scrolling, scrollSpeed, showingChords]);
  const reader = (
    <section className="icabv-card song-reader">
      {navigation}
      <div className="module-row">
        <h2>{song.title}</h2>
        <span className="worship-key" aria-label={`Tom atual: ${transposeChord(content.musical_key,transposition)}`}>{content.musical_key==="N/A"?"—":transposeChord(content.musical_key,transposition)}</span>
      </div>
      <p>
        {song.artist}
      </p>
      {(versions.length>0||(sheet&&lyrics))&&<div className="worship-quick-filters" role="group" aria-label="Conteúdo da música">
        {versions.length?versions.map(version=>{const chords=hasChordNotation(version.chords);return <button key={version.id} aria-pressed={versionId===version.id&&readerView===(chords?"chords":"lyrics")} onClick={()=>{setVersionId(version.id);setReaderView(chords?"chords":"lyrics");setAmount(0);setScroll(false);if(panel.current)panel.current.scrollTop=0;}}>{chords?"Cifra":"Letra"} ({version.name})</button>;}):<button aria-pressed={readerView==="chords"} onClick={()=>setReaderView("chords")}>Cifra</button>}
        {lyrics&&<button aria-pressed={readerView==="lyrics"} onClick={()=>{setReaderView("lyrics");setScroll(false);}}>Letra</button>}
      </div>}
      <div className="card-actions reader-controls" aria-label="Ajustes da leitura">
        {showingChords && remoteTranspose === undefined && (
          <>
            <button
              className="secondary"
              disabled={amount <= -12}
              onClick={() => setAmount((a) => a - 1)}
            >
              Tom −
            </button>
            <button className="secondary" onClick={() => setAmount(0)}>
              Tom original
            </button>
            <button
              className="secondary"
              disabled={amount >= 12}
              onClick={() => setAmount((a) => a + 1)}
            >
              Tom +
            </button>
          </>
        )}
        {showingChords && remoteScroll === undefined && (
          <button className="secondary" onClick={() => setScroll((v) => !v)}>
            {scroll?<Pause size={16} aria-hidden="true"/>:<Play size={16} aria-hidden="true"/>}{scroll ? "Parar rolagem" : "Rolar cifra"}
          </button>
        )}
      </div>
      {showingChords && remoteSpeed === undefined && scrolling && (
        <label className="icabv-field">
          Velocidade de rolagem · {speed}
          <input
            type="range"
            min={1}
            max={100}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </label>
      )}
      <div className="song-sheet-container">
        <div ref={panel} className="song-sheet" data-view={showingChords?"chords":"lyrics"} tabIndex={0} role="region" aria-label={`Leitura de ${song.title}`} style={{ fontSize: font }}>
          {showingChords?<div className="song-chord-sheet">{transposeSheet(sheet,transposition).split(/\r?\n/).map((line,lineIndex)=>{const parsed=parseChordLine(line),width=Math.max(parsed.text.length,...parsed.chords.map(chord=>chord.position+chord.name.length),1);return <div className={`song-chord-line${!parsed.text&&!parsed.chords.length?" is-empty":""}`} style={{width:`${width}ch`}} key={lineIndex}>{parsed.chords.map((chord,index)=><span className="song-chord-label" style={{left:`${chord.position}ch`}} key={`${chord.position}-${index}`}>{chord.name}</span>)}<span className="song-chord-lyrics">{parsed.text||"\u00a0"}</span></div>})}</div>:<pre>{(readerView==="lyrics"||!sheet?lyrics:"Letra e cifra ainda não cadastradas.")||"Letra e cifra ainda não cadastradas."}</pre>}
        </div>
        <div className="song-font-controls" role="group" aria-label="Tamanho da letra">
          <button type="button" className="icon-btn" aria-label="Diminuir tamanho da letra" title="Diminuir letra" disabled={font<=12} onClick={()=>setFont(value=>Math.max(12,value-2))}><ZoomOut size={17} aria-hidden="true"/></button>
          <button type="button" className="icon-btn" aria-label="Aumentar tamanho da letra" title="Aumentar letra" disabled={font>=40} onClick={()=>setFont(value=>Math.min(40,value+2))}><ZoomIn size={17} aria-hidden="true"/></button>
        </div>
      </div>
      {song.pdf_links.some(p=>safeHttps(p.url))&&<div className="song-pdf-links">{song.pdf_links.filter(p=>safeHttps(p.url)).map((p,i)=><a className="text-btn" key={i} href={p.url} target="_blank" rel="noreferrer"><FileText size={14} aria-hidden="true"/>{song.pdf_links.length===1?"PDF":`PDF · ${p.name}`}</a>)}</div>}
    </section>
  );
  return onClose?<WorshipDialog title="Letra e cifra" onClose={onClose} fullScreen>{reader}</WorshipDialog>:reader;
}

function PlaylistEditor({
  songs,
  value,
  onChange,
}: {
  songs: Song[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [selection, setSelection] = useState(""),[search,setSearch]=useState("");
  return (
    <div className="module-playlist">
      <div className="module-row"><h3>Repertório em ordem</h3><span className="worship-count">{value.length} {value.length===1?"música":"músicas"}</span></div>
      {!value.length&&<p className="worship-hint">Busque uma música abaixo para começar. Depois, ajuste a ordem pelas setas.</p>}
      <ol>
        {value.map((id, i) => (
          <li key={id + "-" + i}>
            <span>
              {songs.find((s) => s.id === id)?.title ?? "Música indisponível"}
            </span>
            <div className="card-actions">
              <button
                type="button"
                className="secondary"
                aria-label={`Subir música ${i + 1}`}
                disabled={!i}
                onClick={() => {
                  const next = [...value];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  onChange(next);
                }}
              >
                <ArrowUp size={16} aria-hidden="true"/>
              </button>
              <button
                type="button"
                className="secondary"
                aria-label={`Descer música ${i + 1}`}
                disabled={i === value.length - 1}
                onClick={() => {
                  const next = [...value];
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  onChange(next);
                }}
              >
                <ArrowDown size={16} aria-hidden="true"/>
              </button>
              <button
                type="button"
                className="secondary"
                aria-label={`Remover música ${i + 1}`}
                onClick={() => onChange(value.filter((_, n) => n !== i))}
              >
                <Trash2 size={16} aria-hidden="true"/>
              </button>
            </div>
          </li>
        ))}
      </ol>
      <label className="icabv-field">Buscar música para o repertório<input type="search" value={search} placeholder="Título ou artista" onChange={event=>{setSearch(event.target.value);setSelection("");}}/></label>
      <div className="module-row">
        <label className="icabv-field">
          Adicionar música
          <select
            value={selection}
            aria-label="Adicionar música"
            onChange={(e) => setSelection(e.target.value)}
          >
            <option value="">Selecione</option>
            {songs
              .filter((s) => !s.archived && !value.includes(s.id)&&searchText(s.title+" "+s.artist).includes(searchText(search)))
              .map((s) => (
                <option value={s.id} key={s.id}>
                  {s.title} · {s.musical_key}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          disabled={!selection}
          onClick={() => {
            onChange([...value, selection]);
            setSelection("");
          }}
        >
          Adicionar ao repertório
        </button>
      </div>
    </div>
  );
}
function ServiceManager({
  initialServiceId,
  services,
  songs,
  members,
  manager,
  personId,
}: {
  services: Service[];
  songs: Song[];
  members: WorshipMember[];
  manager: boolean;
  personId: string;
  initialServiceId?: string;
}) {
  const [editing, setEditing] = useState<Service | null | undefined>(),
    [playlist, setPlaylist] = useState<string[]>([]),
    [assignments, setAssignments] = useState<Record<string, string[]>>({}),
    [view, setView] = useState<Service | null>(null),
    [detailId, setDetailId] = useState<string | null>(initialServiceId ?? null),
    [song, setSong] = useState<Song | null>(null);
  const [boardMonth,setBoardMonth]=useState(()=>scheduleDate(services.find(service=>service.id===initialServiceId)?.starts_at ?? new Date().toISOString()).slice(0,7));
  const action = useModuleAction();
  const canPlaylist = (s: Service) =>
    manager ||
    Object.entries(s.assignments).some(
      ([role, ids]) =>
        role.toLowerCase().includes("abertura") && ids.includes(personId),
    );
  useEffect(() => { if (detailId) document.getElementById("worship-schedule-detail")?.focus(); }, [detailId]);
  function edit(s: Service | null) {
    setEditing(s);
    setPlaylist(s?.playlist ?? []);
    setAssignments(s?.assignments ?? {});
  }
  return (
    <>
      {action.notice}
      {manager && (
        <button className="primary" onClick={() => edit(null)}>
          Nova escala de culto
        </button>
      )}
      {editing !== undefined && (
        <WorshipDialog title={editing ? "Editar escala" : "Nova escala"} onClose={()=>setEditing(undefined)}><section className="icabv-card worship-service-editor">
          {action.failed&&action.notice}
          {manager && (
            <div className="module-form-grid">
              {[
                ...new Set([
                  "Abertura",
                  "Pregação",
                  "Multimídia",
                  ...members.flatMap((m) => m.roles),
                  ...Object.keys(assignments),
                ]),
              ].map((role) => (
                <WorshipRolePicker key={role} role={role} value={assignments[role]??[]} onChange={ids=>setAssignments({...assignments,[role]:ids})} people={members
                      .filter(
                        (m) =>
                          m.active &&
                          (m.roles.includes(role) ||
                            (role === "Pregação" &&
                              m.roles.includes("Convidado")) ||
                            (assignments[role] ?? []).includes(m.person_id)),
                      )
                    }/>
              ))}
            </div>
          )}
          <PlaylistEditor
            songs={songs}
            value={playlist}
            onChange={setPlaylist}
          />
          {manager ? (
            <ModuleForm
              key={editing?.id ?? "new-service"}
              title="Dados do culto"
              busy={action.busy}
              initial={{
                ...editing,
                starts_at: editing ? localDate(editing.starts_at) : "",
                period: editing?.period ?? "noite",
                status: editing?.status ?? "planned",
              }}
              fields={[
                { name: "title", label: "Nome do culto", required: true },
                {
                  name: "starts_at",
                  label: "Data e hora (Brasília)",
                  required: true,
                  hint: "DD/MM/AAAA HH:mm",
                },
                {
                  name: "period",
                  label: "Período",
                  type: "select",
                  required: true,
                  options: ["manhã", "noite", "ensaio", "outro"].map(
                    (value) => ({ value, label: value }),
                  ),
                },
                {
                  name: "status",
                  label: "Situação",
                  type: "select",
                  required: true,
                  options: [
                    { value: "planned", label: "Planejado" },
                    { value: "completed", label: "Concluído" },
                    { value: "canceled", label: "Cancelado" },
                  ],
                },
                {
                  name: "featured",
                  label: "Destacar na programação",
                  type: "checkbox",
                },
              ]}
              onCancel={() => setEditing(undefined)}
              onSave={async (v) => {
                const date = String(v.starts_at),
                  starts_at =
                    editing && date === localDate(editing.starts_at)
                      ? editing.starts_at
                      : parseBrasilia(date);
                if (!starts_at)
                  return action.act(() =>
                    Promise.reject(Error("invalid_date")),
                  );
                const ok = await action.act(() =>
                  supabase!
                    .from("worship_services")
                    .upsert({
                      ...v,
                      starts_at,
                      playlist,
                      assignments,
                      ...(editing ? { id: editing.id } : {}),
                    })
                    .select()
                    .single(),
                );
                if (ok) setEditing(undefined);
                return ok;
              }}
            />
          ) : (
            <div className="card-actions">
              <button
                className="primary"
                disabled={action.busy}
                onClick={async () => {
                  if (
                    await action.act(() =>
                      moduleRpc("save_worship_playlist", {
                        target_service: editing!.id,
                        songs: playlist,
                      }),
                    )
                  )
                    setEditing(undefined);
                }}
              >
                Salvar repertório
              </button>
              <button
                className="secondary"
                onClick={() => setEditing(undefined)}
              >
                Voltar
              </button>
            </div>
          )}
        </section></WorshipDialog>
      )}
      {view && (
        <WorshipDialog title={view.title} onClose={()=>setView(null)}><section className="icabv-card worship-repertoire">
          <p>{displayBrasilia(view.starts_at)}</p>
          <ol>
            {view.playlist.map((id, i) => (
              <li key={i}>
                <button
                  className="text-btn"
                  onClick={() =>
                    setSong(songs.find((s) => s.id === id) ?? null)
                  }
                >
                  {songs.find((s) => s.id === id)?.title ??
                    "Música indisponível"}
                </button>
              </li>
            ))}
          </ol>
          <button className="secondary" onClick={() => setView(null)}>
            Fechar repertório
          </button>
        </section></WorshipDialog>
      )}
      {song && <SongReader key={song.id} song={song} onClose={() => setSong(null)} />}
      <ScheduleBoard entries={worshipScheduleEntries(services, members)} month={boardMonth} onMonthChange={setBoardMonth} onSelect={entry => { setDetailId(entry.id); setView(null); }} />
      {detailId && <button className="text-btn" onClick={() => setDetailId(null)}>Ocultar detalhes da escala</button>}
      {services
        .filter(service => service.id === detailId)
        .slice()
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
        .map((s) => (
          <article className="icabv-card" id="worship-schedule-detail" tabIndex={-1} key={s.id}>
            <h3>
              {s.title}
              {s.featured && " · Destaque"}
            </h3>
            <p>
              {displayBrasilia(s.starts_at)} ·{" "}
              {s.status === "completed"
                ? "Concluído"
                : s.status === "canceled"
                  ? "Cancelado"
                  : "Planejado"}
            </p>
            {Object.entries(s.assignments).map(([role, ids]) => (
              <p key={role}>
                {role}:{" "}
                {ids
                  .map(
                    (id) =>
                      members.find((m) => m.person_id === id)?.full_name ??
                      "Pessoa indisponível",
                  )
                  .join(", ") || "A definir"}
              </p>
            ))}
            <p>{s.playlist.length} músicas</p>
            <div className="card-actions">
              <button className="secondary" onClick={() => setView(s)}>
                Ver repertório
              </button>
              {canPlaylist(s) && s.status === "planned" && (
                <button className="secondary" onClick={() => edit(s)}>
                  {manager ? "Editar escala" : "Editar repertório"}
                </button>
              )}
              <button
                className="secondary"
                onClick={() =>
                  downloadData(
                    "escala-louvor.txt",
                    `${s.title}\n${displayBrasilia(s.starts_at)}\n${Object.entries(
                      s.assignments,
                    )
                      .map(
                        ([role, ids]) =>
                          role +
                          ": " +
                          ids
                            .map(
                              (id) =>
                                members.find((m) => m.person_id === id)
                                  ?.full_name ?? "—",
                            )
                            .join(", "),
                      )
                      .join(
                        "\n",
                      )}\nRepertório:\n${s.playlist.map((id) => songs.find((song) => song.id === id)?.title ?? "—").join("\n")}`,
                  )
                }
              >
                Baixar escala
              </button>
            </div>
          </article>
        ))}
      {!services.length && (
        <p className="church-empty">Nenhuma escala de culto cadastrada.</p>
      )}
    </>
  );
}
function MonthlyCalendar({
  services,
  members,
  manager,
}: {
  services: Service[];
  members: WorshipMember[];
  manager: boolean;
}) {
  const [month, setMonth] = useState(scheduleDate(new Date().toISOString()).slice(0, 7)),
    [proposal, setProposal] = useState<ReturnType<typeof proposeMonth>>([]);
  const action = useModuleAction();
  const visible = services.filter(
    (s) =>
      scheduleDate(s.starts_at).slice(0,7)===month,
  );
  return (
    <>
      {action.notice}
      <section className="icabv-card">
        <h2>Calendário mensal</h2>
        <label className="icabv-field">
          Mês
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setProposal([]);
            }}
          />
        </label>
        <div className="card-actions">
          <button
            className="secondary"
            onClick={() =>
              downloadData(
                "louvor-" + month + ".csv",
                csvData([
                  [
                    "Data",
                    "Culto",
                    "Período",
                    ...Array.from(new Set(members.flatMap((m) => m.roles))),
                  ],
                  ...visible.map((s) => [
                    displayBrasilia(s.starts_at),
                    s.title,
                    s.period,
                    ...Array.from(new Set(members.flatMap((m) => m.roles))).map(
                      (role) =>
                        (s.assignments[role] ?? [])
                          .map(
                            (id) =>
                              members.find((m) => m.person_id === id)
                                ?.full_name ?? "—",
                          )
                          .join(", "),
                    ),
                  ]),
                ]),
              )
            }
          >
            Exportar mês
          </button>
          {manager && (
            <button
              className="primary"
              disabled={!month || !members.some((m) => m.active)}
              onClick={() =>
                setProposal(proposeMonth(month, members, services))
              }
            >
              Sugerir escalas dos domingos
            </button>
          )}
        </div>
        <p>
          As sugestões alternam pessoas elegíveis por função e consideram o
          histórico de escalas. Revise antes de salvar.
        </p>
      </section>
      {proposal.length > 0 && (
        <section className="icabv-card">
          <h2>Revisar sugestões</h2>
          {proposal.map((s, i) => (
            <div className="module-report-row" key={i}>
              <strong>
                {displayBrasilia(s.starts_at)} · {s.title}
              </strong>
              {Object.entries(s.assignments).map(([role, ids]) => (
                <p key={role}>
                  {role}:{" "}
                  {ids
                    .map(
                      (id) =>
                        members.find((m) => m.person_id === id)?.full_name ??
                        "—",
                    )
                    .join(", ") || "Sem pessoa elegível — definir depois"}
                </p>
              ))}
            </div>
          ))}
          <div className="card-actions">
            <button
              className="primary"
              disabled={action.busy}
              onClick={async () => {
                if (
                  await action.act(() =>
                    supabase!.from("worship_services").insert(proposal),
                  )
                )
                  setProposal([]);
              }}
            >
              Salvar sugestões
            </button>
            <button className="secondary" onClick={() => setProposal([])}>
              Descartar sugestões
            </button>
          </div>
        </section>
      )}
      <ScheduleBoard entries={worshipScheduleEntries(services, members)} month={month} onMonthChange={value=>{setMonth(value);setProposal([]);}} />
      {!visible.length && !proposal.length && (
        <p className="church-empty">Sem escalas neste mês.</p>
      )}
    </>
  );
}
function Rehearsals({ songs, personId }: { songs: Song[]; personId: string }) {
  const q = useModuleRows<Rehearsal>("worship_rehearsals", "created_at"),
    [playlist, setPlaylist] = useState<string[]>([]),
    [editing, setEditing] = useState<Rehearsal | null>(null),
    [song, setSong] = useState<Song | null>(null);
  const action = useModuleAction();
  return (
    <>
      {action.notice}
      <Disclosure title={editing?"Editar ensaio":"Criar ensaio"} description="Monte um repertório pessoal para praticar" open={!!editing}>
        <PlaylistEditor songs={songs} value={playlist} onChange={setPlaylist} />
        <ModuleForm
          key={editing?.id ?? "rehearsal"}
          title="Salvar ensaio"
          initial={{ title: editing?.title ?? "" }}
          fields={[{ name: "title", label: "Nome do ensaio", required: true }]}
          busy={action.busy}
          onCancel={
            editing
              ? () => {
                  setEditing(null);
                  setPlaylist([]);
                }
              : undefined
          }
          onSave={async (v) => {
            const ok = await action.act(() =>
              supabase!.from("worship_rehearsals").upsert({
                ...v,
                person_id: personId,
                playlist,
                ...(editing ? { id: editing.id } : {}),
              }),
            );
            if (ok) {
              setEditing(null);
              setPlaylist([]);
            }
            return ok;
          }}
        />
      </Disclosure>
      <ModuleState query={q}>
        <PagedList label="ensaios" empty="Você ainda não salvou ensaios. Abra Criar ensaio para montar seu primeiro repertório.">{q.data?.map((r) => (
          <article className="icabv-card" key={r.id}>
            <h3>{r.title}</h3>
            <p className="worship-hint">{r.playlist.length} músicas no repertório</p>
            <Disclosure title="Músicas do ensaio">
            <ol>
              {r.playlist.map((id, i) => (
                <li key={i}>
                  <button
                    className="text-btn"
                    onClick={() =>
                      setSong(songs.find((s) => s.id === id) ?? null)
                    }
                  >
                    {songs.find((s) => s.id === id)?.title ??
                      "Música indisponível"}
                  </button>
                </li>
              ))}
            </ol>
            </Disclosure>
            <div className="card-actions">
              <button
                className="secondary"
                onClick={() => {
                  setEditing(r);
                  setPlaylist(r.playlist);
                }}
              >
                Editar ensaio
              </button>
              <button
                className="secondary"
                disabled={action.busy}
                onClick={() => {
                  if (confirm("Excluir este ensaio pessoal?"))
                    void action.act(() =>
                      supabase!
                        .from("worship_rehearsals")
                        .delete()
                        .eq("id", r.id),
                    );
                }}
              >
                Excluir ensaio
              </button>
            </div>
          </article>
        ))}</PagedList>
      </ModuleState>
      {song && (
        <SongReader key={song.id} song={song} onClose={() => setSong(null)} />
      )}
    </>
  );
}
function LiveRoom({
  songs,
  services,
  manager,
  personId,
}: {
  songs: Song[];
  services: Service[];
  manager: boolean;
  personId: string;
}) {
  const [id, setId] = useState("");
  const action = useModuleAction(),
    service = services.find((s) => s.id === id),
    controls =
      !!service &&
      (manager ||
        Object.entries(service.assignments).some(
          ([role, ids]) =>
            role.toLowerCase().includes("abertura") && ids.includes(personId),
        ));
  const live = useQuery({
    queryKey: ["modules", "worship-live", id],
    enabled: !!id,
    queryFn: async () => {
      const r = await supabase!
        .from("worship_live")
        .select("*")
        .eq("service_id", id)
        .maybeSingle();
      if (r.error) throw r.error;
      return r.data as Live | null;
    },
    refetchInterval: 2000,
  });
  const state = live.data ?? {
      song_id: null,
      transpose: 0,
      scrolling: false,
      scroll_speed: 30,
      metronome: false,
      bpm: 80,
    },
    song = songs.find((s) => s.id === state.song_id);
  const update = (next: Data) =>
    action.act(
      () =>
        moduleRpc("set_worship_live", {
          target_service: id,
          state: { ...state, ...next },
        }),
      "Sala atualizada.",
    );
  return (
    <>
      {action.notice}
      <section className="icabv-card">
        <h2>Sala ao vivo</h2>
        <p>
          Escolha o culto para acompanhar a música e o tom junto com a equipe.
        </p>
        <label className="icabv-field">
          Culto
          <select
            aria-label="Culto"
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            <option value="">Selecione uma escala</option>
            {services
              .filter((s) => s.status !== "canceled")
              .slice().sort((a,b)=>b.starts_at.localeCompare(a.starts_at)).map((s) => (
                <option key={s.id} value={s.id}>
                  {displayBrasilia(s.starts_at)} · {s.title}
                </option>
              ))}
          </select>
        </label>
        {service && (
          <ModuleState query={live}>
            <p role="status" className="worship-live-status"><Radio size={16} aria-hidden="true"/>
              {live.data
                ? "Sala sincronizada"
                : "Aguardando a abertura iniciar a sala"}
            </p>
            <p className="worship-hint">{controls?"Você conduz esta sala. As alterações são compartilhadas com a equipe.":"Você está acompanhando. A abertura escalada conduz a sala."}</p>
            {controls && (
              <>
                <label className="icabv-field">
                  Música na tela
                  <select
                    disabled={action.busy}
                    aria-label="Música na tela"
                    value={state.song_id ?? ""}
                    onChange={(e) =>
                      void update({
                        song_id: e.target.value || null,
                        transpose: 0,
                      })
                    }
                  >
                    <option value="">Aguardando música</option>
                    {service.playlist.map((id) => (
                      <option key={id} value={id}>
                        {songs.find((s) => s.id === id)?.title ?? "—"}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="card-actions">
                  <button
                    className="secondary"
                    disabled={action.busy || state.transpose <= -12}
                    onClick={() =>
                      void update({ transpose: state.transpose - 1 })
                    }
                  >
                    Baixar tom da sala
                  </button>
                  <span>
                    {state.transpose > 0 ? "+" : ""}
                    {state.transpose} semitons
                  </span>
                  <button
                    className="secondary"
                    disabled={action.busy || state.transpose >= 12}
                    onClick={() =>
                      void update({ transpose: state.transpose + 1 })
                    }
                  >
                    Subir tom da sala
                  </button>
                  <button
                    className="secondary"
                    disabled={action.busy}
                    onClick={() => void update({ scrolling: !state.scrolling })}
                  >
                    {state.scrolling
                      ? "Parar rolagem da sala"
                      : "Iniciar rolagem da sala"}
                  </button>
                </div>
                <label className="icabv-field">
                  Velocidade da sala
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={state.scroll_speed}
                    disabled={action.busy}
                    onChange={(e) =>
                      void update({ scroll_speed: Number(e.target.value) })
                    }
                  />
                </label>
              </>
            )}
          </ModuleState>
        )}
      </section>
      {song && (
        <SongReader
          key={song.id}
          song={song}
          remoteTranspose={state.transpose}
          remoteScroll={state.scrolling}
          remoteSpeed={state.scroll_speed}
        />
      )}
    </>
  );
}
function WorshipHistory({
  services,
  songs,
  members,
}: {
  services: Service[];
  songs: Song[];
  members: WorshipMember[];
}) {
  const [year, setYear] = useState(String(new Date().getFullYear())),
    [quarter, setQuarter] = useState("Todos"),[search,setSearch]=useState("");
  const done = services.filter(
    (s) =>
      s.status === "completed" &&
      scheduleDate(s.starts_at).startsWith(year) &&
      (quarter === "Todos" ||
        Math.floor((Number(scheduleDate(s.starts_at).slice(5,7))-1) / 3) + 1 ===
          Number(quarter)),
  );
  const stats = songs
    .map((s) => ({
      song: s,
      count: done.filter((d) => d.playlist.includes(s.id)).length,
      total: services.filter(
        (d) => d.status === "completed" && d.playlist.includes(s.id),
      ).length,
    }))
    .sort((a, b) => b.count - a.count);
  return (
    <>
      <section className="icabv-card">
        <h2>Histórico e frequência do repertório</h2>
        <div className="module-filters">
          <label className="icabv-field">
            Ano
            <input
              type="number"
              min={2000}
              max={2200}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
          <label className="icabv-field">
            Trimestre
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
            >
              {["Todos", "1", "2", "3", "4"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <button
            className="secondary"
            onClick={() =>
              downloadData(
                "historico-louvor.csv",
                csvData([
                  [
                    "Música",
                    "No período",
                    "Total de cultos registrados",
                    "Total legado",
                    "Trimestre legado",
                  ],
                  ...stats.map((s) => [
                    s.song.title,
                    s.count,
                    s.total,
                    s.song.legacy_total ?? 0,
                    s.song.legacy_quarterly ?? 0,
                  ]),
                ]),
              )
            }
          >
            Exportar histórico
          </button>
        </div>
        <p>
          {done.length} cultos concluídos no período. As contagens usam apenas
          cultos marcados como concluídos.
        </p>
        <label className="icabv-field">Buscar no histórico<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Título ou artista"/></label>
        <PagedList label="músicas do relatório" pageSize={20} resetKey={year + quarter+search}>
        {stats.filter(s=>searchText(s.song.title+" "+s.song.artist).includes(searchText(search))).map((s) => (
          <div className="module-report-row" key={s.song.id}>
            <strong>{s.song.title}</strong>
            <span>
              {s.count} no período · {s.total} no total
              {!!s.song.legacy_total &&
                ` · Legado: ${s.song.legacy_total} no total, ${s.song.legacy_quarterly ?? 0} no trimestre de origem`}
            </span>
          </div>
        ))}
        </PagedList>
      </section>
      <Disclosure title="Cultos concluídos" description={`${done.length} registros no período`}>
      <PagedList label="cultos" resetKey={year + quarter}>
      {done.map((s) => (
        <article className="icabv-card" key={s.id}>
          <h3>
            {displayBrasilia(s.starts_at)} · {s.title}
          </h3>
          <p>
            {Object.entries(s.assignments)
              .map(
                ([role, ids]) =>
                  role +
                  ": " +
                  ids
                    .map(
                      (id) =>
                        members.find((m) => m.person_id === id)?.full_name ??
                        "—",
                    )
                    .join(", "),
              )
              .join(" · ")}
          </p>
        </article>
      ))}
      </PagedList>
      </Disclosure>
    </>
  );
}
function WorshipTeam({
  members,
  manager,
}: {
  members: WorshipMember[];
  manager: boolean;
}) {
  const people = useModulePeople("louvor", manager),
    action = useModuleAction();
  const [search,setSearch]=useState(""),[status,setStatus]=useState("all");
  return (
    <>
      {action.notice}
      {manager && (
        <Disclosure title="Adicionar integrante" description="Vincule uma pessoa já cadastrada na igreja">
        <ModuleState query={people}>
          <ModuleForm
            title="Vincular pessoa à equipe"
            fields={[
              {
                name: "person_id",
                label: "Pessoa do cadastro da igreja",
                type: "select",
                required: true,
                options: people.data?.map((p) => ({
                  value: p.id,
                  label: p.full_name,
                })),
              },
              {
                name: "roles",
                label: "Funções",
                required: true,
                hint: "Separe por vírgula: Abertura, Pregação, Multimídia, Convidado, Vocal, Violão...",
              },
            ]}
            busy={action.busy}
            onSave={(v) =>
              action.act(() =>
                supabase!.from("worship_members").upsert({
                  person_id: v.person_id,
                  roles: String(v.roles)
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  active: true,
                }),
              )
            }
          />
        </ModuleState>
        </Disclosure>
      )}
      <div className="module-filters"><label className="icabv-field">Buscar na equipe<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Nome ou função"/></label><label className="icabv-field">Situação na equipe<select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label></div>
      <PagedList label="integrantes" resetKey={search+status} empty={members.length?undefined:"Nenhum integrante cadastrado. A gestão pode adicionar pessoas à equipe."}>
      {members.filter(m=>searchText(m.full_name+" "+m.roles.join(" ")).includes(searchText(search))&&(status==="all"||m.active===(status==="active"))).map((m) => (
        <article className="icabv-card worship-team-row" key={m.person_id}>
          <span className="worship-avatar" aria-hidden="true">{m.full_name.split(" ").filter(Boolean).slice(0,2).map(name=>name[0]).join("")}</span><div>
          <h3>{m.full_name}</h3>
          <p>
            {m.roles.join(" · ") || "Funções a definir"} ·{" "}
            {m.active ? "Ativo" : "Inativo"}
          </p>
          </div>
          {manager && (
            <button
              className="secondary"
              disabled={action.busy}
              onClick={() =>
                void action.act(() =>
                  supabase!
                    .from("worship_members")
                    .update({ active: !m.active })
                    .eq("person_id", m.person_id),
                )
              }
            >
              {m.active ? "Desativar na equipe" : "Reativar na equipe"}
            </button>
          )}
        </article>
      ))}
      </PagedList>
    </>
  );
}
function BulkSongEdit({ songs }: { songs: Song[] }) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState("");
  const action = useModuleAction();
  if (!open)
    return (
      <div>
        <button className="secondary" onClick={() => setOpen(true)}>
          Editar músicas em lote
        </button>
      </div>
    );
  return (
    <section className="icabv-card">
      <h2>Edição de músicas em lote</h2>
      <label className="icabv-field">
        Músicas selecionadas
        <select
          aria-label="Músicas selecionadas"
          multiple
          value={selected}
          onChange={(e) =>
            setSelected([...e.target.selectedOptions].map((o) => o.value))
          }
        >
          {songs
            .filter((s) => !s.archived)
            .map((s) => (
              <option value={s.id} key={s.id}>
                {s.title} · {s.artist}
              </option>
            ))}
        </select>
      </label>
      <p>
        {selected.length} músicas selecionadas. Campos vazios preservam os
        valores atuais.
      </p>
      {error && <p role="alert">{error}</p>}
      {action.notice}
      <ModuleForm
        title="Alterações para as músicas selecionadas"
        fields={[
          {
            name: "category",
            label: "Nova categoria",
            type: "select",
            options: ["Hino", "Louvor", "Infantil"].map((value) => ({
              value,
              label: value,
            })),
          },
          { name: "artist", label: "Novo artista / compositor" },
          { name: "musical_key", label: "Novo tom original" },
          {
            name: "is_new",
            label: "Marcar como música nova",
            type: "select",
            options: [
              { value: "true", label: "Sim" },
              { value: "false", label: "Não" },
            ],
          },
        ]}
        busy={action.busy}
        onCancel={() => setOpen(false)}
        onSave={async (v) => {
          setError("");
          const patch = Object.fromEntries(
            Object.entries(v)
              .filter(([, value]) => value !== "")
              .map(([key, value]) => [
                key,
                key === "is_new" ? value === "true" : value,
              ]),
          );
          if (!selected.length || !Object.keys(patch).length) {
            setError("Selecione músicas e informe ao menos uma alteração.");
            return false;
          }
          if (
            !confirm(
              `Aplicar as alterações às ${selected.length} músicas selecionadas?`,
            )
          )
            return false;
          const ok = await action.act(() =>
            supabase!.from("worship_songs").update(patch).in("id", selected),
          );
          if (ok) {
            setSelected([]);
            setOpen(false);
          }
          return ok;
        }}
      />
    </section>
  );
}
function WorshipSettings({
  songs,
  services,
  members,
  manager,
  admin,
}: {
  songs: Song[];
  services: Service[];
  members: WorshipMember[];
  manager: boolean;
  admin: boolean;
}) {
  const [preview, setPreview] = useState<ReturnType<typeof normalizeSong>[]>(
      [],
    ),
    [error, setError] = useState("");
  const action = useModuleAction();
  return (
    <>
      {action.notice}
      <section className="icabv-card">
        <h2>Repertório e cópia dos dados</h2>
        <p>
          O acesso usa a conta individual da igreja. Os integrantes da abertura
          recebem controle do repertório e da sala somente nos cultos em que
          estão escalados.
        </p>
        <button
          className="secondary"
          onClick={() =>
            downloadData("louvor-icabv.json", {
              version: 1,
              songs,
              services,
              members,
              exported_at: new Date().toISOString(),
            })
          }
        >
          Exportar dados do Louvor
        </button>
        {manager && (
          <Disclosure title="Importar repertório" description="JSON do app antigo, TXT ou CSV">
            <label className="icabv-field">
              Importar repertório (JSON, TXT ou CSV)
              <input
                type="file"
                accept=".json,.txt,.csv"
                onChange={async (e) => {
                  setError("");
                  setPreview([]);
                  try {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 10_000_000)
                      throw Error("Arquivo muito grande.");
                    const text = await file.text();
                    const isCsv = file.name.toLowerCase().endsWith(".csv");
                    const source = isCsv
                      ? parseSongCsv(text)
                      : file.name.endsWith(".txt")
                        ? text
                            .split(/\r?\n\s*\r?\n/)
                            .filter(Boolean)
                            .map((block) => {
                              const [title, ...lyrics] = block.split(/\r?\n/);
                              return { title, lyrics: lyrics.join("\n") };
                            })
                        : JSON.parse(text);
                    const list = Array.isArray(source) ? source : source.songs;
                    if (!Array.isArray(list) || list.length > 3000)
                      throw Error(
                        "Selecione um repertório com até 3.000 músicas.",
                      );
                    if (isCsv) {
                      const updates = list.map((v: Data) => {
                        const matched = songs.filter(
                          (s) =>
                            s.title.toLowerCase() ===
                              String(v.title).toLowerCase() &&
                            (!v.artist || s.artist === v.artist),
                        );
                        if (matched.length > 1)
                          throw Error(
                            "Inclua a coluna artist para distinguir músicas com o mesmo título.",
                          );
                        const existing = matched[0];
                        return {
                          ...normalizeSong({
                            ...existing,
                            ...v,
                            ...(v.key ? { musical_key: v.key } : {}),
                            ...(v.isNew !== undefined
                              ? { is_new: v.isNew }
                              : {}),
                            ...(v.timesPlayedQuarterly !== undefined
                              ? { legacy_quarterly: v.timesPlayedQuarterly }
                              : {}),
                            ...(v.timesPlayedTotal !== undefined
                              ? { legacy_total: v.timesPlayedTotal }
                              : {}),
                          }),
                          ...(existing ? { id: existing.id } : {}),
                        };
                      });
                      setPreview(updates);
                      return;
                    }
                    const normalized = list.map((v) => normalizeSong(v));
                    const existing = new Set(
                      songs.map((s) =>
                        (s.title + "|" + s.artist).toLocaleLowerCase(),
                      ),
                    );
                    const unique = new Set<string>();
                    setPreview(
                      normalized.filter((s) => {
                        const key = (
                          s.title +
                          "|" +
                          s.artist
                        ).toLocaleLowerCase();
                        if (existing.has(key) || unique.has(key)) return false;
                        unique.add(key);
                        return true;
                      }),
                    );
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Arquivo inválido.",
                    );
                  }
                }}
              />
            </label>
            <p>
              JSON aceita o backup do Louvor antigo. Em TXT, cada bloco contém o
              título na primeira linha e a letra nas seguintes, separado por uma
              linha vazia. Músicas com mesmo título e artista são ignoradas.
              Pessoas e escalas não são vinculadas automaticamente por nome.
            </p>
            {error && <p role="alert">{error}</p>}
            {preview.length > 0 && (
              <>
                <h3>Revisar importação · {preview.length} músicas</h3>
                <ul>
                  {preview.slice(0, 20).map((s, i) => (
                    <li key={i}>
                      {s.title} · {s.artist}
                    </li>
                  ))}
                </ul>
                <button
                  className="primary"
                  disabled={action.busy}
                  onClick={async () => {
                    if (
                      await action.act(
                        () =>
                          supabase!
                            .from("worship_songs")
                            .upsert(preview, { defaultToNull: false }),
                        "Repertório importado.",
                      )
                    )
                      setPreview([]);
                  }}
                >
                  Confirmar importação do repertório
                </button>
              </>
            )}
          </Disclosure>
        )}
      </section>
      {manager && <Disclosure title="Importar histórico do Louvor" description="Escalas e correspondência de pessoas"><ModuleImport module="louvor" /></Disclosure>}
      {admin && <Disclosure title="Responsáveis pelo módulo" description="Gerencie quem pode administrar o Louvor"><ModuleAccess module="louvor" /></Disclosure>}
    </>
  );
}
export function ModuleAccess({ module }: { module: "louvor" | "ebd" }) {
  const people = useModulePeople(module, true),
    q = useModuleRows<{ person_id: string; module: string; role: string }>(
      "module_access",
      "person_id",
      ["module", module],
    );
  const action = useModuleAction();
  return (
    <section className="icabv-card">
      <h2>Responsáveis pelo módulo</h2>
      <p>
        Essas permissões valem apenas para{" "}
        {module === "louvor" ? "o Louvor" : "a EBD"}. O administrador geral
        mantém acesso.
      </p>
      {action.notice}
      <ModuleState query={people}>
        <ModuleForm
          title="Conceder acesso ao módulo"
          fields={[
            {
              name: "person_id",
              label: "Pessoa",
              type: "select",
              required: true,
              options: people.data?.map((p) => ({
                value: p.id,
                label: p.full_name,
              })),
            },
            {
              name: "role",
              label: "Permissão no módulo",
              type: "select",
              required: true,
              options: [
                { value: "manager", label: "Gestão do módulo" },
                ...(module === "ebd"
                  ? [{ value: "observer", label: "Consulta de relatórios" }]
                  : []),
              ],
            },
          ]}
          busy={action.busy}
          onSave={(v) =>
            action.act(() =>
              supabase!.from("module_access").upsert({ ...v, module }),
            )
          }
        />
      </ModuleState>
      <ModuleState query={q}>
        {q.data?.map((r) => (
          <div className="module-row" key={r.person_id}>
            <p>
              {people.data?.find((p) => p.id === r.person_id)?.full_name ??
                "Pessoa"}{" "}
              · {r.role === "manager" ? "Gestão" : "Consulta"}
            </p>
            <button
              className="secondary"
              disabled={action.busy}
              onClick={() => {
                if (confirm("Remover o acesso desta pessoa ao módulo?"))
                  void action.act(() =>
                    supabase!
                      .from("module_access")
                      .delete()
                      .eq("person_id", r.person_id)
                      .eq("module", module),
                  );
              }}
            >
              Remover acesso
            </button>
          </div>
        ))}
      </ModuleState>
    </section>
  );
}
export function WorshipAssignments({month,onMonthChange}:{personId:string;month?:string;onMonthChange?:(month:string)=>void}) {
  const q=useModuleRows<Service>("worship_services","starts_at");
  const directory=useQuery({queryKey:["modules","worship-directory"],queryFn:()=>moduleRpc<WorshipMember[]>("worship_directory")});
  return <section className="icabv-card module-page">
    <ModuleState query={q}><ModuleState query={directory}><ScheduleBoard month={month} onMonthChange={onMonthChange} entries={worshipScheduleEntries(q.data??[],directory.data??[])} label="Escala de cultos" /></ModuleState></ModuleState>
  </section>;
}
