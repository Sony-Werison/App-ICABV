"use client";
import {ChevronDown} from "lucide-react";
export {ModuleDialog as WorshipDialog} from "./module-dialog";

export function WorshipRolePicker({role,people,value,onChange}:{role:string;people:{person_id:string;full_name:string}[];value:string[];onChange:(ids:string[])=>void}) {
  return <details className="worship-role-picker"><summary><span>{role}</span><small>{value.length?`${value.length} ${value.length===1?"pessoa":"pessoas"}`:"A definir"}</small><ChevronDown size={16} aria-hidden="true"/></summary><fieldset><legend className="sr-only">{role}</legend>{people.length?people.map(person=><label key={person.person_id}><input type="checkbox" checked={value.includes(person.person_id)} onChange={event=>onChange(event.target.checked?[...value,person.person_id]:value.filter(id=>id!==person.person_id))}/><span>{person.full_name}</span></label>):<p>Ninguém disponível para esta função.</p>}</fieldset></details>;
}
