"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ModuleState } from "./module-ui";
import { BIBLE_ABBREV_TO_FULL_NAME, BIBLE_BOOK_ORDER } from "./bible-books";
type Book={abbrev:string;name:string;chapters:string[][]};
export function BibleReader() {
 const [book,setBook]=useState("gn"),[chapter,setChapter]=useState(1);
 const query=useQuery({queryKey:["bible-local"],queryFn:async()=>{const response=await fetch("/bible/nvi.json");if(!response.ok)throw Error("bible_unavailable");return JSON.parse((await response.text()).replace(/^\uFEFF/,"")) as Book[];},staleTime:Infinity});
 const selected=query.data?.find(b=>b.abbrev===book);
 return <section className="icabv-card"><h2>Bíblia para estudo</h2><p>Nova Versão Internacional · acervo do Portal EBD.</p><div className="module-filters"><label className="icabv-field">Livro<select value={book} onChange={e=>{setBook(e.target.value);setChapter(1);}}>{BIBLE_BOOK_ORDER.map(b=><option key={b} value={b}>{BIBLE_ABBREV_TO_FULL_NAME[b]}</option>)}</select></label><label className="icabv-field">Capítulo<select value={chapter} onChange={e=>setChapter(Number(e.target.value))}>{Array.from({length:selected?.chapters.length??1},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label></div><ModuleState query={query}><div className="bible-verses">{selected?.chapters[chapter-1]?.map((v,i)=><p key={i}><sup>{i+1}</sup> {v}</p>)}</div></ModuleState></section>;
}
