"use client";
import { useAccountStatus } from "./account-status";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  pt,
  roles,
  roleLabels,
  type Person,
  type Role,
} from "../../packages/shared/src";
import { supabase } from "./supabase";
import { PersonContacts } from "./person-contacts";
import { Disclosure, SearchField, PaginationControls } from "./presentation";
import {ModuleDialog} from "./module-dialog";
import {useModuleRows} from "./module-ui";
import { IdentityReconciliation } from "./identity-reconciliation";
type Runner = (
  task: () => PromiseLike<{ error: unknown }>,
  success?: string,
) => Promise<void>;
export function Families({ busy, run }: { busy: boolean; run: Runner }) {
  const { ready, manager } = useAccountStatus();
  const data = useQuery({
    queryKey: ["families"],
    queryFn: async () => {
      const r = await supabase!
        .from("families")
        .select("id,name")
        .order("name")
        .limit(50);
      if (r.error) throw r.error;
      return r.data;
    },
  });
  return (
    <section className="card">
      <h1>{pt.families}</h1>
      {data.isPending ? (
        <p>{pt.loading}</p>
      ) : data.error ? (
        <>
          <p role="alert">{pt.loadError}</p>
          <button className="secondary" onClick={() => void data.refetch()}>
            {pt.retry}
          </button>
        </>
      ) : !data.data?.length ? (
        <p>{pt.noFamily}</p>
      ) : (
        <ul>
          {data.data.map((f) => (
            <li key={f.id}>
              <strong>{f.name}</strong>
            </li>
          ))}
        </ul>
      )}
      <p>
        {manager
          ? "Cadastre uma família para a igreja. Os vínculos são conferidos pela gestão em Pessoas e papéis."
          : pt.familyHint}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name"));
          void run(() =>
            supabase!.rpc(manager ? "create_managed_family" : "create_family", {
              family_name: name,
            }),
          );
        }}
      >
        <label>
          {pt.familyName}
          <input name="name" minLength={2} maxLength={120} required />
        </label>
        <button className="primary" disabled={busy || (!manager && !ready)}>
          {manager ? "Cadastrar família" : pt.createFamily}
        </button>
      </form>
    </section>
  );
}
export function People({
  busy,
  run,
  admin,
}: {
  busy: boolean;
  run: Runner;
  admin: boolean;
}) {
  const [page, setPage] = useState(0),[search,setSearch]=useState(""),[status,setStatus]=useState("all"),[unit,setUnit]=useState(""),[dialog,setDialog]=useState<"create"|"identity"|null>(null),[editing,setEditing]=useState<(Person&{membership_reviewed_at?:string|null})|null>(null),[editError,setEditError]=useState("");
  const units=useModuleRows<{id:string;title:string;kind:string}>("community_units");
  const familyOptions = useQuery({
    queryKey: ["family-options"],
    queryFn: async () => {
      const r = await supabase!
        .from("families")
        .select("id,name")
        .order("name")
        .limit(100);
      if (r.error) throw r.error;
      return r.data;
    },
  });
  const people = useQuery({
    queryKey:["people",page,search,status,unit],
    queryFn:async()=>{const result=await supabase!.rpc("management_people",{search_text:search,status_filter:status,page_number:page,unit_filter:unit||null});if(result.error)throw result.error;return result.data as {items:(Person&{membership_reviewed_at?:string|null})[];total:number};},
  });
  const rows=people.data?.items??[];
  return (
    <section className="card">
      <header className="people-heading"><h1>Pessoas</h1><div><button className="primary" onClick={()=>setDialog("create")}>Cadastrar pessoa</button>{admin&&<button className="secondary" onClick={()=>setDialog("identity")}>Revisar duplicados</button>}</div></header>
      <div className="people-filters"><SearchField label="Buscar pessoa" value={search} onChange={value=>{setSearch(value);setPage(0);}}/><label className="icabv-field">Situação<select aria-label="Filtrar situação das pessoas" value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">Todas</option><option value="unreviewed">Pendente de revisão</option><option value="visitor">Visitante confirmado</option><option value="member">Membro</option><option value="leader">Líder</option></select></label><label className="icabv-field">Grupo ou equipe<select aria-label="Filtrar grupo ou equipe" value={unit} onChange={e=>{setUnit(e.target.value);setPage(0);}}><option value="">Todos</option>{units.data?.map(u=><option value={u.id} key={u.id}>{u.title}</option>)}</select></label></div>
      {people.isSuccess&&<p role="status">{people.data.total} {people.data.total===1?"pessoa encontrada":"pessoas encontradas"}</p>}
      {dialog==="create"&&<ModuleDialog title="Cadastrar pessoa" onClose={()=>setDialog(null)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name"));
          void run(async () => {
            const result=await supabase!.rpc("register_person", { display_name: name });
            if(!result.error)setDialog(null);return result;
          });
        }}
      >
        <h2>{pt.addPerson}</h2>
        <label>
          {pt.name}
          <input name="name" required minLength={2} maxLength={120} />
        </label>
        <button className="primary" disabled={busy}>
          {pt.save}
        </button>
      </form>
      </ModuleDialog>}
      {admin&&dialog==="identity"&&<ModuleDialog title="Vincular contas e revisar duplicados" onClose={()=>setDialog(null)}><IdentityReconciliation/></ModuleDialog>}
      {people.isPending ? (
        <p>{pt.loading}</p>
      ) : people.error ? (
        <>
          <p>{pt.loadError}</p>
          <button className="secondary" onClick={() => void people.refetch()}>
            {pt.retry}
          </button>
        </>
      ) : !rows.length ? (
        <p>{pt.empty}</p>
      ) : (
        <ul className="ui-people-list">
          {rows.map((p) => (
            <li key={p.id}>
              <span className="people-identity"><span className="people-avatar" aria-hidden="true">{(p.full_name||"?").trim().split(/\s+/).slice(0,2).map(n=>n[0]).join("")}</span><strong>{p.full_name || pt.pending}</strong></span>
              <span className={"people-status "+(!p.membership_reviewed_at?"is-unreviewed":"")} >{p.membership_reviewed_at?roleLabels[p.membership_status as Role]:"Pendente de revisão"}</span><button className="secondary" aria-label={`Editar situação: ${p.full_name}`} onClick={()=>{setEditing(p);setEditError("");}}>Editar</button>

            </li>
          ))}
        </ul>
      )}
      {people.data&&people.data.total>25&&<PaginationControls current={page} pages={Math.ceil(people.data.total/25)} label="pessoas" onChange={setPage}/>}
      {editing&&<ModuleDialog title={`Situação de ${editing.full_name}`} onClose={()=>{if(!busy)setEditing(null);}}><form className="module-editor" onSubmit={e=>{e.preventDefault();const status=String(new FormData(e.currentTarget).get("status"));void run(async()=>{const result=await supabase!.rpc("set_membership",{person:editing.id,status});if(!result.error)setEditing(null);else setEditError("Não foi possível salvar. Tente novamente.");return result;});}}><p>A situação na igreja é independente das permissões de acesso.</p><label className="icabv-field">Situação<select name="status" defaultValue={editing.membership_status}>{["visitor","member","leader"].map(value=><option key={value} value={value}>{roleLabels[value as Role]}</option>)}</select></label>{editError&&<p role="alert">{editError}</p>}<button className="primary" disabled={busy}>Salvar situação</button></form></ModuleDialog>}


      <Disclosure title="Vincular à família" description="Conferir os vínculos familiares">

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(() =>
            supabase!.rpc("link_family", {
              family: f.get("family"),
              person: f.get("person"),
            }),
          );
        }}
      >
        <h2>{pt.addToFamily}</h2>
        <label>
          {pt.families}
          <select
            name="family"
            required
            disabled={familyOptions.isPending || Boolean(familyOptions.error)}
          >
            <option value="">
              {familyOptions.isPending ? pt.loading : pt.familyName}
            </option>
            {familyOptions.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {familyOptions.error && (
            <button
              className="secondary"
              type="button"
              onClick={() => void familyOptions.refetch()}
            >
              {pt.retry}
            </button>
          )}
        </label>
        <label>
          {pt.name}
          <select name="person" required disabled={busy||people.isPending||!!people.error}>
            {rows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || pt.pending}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy||people.isPending||!!people.error||familyOptions.isPending||!!familyOptions.error||!rows.length||!familyOptions.data?.length}>
          {pt.save}
        </button>
      </form>
      </Disclosure>
      {admin && (
        <Disclosure title="Permissões de acesso" description="Conceder ou remover perfis após conferência">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const role = roleLabels[String(f.get("role")) as Role];
            const selected = e.currentTarget.elements.namedItem(
              "person",
            ) as HTMLSelectElement | null;
            const person = selected?.selectedOptions[0]?.textContent;
            if (
              !window.confirm(
                `${f.get("operation") === "revoke" ? "Remover" : "Conceder"} o perfil ${role} para ${person}?`,
              )
            )
              return;
            void run(() =>
              supabase!.rpc(
                f.get("operation") === "revoke" ? "revoke_role" : "grant_role",
                {
                  person: f.get("person"),
                  assigned_role: f.get("role"),
                },
              ),
            );
          }}
        >
          <h2>{pt.permissions}</h2>
          <label>
            {pt.operation}
            <select name="operation">
              <option value="grant">{pt.grant}</option>
              <option value="revoke">{pt.revoke}</option>
            </select>
          </label>
          <label>
            {pt.name}
            <select name="person" required disabled={busy||people.isPending||!!people.error}>
              {rows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || pt.pending}
                </option>
              ))}
            </select>
          </label>
          <label>
            {pt.status}
            <select name="role">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={busy||people.isPending||!!people.error||!rows.length}>
            {pt.save}
          </button>
        </form>
        </Disclosure>
      )}
      <Disclosure title="Dados de contato" description="Telefone, e-mail e aniversário"><PersonContacts management/></Disclosure>
    </section>
  );
}
export function ConsentHistory() {
  const q = useQuery({
    queryKey: ["consents"],
    queryFn: async () => {
      const r = await supabase!
        .from("consent_events")
        .select("id,purpose,version,granted,created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (r.error) throw r.error;
      return r.data;
    },
  });
  return (
    <>
      <h3>{pt.consentHistory}</h3>
      {q.isPending ? (
        <p>{pt.loading}</p>
      ) : q.error ? (
        <button className="secondary" onClick={() => void q.refetch()}>
          {pt.retry}
        </button>
      ) : !q.data?.length ? (
        <p>{pt.empty}</p>
      ) : (
        <ul>
          {q.data.map((c) => (
            <li key={c.id}>
              {pt.consentPurposes[c.purpose as keyof typeof pt.consentPurposes]}{" "}
              · {c.version} · {c.granted ? pt.granted : pt.revoked}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
