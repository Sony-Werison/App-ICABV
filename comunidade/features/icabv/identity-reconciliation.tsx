"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { roleLabels, type Role } from "../../packages/shared/src";
import { moduleRpc } from "./module-ui";
import { offlineVersion, savedMessage } from "./offline-transport";

type Identity = {
  id: string; name: string; membership: string; account_email: string | null;
  verified: boolean; has_account: boolean; contacts: Record<string, unknown> | null;
  sources: { system: string; id: string }[]; roles: string[];
  classes: { name: string; role: string }[];
  history_count: number; attendance_count: number; guardian_count: number;
  worship: { roles: string[]; active: boolean } | null;
};
type Pair = { left: Identity; right: Identity; name_match: boolean; email_match: boolean; phone_match: boolean };
type Conflict = { key: string; table: string; source: Record<string, unknown>; target: Record<string, unknown>; resolvable: boolean };
type Preview = { source: Identity; target: Identity; fingerprint: string; impact: { table: string; count: number }[]; conflicts: Conflict[]; service_count: number; profile_choice: boolean };
type Review = { id: string; decision: string; reason: string; created_at: string; source: Identity; target: Identity; choices?: Record<string, string>; conflicts?: Conflict[] };
const tableNames: Record<string, string> = {
  person_contacts: "Contatos e aniversário", worship_members: "Participação no louvor",
  role_assignments: "Perfis de acesso", family_members: "Vínculos familiares", module_access: "Acesso aos módulos",
  ebd_class_members: "Matrículas e professores", ebd_guardians: "Responsáveis por alunos",
  ebd_attendance: "Presenças da EBD", ebd_submissions: "Respostas de atividades", ebd_legacy_history: "Histórico importado da EBD",
  ebd_activity_starts: "Início de atividades", notification_reads: "Avisos lidos", legacy_person_records: "Referências dos aplicativos antigos",
  worship_rehearsals: "Ensaios", client_operations: "Comprovantes de sincronização", food_commitments: "Contribuições de cesta básica",
};
const fieldNames: Record<string, string> = {
  email: "E-mail", phone: "Telefone", birth_date: "Nascimento", share_birthday: "Divulgar aniversário", avatar_url: "Foto",
  roles: "Funções no louvor", active: "Ativo", role: "Perfil", module: "Área", verified: "Vínculo confirmado",
  class_id: "Identificador da turma", module_id: "Identificador do módulo", next_module_id: "Identificador do próximo módulo",
  family_id: "Identificador da família", student_id: "Identificador do aluno", guardian_id: "Identificador do responsável",
  reading_group_size: "Leituras por atividade", lesson_date: "Data da aula", present: "Presente", criteria: "Critérios da chamada",
  score: "Nota", note: "Observação", activity_id: "Identificador da atividade", answers: "Respostas", status: "Situação",
  teacher_comment: "Comentário do professor", student_reply: "Resposta ao professor", graded_at: "Corrigido em", started_at: "Iniciado em",
  notification_key: "Aviso", notification_version: "Versão do aviso", read_at: "Lido em", created_at: "Cadastrado em",
};
function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.map(displayValue).join("; ") || "Nenhum";
  if (typeof value === "object") return Object.entries(value).map(([key, v]) => `${fieldNames[key] ?? key}: ${displayValue(v)}`).join("; ") || "Nenhum";
  return ({ student: "Aluno", teacher: "Professor", manager: "Gestor", observer: "Observador", pending: "Pendente", graded: "Corrigido" } as Record<string, string>)[String(value)] ?? String(value);
}
function RecordDetails({ record }: { record: Record<string, unknown> }) {
  return <dl>{Object.entries(record).filter(([key]) => !["id", "person_id", "granted_by", "teacher_id"].includes(key)).map(([key, value]) => <div key={key}><dt>{fieldNames[key] ?? key}</dt><dd>{displayValue(value)}</dd></div>)}</dl>;
}
function errorMessage(error: unknown) {
  const text = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (text.includes("identity_version_conflict")) return "Os cadastros mudaram. Gere uma nova prévia e confira os dados antes de confirmar.";
  if (text.includes("account_not_verified")) return "A conta precisa confirmar o e-mail antes da vinculação.";
  if (text.includes("source_has_account")) return "O cadastro de origem já tem uma conta. Selecione como origem o cadastro importado sem conta; duas contas não podem ser unidas por esta tela.";
  if (text.includes("collision") || text.includes("complex_identity")) return "Há registros incompatíveis que precisam de revisão no módulo de origem antes de unir. Nenhum dado foi alterado.";
  if (text.includes("identity_already_merged") || text.includes("invalid_pair")) return "Um cadastro já foi vinculado ou a seleção mudou. Atualize a lista e gere uma nova prévia.";
  if (text.includes("forbidden")) return "Esta revisão está disponível apenas para administradores.";
  return "Não foi possível concluir. Confira sua conexão e tente novamente.";
}
function IdentityCard({ person }: { person: Identity }) {
  return <div className="identity-details">
    <strong>{person.name || "Pessoa sem nome"}</strong>
    <p>{person.has_account ? `Conta: ${person.account_email ?? "sem e-mail"} · ${person.verified ? "E-mail confirmado" : "Aguardando confirmação"}` : "Sem conta vinculada"}</p>
    <p>Contato cadastrado: {String(person.contacts?.email || "sem e-mail")} · {String(person.contacts?.phone || "sem telefone")}</p>
    <details><summary>Origem do cadastro</summary><small>Identificador: {person.id}</small><p>{person.sources.map(s => `${s.system.toUpperCase()} (${s.id})`).join("; ") || "Cadastro atual"}</p></details>
    <p>{person.history_count} registros históricos · {person.attendance_count} presenças · responsável por {person.guardian_count} aluno(s)</p>
    {!!person.classes.length && <p>Turmas: {person.classes.map(c => `${c.name} (${c.role === "teacher" ? "professor" : "aluno"})`).join("; ")}</p>}
    {person.worship && <p>Louvor: {person.worship.roles.join(", ") || "integrante"} · {person.worship.active ? "ativo" : "inativo"}</p>}
    <p>Perfis gerais: {person.roles.map(r => roleLabels[r as Role] ?? r).join(", ") || "visitante"}</p>
  </div>;
}
function Directory({ kind, selected, onSelect }: { kind: "imported" | "all"; selected: Identity | null; onSelect: (p: Identity) => void }) {
  const [search, setSearch] = useState(""), [page, setPage] = useState(0);
  const q = useQuery({ queryKey: ["identity", "directory", kind, search, page], queryFn: () => moduleRpc<{ items: Identity[] }>("identity_directory", { search_text: search, page_number: page, list_mode: kind }) });
  return <div className="identity-picker">
    <h3>{kind === "imported" ? "1. Cadastro importado de origem" : "2. Conta ou cadastro que receberá o histórico"}</h3>
    <label>Buscar por nome, e-mail, telefone ou identificador
      <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
    </label>
    {q.isPending ? <p>Carregando cadastros…</p> : q.error ? <p role="alert">{errorMessage(q.error)} <button type="button" onClick={() => void q.refetch()}>Tentar novamente</button></p> : <>
      <label>Selecionar cadastro
        <select aria-label="Selecionar cadastro" value={selected?.id ?? ""} onChange={e => { const person = q.data.items.find(p => p.id === e.target.value); if (person) onSelect(person); }}>
          <option value="">Escolha uma pessoa</option>
          {selected && !q.data.items.slice(0, 25).some(p => p.id === selected.id) && <option value={selected.id}>{selected.name || "Pessoa sem nome"} · selecionado</option>}
          {q.data.items.slice(0, 25).map(p => <option key={p.id} value={p.id}>{p.name || "Pessoa sem nome"} · {p.account_email || (p.has_account ? "conta sem e-mail" : "sem conta")} · {p.id.slice(0, 8)}</option>)}
        </select>
      </label>
      {!q.data.items.length && <p>Nenhum cadastro encontrado.</p>}
      <div className="actions"><button type="button" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button type="button" disabled={q.data.items.length < 26} onClick={() => setPage(page + 1)}>Próxima</button></div>
    </>}
    {selected && <IdentityCard person={selected} />}
  </div>;
}
export function IdentityReconciliation() {
  const client = useQueryClient();
  const [source, setSource] = useState<Identity | null>(null), [target, setTarget] = useState<Identity | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null), [choices, setChoices] = useState<Record<string, string>>({});
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [failed, setFailed] = useState(false);
  const [pairPage, setPairPage] = useState(0), [historyPage, setHistoryPage] = useState(0);
  const duplicates = useQuery({ queryKey: ["identity", "duplicates", pairPage], queryFn: () => moduleRpc<Pair[]>("identity_duplicates", { page_number: pairPage }) });
  const history = useQuery({ queryKey: ["identity", "history", historyPage], queryFn: () => moduleRpc<Review[]>("identity_review_history", { page_number: historyPage }) });
  function clearPreview() { setPreview(null); setChoices({}); setConfirmed(false); setReason(""); setNotice(""); }
  async function generatePreview() {
    if (!source || !target || busy) return;
    setBusy(true); setNotice(""); setFailed(false); setPreview(null); setChoices({}); setConfirmed(false);
    try { setPreview(await moduleRpc<Preview>("identity_preview", { source_person: source.id, target_person: target.id })); }
    catch (e) { setNotice(errorMessage(e)); setFailed(true); }
    finally { setBusy(false); }
  }
  async function decide(decision: "merged" | "distinct") {
    if (!source || !target || busy) return;
    setBusy(true); setNotice(""); setFailed(false);
    const before = offlineVersion();
    try {
      await moduleRpc("review_identity", { source_person: source.id, target_person: target.id, review_decision: decision, review_reason: reason, expected_fingerprint: preview?.fingerprint ?? "", choices });
      setNotice(savedMessage(before, decision === "merged" ? "Vinculação concluída. O histórico está disponível na conta selecionada." : "Revisão registrada: são pessoas distintas."));
      setPreview(null); setSource(null); setTarget(null); setReason(""); setConfirmed(false);
      await client.invalidateQueries();
    } catch (e) { setNotice(errorMessage(e)); setFailed(true); }
    finally { setBusy(false); }
  }
  const missingChoices = !!preview && (preview.profile_choice && !choices.profile || preview.conflicts.some(c => !c.resolvable || !choices[c.key]));
  return <section className="icabv-card module-page identity-review">
    <h2>Vinculação de contas e revisão de duplicados</h2>
    <p>Confirme a identidade com o membro antes de vincular. Nome igual é apenas uma sugestão. O identificador da conta atual será mantido; histórico, turmas, responsáveis e escalas serão reunidos nele.</p>
    <p>Somente administradores podem concluir esta revisão. Cadastros com duas contas precisam de atendimento separado.</p>
    {notice && <p role={failed ? "alert" : "status"}>{notice}</p>}
    <details><summary>Possíveis duplicados</summary>
      {duplicates.isPending ? <p>Buscando sugestões…</p> : duplicates.error ? <p role="alert">{errorMessage(duplicates.error)} <button onClick={() => void duplicates.refetch()}>Tentar novamente</button></p> : <>
        {!duplicates.data.length && <p>Nenhuma sugestão pendente. Também é possível pesquisar os cadastros abaixo.</p>}
        {duplicates.data.slice(0, 25).map(p => <div className="identity-suggestion" key={p.left.id + p.right.id}>
          <strong>{p.left.name || "Sem nome"} ↔ {p.right.name || "Sem nome"}</strong>
          <p>Coincidência de: {[p.name_match && "nome", p.email_match && "e-mail cadastrado", p.phone_match && "telefone"].filter(Boolean).join(", ")}. A coincidência não comprova identidade.</p>
          <button type="button" disabled={busy} onClick={() => { clearPreview(); setSource(p.left.has_account ? p.right : p.left); setTarget(p.left.has_account ? p.left : p.right); }}>Revisar este par</button>
        </div>)}
        <div className="actions"><button disabled={!pairPage || busy} onClick={() => setPairPage(pairPage - 1)}>Anterior</button><span>Página {pairPage + 1}</span><button disabled={duplicates.data.length < 26 || busy} onClick={() => setPairPage(pairPage + 1)}>Próxima</button></div>
      </>}
    </details>
    <fieldset disabled={busy} className="identity-columns">
      <Directory kind="imported" selected={source} onSelect={p => { clearPreview(); setSource(p); }} />
      <Directory kind="all" selected={target} onSelect={p => { clearPreview(); setTarget(p); }} />
    </fieldset>
    {source && target && <>
      <button type="button" className="primary" disabled={busy || source.id === target.id} onClick={() => void generatePreview()}>Conferir impacto da vinculação</button>
      {source.id === target.id && <p role="alert">Escolha dois cadastros diferentes.</p>}
      {preview && <section aria-label="Prévia da vinculação">
        <h3>Prévia: {preview.source.name || "Sem nome"} → {preview.target.name || "Sem nome"}</h3>
        <ul>{preview.impact.map(i => <li key={i.table}>{tableNames[i.table] ?? i.table}: {i.count} registro(s)</li>)}<li>Escalas de louvor: {preview.service_count}</li></ul>
        <p>Os perfis e vínculos exibidos acima passarão a pertencer ao cadastro de destino. A origem ficará arquivada e a revisão será registrada com os dados anteriores.</p>
        {preview.profile_choice && <label>Nome que deverá aparecer na conta
          <select value={choices.profile ?? ""} onChange={e => setChoices({ ...choices, profile: e.target.value })} disabled={busy}>
            <option value="">Escolha o nome confirmado</option><option value="target">{preview.target.name} (destino)</option><option value="source">{preview.source.name} (origem)</option>
          </select>
        </label>}
        {preview.conflicts.map(c => <div className="identity-conflict" key={c.key}>
          <h4>Dados diferentes: {tableNames[c.table] ?? c.table}</h4>
          <div className="identity-columns"><div><strong>Origem importada</strong><RecordDetails record={c.source} /></div><div><strong>Destino</strong><RecordDetails record={c.target} /></div></div>
          {c.resolvable ? <label>Qual registro manter em uso? A versão anterior ficará no registro da revisão.
            <select value={choices[c.key] ?? ""} disabled={busy} onChange={e => setChoices({ ...choices, [c.key]: e.target.value })}><option value="">Escolha após conferir</option><option value="target">Manter o registro de destino</option><option value="source">Usar o registro da origem</option></select>
          </label> : <p role="alert">Este conflito precisa ser ajustado no módulo de origem antes da vinculação.</p>}
        </div>)}
      </section>}
      <label>Como a identidade foi conferida ou por que são pessoas distintas?
        <textarea value={reason} onChange={e => setReason(e.target.value)} minLength={10} maxLength={2000} disabled={busy} placeholder="Registre a confirmação do membro e os dados conferidos." />
      </label>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} /> Conferi os dados e os vínculos destas pessoas para registrar a decisão.</label>
      <div className="actions">
        <button type="button" className="primary" disabled={busy || !preview || !!missingChoices || !confirmed || reason.trim().length < 10} onClick={() => void decide("merged")}>Confirmar vinculação</button>
        <button type="button" className="secondary" disabled={busy || source.id === target.id || !confirmed || reason.trim().length < 10} onClick={() => void decide("distinct")}>São pessoas distintas</button>
      </div>
    </>}
    <details><summary>Histórico das revisões</summary>
      {history.isPending ? <p>Carregando revisões…</p> : history.error ? <p role="alert">{errorMessage(history.error)} <button onClick={() => void history.refetch()}>Tentar novamente</button></p> : <>
        {!history.data.length && <p>Nenhuma revisão registrada.</p>}
        {history.data.slice(0, 20).map(r => <details key={r.id}><summary>{r.decision === "merged" ? "Vinculados" : "Pessoas distintas"}: {r.source.name || "Sem nome"} → {r.target.name || "Sem nome"} · {new Date(r.created_at).toLocaleString("pt-BR")}</summary>
          <p>{r.reason}</p><div className="identity-columns"><IdentityCard person={r.source} /><IdentityCard person={r.target} /></div>
          {!!r.conflicts?.length && <details><summary>Diferenças e escolhas registradas</summary>{r.conflicts.map(c => <div key={c.key}><h4>{tableNames[c.table] ?? c.table} · {r.choices?.[c.key] === "source" ? "Usada a origem" : "Mantido o destino"}</h4><div className="identity-columns"><div><strong>Origem anterior</strong><RecordDetails record={c.source} /></div><div><strong>Destino anterior</strong><RecordDetails record={c.target} /></div></div></div>)}</details>}
        </details>)}
        <div className="actions"><button disabled={!historyPage} onClick={() => setHistoryPage(historyPage - 1)}>Anterior</button><span>Página {historyPage + 1}</span><button disabled={history.data.length < 21} onClick={() => setHistoryPage(historyPage + 1)}>Próxima</button></div>
      </>}
    </details>
  </section>;
}
