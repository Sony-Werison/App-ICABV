"use client";
import { useAccountStatus } from "./account-status";
import { useState, type FormEvent } from "react";
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
  type ModuleAssignment = { module: "louvor" | "ebd"; role: "manager" | "observer" };
  type ManagedPerson = Person & {
    membership_reviewed_at?: string | null;
    email?: string;
    phone?: string;
    roles?: Role[];
    module_access?: ModuleAssignment[];
    units?: { id: string; title: string; kind: string }[];
    worship_roles?: string[];
    worship_active?: boolean;
    ebd_roles?: string[];
  };
  const [page, setPage] = useState(0), [search, setSearch] = useState(""), [status, setStatus] = useState("all"), [unit, setUnit] = useState(""), [dialog, setDialog] = useState<"create" | "identity" | "normalize" | null>(null), [editing, setEditing] = useState<ManagedPerson | null>(null), [editError, setEditError] = useState("");
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
  const rows=(people.data?.items??[]) as ManagedPerson[];
  const closeEditor = () => { if (!busy) { setEditing(null); setEditError(""); } };
  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const desiredRoles = form.getAll("role").map(String) as Role[];
    const currentRoles = editing.roles ?? [];
    const desiredUnits = form.getAll("unit").map(String);
    const currentUnits = (editing.units ?? []).map((unit) => unit.id);
    const moduleValues = (["louvor", "ebd"] as const)
      .map((module) => ({ module, role: String(form.get(`${module}-access`) || "none") }))
      .filter((item) => item.role !== "none") as ModuleAssignment[];
    const currentModules = editing.module_access ?? [];
    const worshipRoles = String(form.get("worship-roles") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    void run(async () => {
      if (!admin) {
        const result = await supabase!.rpc("set_membership", {
          person: editing.id,
          status: String(form.get("status")),
        });
        if (!result.error) setEditing(null);
        return result;
      }
      const profile = await supabase!.from("persons")
        .update({
          full_name: String(form.get("name")).trim(),
          membership_status: String(form.get("status")),
        })
        .eq("id", editing.id);
      if (profile.error) return profile;
      const contacts = await supabase!.from("person_contacts").upsert({
        person_id: editing.id,
        email: String(form.get("email") || "").trim().toLowerCase(),
        phone: String(form.get("phone") || "").trim(),
      });
      if (contacts.error) return contacts;
      for (const role of roles) {
        const has = currentRoles.includes(role);
        const wants = desiredRoles.includes(role);
        if (has !== wants) {
          const result = await supabase!.rpc(wants ? "grant_role" : "revoke_role", {
            person: editing.id,
            assigned_role: role,
          });
          if (result.error) return result;
        }
      }
      for (const moduleName of ["louvor", "ebd"] as const) {
        const next = moduleValues.find((value) => value.module === moduleName);
        const current = currentModules.find((value) => value.module === moduleName);
        if (next?.role !== current?.role) {
          const result = next
            ? await supabase!.from("module_access").upsert({ person_id: editing.id, module: moduleName, role: next.role })
            : await supabase!.from("module_access").delete().eq("person_id", editing.id).eq("module", moduleName);
          if (result.error) return result;
        }
      }
      for (const unit of units.data ?? []) {
        const has = currentUnits.includes(unit.id);
        const wants = desiredUnits.includes(unit.id);
        if (has !== wants) {
          const result = await supabase!.rpc("set_person_unit_assignment", {
            unit: unit.id,
            person: editing.id,
            enabled: wants,
          });
          if (result.error) return result;
        }
      }
      const worship = worshipRoles.length || form.get("worship-active") === "on"
        ? await supabase!.from("worship_members").upsert({
            person_id: editing.id,
            roles: worshipRoles,
            active: form.get("worship-active") === "on",
          })
        : await supabase!.from("worship_members").delete().eq("person_id", editing.id);
      if (worship.error) return worship;
      setEditing(null);
      return { error: null };
    }, "Perfil atualizado.");
  };
  return (
    <section className="card people-workspace">
      <header className="people-heading">
        <div>
          <span className="eyebrow">CADASTROS DA COMUNIDADE</span>
          <h1>Pessoas</h1>
          <p className="people-intro">Um cadastro único reúne identidade, situação, contatos, equipes e perfis de acesso.</p>
        </div>
        <div className="people-actions">
          <button className="primary" onClick={()=>setDialog("create")}>Cadastrar pessoa</button>
          {admin&&<button className="secondary" onClick={()=>setDialog("normalize")}>Normalizar cadastros</button>}
          {admin&&<button className="secondary" onClick={()=>setDialog("identity")}>Revisar duplicados</button>}
        </div>
      </header>
      <div className="people-filters">
        <SearchField label="Buscar pessoa" value={search} onChange={value=>{setSearch(value);setPage(0);}}/>
        <label className="icabv-field">Situação<select aria-label="Filtrar situação das pessoas" value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">Todas</option><option value="unreviewed">Pendente de revisão</option><option value="visitor">Visitante confirmado</option><option value="member">Membro</option><option value="leader">Líder</option></select></label>
        <label className="icabv-field">Grupo ou equipe<select aria-label="Filtrar grupo ou equipe" value={unit} onChange={e=>{setUnit(e.target.value);setPage(0);}}><option value="">Todos</option>{units.data?.map(u=><option value={u.id} key={u.id}>{u.title}</option>)}</select></label>
      </div>
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
      {admin&&dialog==="normalize"&&<ModuleDialog title="Normalizar cadastros" onClose={()=>setDialog(null)}>
        <div className="profile-editor">
          <p>Esta ação padroniza espaços e maiúsculas/minúsculas dos nomes, e-mail e telefone já registrados. Ela não apaga cadastros nem altera permissões.</p>
          <button className="primary" disabled={busy} onClick={()=>void run(async()=>{const result=await supabase!.rpc("normalize_person_records");if(!result.error)setDialog(null);return result;},"Cadastros normalizados.")}>Normalizar informações existentes</button>
        </div>
      </ModuleDialog>}
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
            <li key={p.id} className="person-card">
              <div className="people-identity"><span className="people-avatar" aria-hidden="true">{(p.full_name||"?").trim().split(/\s+/).slice(0,2).map(n=>n[0]).join("")}</span><span><strong>{p.full_name || pt.pending}</strong><small>{p.email || "Sem e-mail informado"}{p.phone ? ` · ${p.phone}` : ""}</small></span></div>
              <div className="person-card-meta">
                <span className={"people-status "+(!p.membership_reviewed_at?"is-unreviewed":"")} >{p.membership_reviewed_at?roleLabels[p.membership_status as Role]:"Pendente de revisão"}</span>
                {!!p.roles?.length && <span className="people-tags">{p.roles.map(role=><span key={role}>{roleLabels[role]}</span>)}</span>}
                {!!p.units?.length && <small>{p.units.map(u=>u.title).join(" · ")}</small>}
              </div>
              <button className="secondary" aria-label={`Editar perfil: ${p.full_name}`} onClick={()=>{setEditing(p);setEditError("");}}>Editar perfil</button>
            </li>
          ))}
        </ul>
      )}
      {people.data&&people.data.total>25&&<PaginationControls current={page} pages={Math.ceil(people.data.total/25)} label="pessoas" onChange={setPage}/>}
      {editing&&<ModuleDialog title={`Perfil de ${editing.full_name}`} onClose={closeEditor}>
        <form className="profile-editor" onSubmit={saveProfile}>
          <p className="profile-editor-hint">A situação da igreja e os perfis de acesso são independentes. As equipes e módulos abaixo refletem os cadastros já existentes.</p>
          <div className="profile-form-grid">
            {admin&&<label>Nome completo<input name="name" defaultValue={editing.full_name} minLength={2} maxLength={120} required /></label>}
            <label>Situação<select name="status" defaultValue={editing.membership_status}>{["visitor","member","leader"].map(value=><option key={value} value={value}>{roleLabels[value as Role]}</option>)}</select></label>
            {admin&&<label>E-mail<input name="email" type="email" defaultValue={editing.email||""} /></label>}
            {admin&&<label>Telefone<input name="phone" defaultValue={editing.phone||""} /></label>}
          </div>
          {admin&&<><fieldset><legend>Perfis gerais</legend><div className="profile-check-grid">{roles.map(role=><label key={role}><input type="checkbox" name="role" value={role} defaultChecked={editing.roles?.includes(role)} />{roleLabels[role]}</label>)}</div></fieldset>
          <fieldset><legend>Acesso aos módulos</legend><div className="profile-form-grid"><label>Louvor<select name="louvor-access" defaultValue={editing.module_access?.find(item=>item.module==="louvor")?.role||"none"}><option value="none">Sem acesso administrativo</option><option value="observer">Observador</option><option value="manager">Gestor</option></select></label><label>EBD<select name="ebd-access" defaultValue={editing.module_access?.find(item=>item.module==="ebd")?.role||"none"}><option value="none">Sem acesso administrativo</option><option value="observer">Observador</option><option value="manager">Gestor</option></select></label></div></fieldset>
          <fieldset><legend>Equipes e grupos</legend><div className="profile-check-grid">{units.data?.map(unit=><label key={unit.id}><input type="checkbox" name="unit" value={unit.id} defaultChecked={editing.units?.some(current=>current.id===unit.id)} />{unit.title}</label>)}</div>{units.isPending&&<small>Carregando equipes…</small>}{units.error&&<small role="alert">Não foi possível carregar as equipes.</small>}</fieldset>
          <fieldset><legend>Louvor</legend><label className="profile-inline-check"><input type="checkbox" name="worship-active" defaultChecked={editing.worship_active} /> Integrante ativo</label><label>Funções já registradas<input name="worship-roles" defaultValue={(editing.worship_roles||[]).join(", ")} placeholder="Ex.: vocal, teclado, violão" /></label></fieldset></>}
          {editError&&<p role="alert">{editError}</p>}<button className="primary" disabled={busy}>Salvar perfil completo</button>
        </form>
      </ModuleDialog>}


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
