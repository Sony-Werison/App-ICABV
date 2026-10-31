"use client";
import {useEffect,useId,useRef,type ReactNode} from "react";
import {X} from "lucide-react";

/** Native focus containment, Escape and focus return for module editors. */
export function ModuleDialog({title,onClose,children,fullScreen=false}:{title:string;onClose:()=>void;children:ReactNode;fullScreen?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null),id=useId();
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,dialog=ref.current;
    dialog?.showModal();
    return ()=>{dialog?.close();if(previous?.isConnected)previous.focus();};
  },[]);
  return <dialog ref={ref} className={`ui-module-dialog${fullScreen?" ui-module-dialog-fullscreen":""}`} aria-labelledby={id} onCancel={event=>{event.preventDefault();onClose();}}>
    <header className="ui-module-dialog-heading"><h2 id={id}>{title}</h2><button type="button" className="icon-btn" aria-label="Fechar janela" onClick={onClose}><X size={20}/></button></header>
    {children}
  </dialog>;
}
