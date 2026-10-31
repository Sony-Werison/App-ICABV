"use client";
import {useState} from "react";
import {ChevronLeft,ChevronRight} from "lucide-react";
import {SongReader} from "./worship";
import {WorshipDialog} from "./worship-ui";
import {songVersions,type Song} from "./worship-model";

export function readableRepertoire(playlist:string[],songs:Song[]) {
  return playlist.flatMap(id=>{
    const song=songs.find(s=>s.id===id);
    return song&&(song.lyrics.trim()||song.chords.trim()||songVersions(song).some(v=>v.lyrics.trim()||v.chords.trim()))?[song]:[];
  });
}
export function RepertoireReader({title,playlist,songs,onClose}:{title:string;playlist:string[];songs:Song[];onClose:()=>void}) {
  const available=readableRepertoire(playlist,songs),[index,setIndex]=useState(0);
  const song=available[Math.min(index,available.length-1)];
  return <WorshipDialog title={`Repertório · ${title}`} onClose={onClose} fullScreen>
    {song?<SongReader key={`${index}:${song.id}`} song={song} initialView="lyrics" navigation={<div className="repertoire-navigation">
      <div><button className="icon-btn" type="button" aria-label="Música anterior" disabled={index===0} onClick={()=>setIndex(i=>i-1)}><ChevronLeft size={18}/></button>
      <label><span className="sr-only">Escolher música do repertório</span><select aria-label="Escolher música do repertório" value={index} onChange={e=>setIndex(Number(e.target.value))}>{available.map((s,i)=><option key={`${i}:${s.id}`} value={i}>{i+1}. {s.title}</option>)}</select></label>
      <button className="icon-btn" type="button" aria-label="Próxima música" disabled={index===available.length-1} onClick={()=>setIndex(i=>i+1)}><ChevronRight size={18}/></button></div>
      <small>{index+1} de {available.length}{available.length<playlist.length?` · ${playlist.length-available.length} sem letra disponível`:""}</small>
    </div>}/>:<p className="church-empty">As letras deste repertório ainda não estão disponíveis.</p>}
  </WorshipDialog>;
}
