export type ChordVersion = {
  id: string;
  name: string;
  musical_key: string;
  chords: string;
  lyrics: string;
  source_files?: string[];
  source_hashes?: string[];
};
export type Song = {
  id: string;
  title: string;
  artist: string;
  musical_key: string;
  category: string;
  is_new: boolean;
  youtube_url: string;
  lyrics: string;
  chords: string;
  chord_versions?: ChordVersion[];
  bpm: number;
  pdf_links: { name: string; url: string }[];
  archived: boolean;
  legacy_total?: number;
  legacy_quarterly?: number;
};
export function songVersions(song: Song): ChordVersion[] {
  return song.chord_versions?.length ? song.chord_versions : [];
}
export function songHasChords(song: Song) {
  return hasChordNotation(song.chords) || songVersions(song).some(v => hasChordNotation(v.chords)) || song.pdf_links.length > 0;
}
export function hasChordNotation(sheet: string) {
  const chord=/^(?:[A-G](?:#|b)?(?:(?:maj|min|sus|dim|aug|add|m|M)|[0-9()+°ºb#-])*(?:\/[A-G](?:#|b)?)?|\/[A-G](?:#|b)?)$/;
  if ([...sheet.matchAll(/\[([^\]]+)\]/g)].some(m=>chord.test(m[1]))) return true;
  let notes=0;
  for (const line of sheet.split(/\r?\n/)) {
    const words=line.trim().split(/\s+/).filter(w=>!['|',':','%','||'].includes(w));
    if(words.length&&words.every(w=>chord.test(w))) notes+=words.length;
  }
  return notes>=2;
}
export function parseChordLine(line: string) {
  const chordPattern=/^(?:[A-G](?:#|b)?(?:(?:maj|min|sus|dim|aug|add|m|M)|[0-9()+°ºb#-])*(?:\/[A-G](?:#|b)?)?|\/[A-G](?:#|b)?)$/;
  const tokens=line.trim().split(/\s+/).filter(Boolean);
  const chordOnly=tokens.length>0&&tokens.every(token=>token.startsWith("[")&&token.endsWith("]")?chordPattern.test(token.slice(1,-1)):chordPattern.test(token)||["|",":","%","||"].includes(token));
  if(chordOnly){
    const chords:{name:string;position:number}[]=[];
    let position=0;
    for(const token of tokens){
      if(["|",":","%","||"].includes(token)){position+=token.length+2;continue;}
      const name=token.startsWith("[")?token.slice(1,-1):token;
      chords.push({name,position});position+=name.length+3;
    }
    return {text:"",chords};
  }
  const chords:{name:string;position:number}[]=[];
  const pattern=/\[([^\]]+)\]/g;
  let text="",cursor=0,match:RegExpExecArray|null;
  while((match=pattern.exec(line))){
    text+=line.slice(cursor,match.index);
    chords.push({name:match[1],position:text.length});
    cursor=match.index+match[0].length;
  }
  text+=line.slice(cursor);
  if(chords.length>1&&line.slice(cursor).trim()===""&&/^.*(?:[:)]\s*)$/.test(line.slice(0,line.indexOf("[")))){
    let position=line.slice(0,line.indexOf("[")).length;
    for(const chord of chords){chord.position=position;position+=chord.name.length+3;}
  }
  return {text,chords};
}
export function normalizeChordVersions(value: unknown): ChordVersion[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) throw Error("Versões inválidas");
  const ids = new Set<string>();
  return value.map(v => {
    if (!v || typeof v !== "object" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v.id) || ids.has(v.id)
      || typeof v.name !== "string" || !v.name.trim() || v.name.trim().length > 100
      || typeof v.musical_key !== "string" || !v.musical_key || v.musical_key.length > 20
      || typeof v.chords !== "string" || v.chords.length > 60000 || typeof v.lyrics !== "string" || v.lyrics.length > 60000
      || (!v.chords.trim() && !v.lyrics.trim())) throw Error("Versão inválida");
    ids.add(v.id);
    return {...v,name:v.name.trim()};
  });
}
export type WorshipMember = {
  person_id: string;
  full_name: string;
  roles: string[];
  active: boolean;
};
export type Service = {
  id: string;
  title: string;
  starts_at: string;
  period: string;
  assignments: Record<string, string[]>;
  playlist: string[];
  featured: boolean;
  status: "planned" | "completed" | "canceled";
};
export type Rehearsal = {
  id: string;
  person_id: string;
  title: string;
  playlist: string[];
};
export type Live = {
  service_id: string;
  song_id: string | null;
  transpose: number;
  scrolling: boolean;
  scroll_speed: number;
  metronome: boolean;
  bpm: number;
  updated_at: string;
};
const sharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const flats: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
  Cb: "B",
  "B#": "C",
  Fb: "E",
  "E#": "F",
};
export function transposeChord(chord: string, amount: number) {
  return chord.replace(
    /(^|\/)([A-G](?:#|b)?)/g,
    (_, prefix: string, note: string) => {
      const index = sharp.indexOf(flats[note] ?? note);
      return (
        prefix + (index < 0 ? note : sharp[(((index + amount) % 12) + 12) % 12])
      );
    },
  );
}
export function transposeSheet(sheet: string, amount: number) {
  if (!amount) return sheet;
  return sheet
    .split("\n")
    .map((line) => {
      if (line.includes("["))
        return line.replace(
          /\[([^\]]+)\]/g,
          (_, chord: string) => "[" + transposeChord(chord, amount) + "]",
        );
      const words = line.trim().split(/\s+/);
      if (
        words.length &&
        words.every((w) =>
          /^([A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add|\d|\(|\)|\+|-|°|\/|[A-G]|#|b)*|\||:|%)+$/.test(
            w,
          ),
        )
      )
        return line.replace(/\S+/g, (w) => transposeChord(w, amount));
      return line;
    })
    .join("\n");
}
export function proposeMonth(
  month: string,
  members: WorshipMember[],
  history: Service[],
) {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return [];
  const rows: Omit<Service, "id">[] = [],
    counts = new Map<string, number>();
  for (const service of history.filter((s) => s.status !== "canceled"))
    for (const [role, ids] of Object.entries(service.assignments))
      for (const id of ids)
        counts.set(role + id, (counts.get(role + id) ?? 0) + 1);
  for (let day = 1; day <= 31; day++) {
    const d = new Date(Date.UTC(year, m - 1, day));
    if (d.getUTCMonth() !== m - 1) break;
    if (d.getUTCDay() !== 0) continue;
    for (const period of ["manhã", "noite"]) {
      const starts_at = `${month}-${String(day).padStart(2, "0")}T${period === "manhã" ? "09" : "19"}:00:00-03:00`;
      if (
        history.some(
          (s) =>
            s.status !== "canceled" &&
            new Date(s.starts_at).getTime() === new Date(starts_at).getTime(),
        )
      )
        continue;
      const assignments: Record<string, string[]> = {},
        used = new Set<string>();
      for (const role of ["Abertura", "Pregação", "Multimídia"]) {
        const eligible = members.filter(
          (p) =>
            p.active &&
            (p.roles.includes(role) ||
              (role === "Pregação" && p.roles.includes("Convidado"))),
        );
        eligible.sort(
          (a, b) =>
            Number(used.has(a.person_id)) - Number(used.has(b.person_id)) ||
            (counts.get(role + a.person_id) ?? 0) -
              (counts.get(role + b.person_id) ?? 0) ||
            a.full_name.localeCompare(b.full_name),
        );
        const person = eligible[0];
        assignments[role] = person ? [person.person_id] : [];
        if (person) {
          used.add(person.person_id);
          counts.set(
            role + person.person_id,
            (counts.get(role + person.person_id) ?? 0) + 1,
          );
        }
      }
      rows.push({
        title: `Culto de ${period}`,
        starts_at,
        period,
        assignments,
        playlist: [],
        featured: false,
        status: "planned",
      });
    }
  }
  return rows;
}
export function normalizeSong(value: Record<string, unknown>) {
  const title = String(value.title ?? "").trim();
  if (!title || title.length > 180) throw Error("Título inválido");
  const youtube_url = String(value.youtube_url ?? value.youtubeUrl ?? "");
  if (
    youtube_url &&
    !/^https:\/\/(www\.)?(youtube\.com\/|youtu\.be\/)/.test(youtube_url)
  )
    throw Error("Link de vídeo inválido");
  return {
    title,
    artist: String(value.artist ?? ""),
    musical_key: String(value.musical_key ?? value.key ?? "C"),
    category: ["Hino", "Louvor", "Infantil"].includes(String(value.category))
      ? String(value.category)
      : "Louvor",
    is_new:
      String(value.is_new ?? value.isNew ?? false).toLowerCase() === "true",
    youtube_url,
    lyrics: String(value.lyrics ?? ""),
    chords: String(value.chords ?? ""),
    chord_versions: normalizeChordVersions(value.chord_versions),
    bpm: Math.max(20, Math.min(300, Number(value.bpm) || 80)),
    pdf_links: Array.isArray(value.pdf_links ?? value.pdfLinks)
      ? (value.pdf_links ?? value.pdfLinks)
      : [],
    archived: false,
    legacy_total: Math.max(
      0,
      Math.round(Number(value.legacy_total ?? value.timesPlayedTotal) || 0),
    ),
    legacy_quarterly: Math.max(
      0,
      Math.round(
        Number(value.legacy_quarterly ?? value.timesPlayedQuarterly) || 0,
      ),
    ),
  };
}
export function parseSongCsv(source: string) {
  const delimiter = source.split(/\r?\n/)[0].includes(";") ? ";" : ",";
  const rows: string[][] = [],
    row: string[] = [];
  let field = "",
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) rows.push([...row]);
      row.length = 0;
      field = "";
    } else field += c;
  }
  if (quoted) throw Error("CSV com aspas não fechadas.");
  row.push(field);
  if (row.some(Boolean)) rows.push([...row]);
  const headers = (rows.shift() ?? []).map((s) =>
    s.trim().replace(/^\uFEFF/, ""),
  );
  if (!headers.includes("title")) throw Error("O CSV precisa da coluna title.");
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])),
  );
}
