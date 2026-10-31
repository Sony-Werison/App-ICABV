"use client";
import { useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { ChevronDown } from "lucide-react";
import { Disclosure, LoadingState } from "./presentation";
import { offlineVersion, savedMessage } from "./offline-transport";

export type Data = Record<string, unknown>;
export async function moduleRpc<T>(name: string, args: Data = {}): Promise<T> {
  const r = await supabase!.rpc(name, args);
  if (r.error) throw r.error;
  return r.data as T;
}
export async function moduleRows<T>(
  table: string,
  order: string,
  filter?: [string, string],
) {
  const key =
    (
      {
        module_access: "person_id",
        worship_members: "person_id",
        person_contacts: "person_id",
        food_commitments: "item_id",
        worship_live: "service_id",
        ebd_class_members: "person_id",
        ebd_guardians: "student_id",
        ebd_activity_keys: "activity_id",
        ebd_activity_starts: "activity_id",
      } as Record<string, string>
    )[table] ?? "id";
  let q = supabase!
    .from(table)
    .select("*")
    .order(order === "id" ? key : order)
    .order(key);
  if (filter) q = q.eq(...filter);
  const rows: T[] = [];
  // Supabase caps responses; never silently truncate the repertoire or reports.
  for (let start = 0; ; start += 500) {
    const r = await q.range(start, start + 499);
    if (r.error) throw r.error;
    rows.push(...(r.data as T[]));
    if (r.data.length < 500) break;
  }
  return rows;
}
export function useModuleRows<T>(
  table: string,
  order = "id",
  filter?: [string, string],
  enabled = true,
) {
  return useQuery({
    queryKey: ["modules", table, filter],
    queryFn: () => moduleRows<T>(table, order, filter),
    enabled,
  });
}
export function useModuleAction() {
  const client = useQueryClient(),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  async function act(
    task: () => PromiseLike<{ error: unknown }> | Promise<unknown>,
    success = "Salvo com sucesso.",
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setFailed(false);
    const before = offlineVersion();
    try {
      const r = await task();
      if (r && typeof r === "object" && "error" in r && r.error) throw r.error;
      setMessage(savedMessage(before, success));
      await client.invalidateQueries({ queryKey: ["modules"] });
      return true;
    } catch (e) {
      const reason = e && typeof e === "object"
        ? ["message", "code"].filter(key => key in e).map(key => String((e as Record<string, unknown>)[key])).join(" ")
        : String(e ?? "");
      const normalizedReason = reason.toLowerCase();
      const errorCode = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
      setFailed(true);
        setMessage(
          errorCode === "42702"
            ? "O servidor ainda está usando a versão antiga do cadastro de visitas. Atualize as migrações do banco e tente sincronizar novamente."
            :
        normalizedReason.includes("offline_conflict")
          ? "Esta chamada já foi atualizada no servidor. Sua alteração continua guardada para revisão; confira a chamada atual antes de refazê-la."
          : normalizedReason.includes("invalid_availability") || normalizedReason.includes("23514")
            ? "Confira a disponibilidade: escolha ao menos um dia para visitar ou uma data futura para receber visitas."
            : normalizedReason.includes("pgrst202") || normalizedReason.includes("42883") || normalizedReason.includes("could not find the function")
              ? "O cadastro de disponibilidade ainda não está sincronizado no servidor. A equipe responsável precisa atualizar a função do banco de dados."
              : normalizedReason.includes("unauthorized") || normalizedReason.includes("42501") || normalizedReason.includes("permission denied")
              ? "Não foi possível identificar seu cadastro ativo. Saia do app e entre novamente; se persistir, peça à gestão para conferir seu vínculo."
              : normalizedReason.includes("22007") || normalizedReason.includes("invalid input syntax for type date")
                ? "Confira as datas escolhidas e tente cadastrar a disponibilidade novamente."
              : normalizedReason.includes("sem conexão") || normalizedReason.includes("failed to fetch") || normalizedReason.includes("networkerror") || normalizedReason.includes("load failed")
                ? "Sem conexão com o servidor. Verifique a internet e tente salvar novamente."
          : reason.includes("espaço disponível") || reason.includes("armazenamento deste dispositivo")
            ? reason
            : reason.includes("item_full")
          ? "Outros membros já se comprometeram com esta quantidade. Atualize a página e escolha uma quantidade disponível."
          : reason.includes("campaign_closed")
            ? "O prazo desta campanha encerrou. Consulte a gestão para ajustar sua contribuição."
            : reason.includes("opportunity_taken")
              ? "Outra pessoa assumiu esta oportunidade. Atualize a lista e escolha outra data."
              : reason.includes("visit_not_due")
                ? "Registre o resultado da visita depois da data combinada."
                : reason.includes("justification_required")
                  ? "Explique em pelo menos cinco caracteres por que a visita não aconteceu."
            : reason.includes("below_received")
              ? "A contribuição não pode ser menor que a quantidade já recebida."
              : reason.includes("target_below_committed")
                ? "A quantidade necessária não pode ser menor que os compromissos já registrados."
                : reason.includes("item_in_use")
                  ? "Mantenha o nome e a embalagem de um item que já tem contribuições. Cadastre outro item para uma embalagem diferente."
                  : reason.includes("item_limit")
                    ? "A campanha já atingiu o limite de 200 itens."
                    : reason.includes("duplicate") || reason.includes("23505")
          ? "Este registro já existe. Abra o registro existente para editar."
          : reason.includes("minimum_time")
            ? "Conclua o tempo de estudo indicado antes de enviar."
            : reason.includes("study_limit_reached")
              ? "Você concluiu o limite de atividades deste período. Continue no próximo dia ou semana, conforme o plano do módulo."
              : reason.includes("module_incomplete")
                ? "Conclua as atividades publicadas do módulo atual antes de avançar."
                : reason.includes("next_module_required")
                  ? "Peça ao professor para definir o próximo módulo."
                  : reason.includes("activity_unavailable")
                    ? "Atividade indisponível para sua turma ou fora do período de entrega."
                    : reason.includes("forbidden") ||
                        reason.includes("row-level")
                      ? "Seu perfil não permite esta alteração."
                      : reason.includes("answer_required")
                        ? "Responda todas as perguntas antes de enviar."
            : `Não foi possível salvar. Confira os campos e tente novamente.${errorCode ? ` (código ${errorCode})` : ""}`,
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    message,
    failed,
    act,
    notice: message ? (
      <p className="icabv-message" role={failed ? "alert" : "status"}>
        {message}
      </p>
    ) : null,
  };
}
export type Option = { value: string; label: string };
export type FormField = {
  name: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "datetime-local"
    | "url"
    | "email"
    | "checkbox"
    | "select";
  required?: boolean;
  options?: Option[];
  min?: number;
  max?: number;
  step?: string;
  hint?: string;
};
export function ModuleForm({
  title,
  fields,
  initial = {},
  busy,
  onSave,
  onCancel,
  submit = "Salvar",
  children,
}: {
  title: string;
  fields: FormField[];
  initial?: Data;
  busy: boolean;
  onSave: (v: Data) => Promise<boolean>;
  onCancel?: () => void;
  submit?: string;
  children?: ReactNode;
}) {
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const secondaryNames = new Set(["pdf_links", "youtube_url", "avatar_url", "bpm", "next_module_id", "reading_group_size", "description", "whatsapp_template"]);
  const optional = fields.length > 7 ? fields.filter(f => !f.required && secondaryNames.has(f.name)) : [];
  const visible = fields.filter(f => !optional.includes(f));
  const renderField = (f: FormField) => (
            <label
              className={
                "icabv-field " + (f.type === "textarea" ? "module-span" : "")
              }
              key={f.name}
            >
              <span>{f.label}{f.required && <span className="ui-required" aria-label="obrigatório"> *</span>}</span>
              {f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  aria-label={f.label}
                  name={f.name}
                  defaultChecked={!!initial[f.name]}
                />
              ) : f.type === "select" ? (
                <select
                  aria-label={f.label}
                  name={f.name}
                  required={f.required}
                  defaultValue={String(initial[f.name] ?? "")}
                >
                  <option value="">Selecione</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  aria-label={f.label}
                  name={f.name}
                  rows={5}
                  defaultValue={String(initial[f.name] ?? "")}
                  required={f.required}
                  maxLength={60000}
                />
              ) : (
                <input
                  aria-label={f.label}
                  type={f.type ?? "text"}
                  name={f.name}
                  defaultValue={String(initial[f.name] ?? "")}
                  required={f.required}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  maxLength={f.name === "title" ? 180 : undefined}
                />
              )}{" "}
              {f.hint && <small>{f.hint}</small>}
              {invalid[f.name] && <small className="ui-field-error" role="alert">{invalid[f.name]}</small>}
            </label>);
  return (
    <section className="icabv-card module-editor">
      <h2>{title}</h2>
      <form
        aria-busy={busy}
        onInvalid={e => { const field = e.target as HTMLInputElement; field.closest("details")?.setAttribute("open", ""); setInvalid(old => ({ ...old, [field.name]: field.validity.valueMissing ? "Preencha este campo." : "Confira o valor informado." })); }}
        onInput={e => { const field = e.target as HTMLInputElement; if (field.validity.valid) setInvalid(old => ({ ...old, [field.name]: "" })); }}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            data = new FormData(form),
            values: Data = {};
          for (const f of fields)
            values[f.name] =
              f.type === "checkbox"
                ? data.has(f.name)
                : f.type === "number"
                  ? data.get(f.name) === ""
                    ? null
                    : Number(data.get(f.name))
                  : String(data.get(f.name) ?? "").trim();
          await onSave(values);
        }}
      >
        <div className="module-form-grid">
          {visible.map(renderField)}
        </div>
        {children}
        {optional.length > 0 && <Disclosure title="Conteúdo e opções adicionais" description="Links, anexos e ajustes opcionais"><div className="module-form-grid">{optional.map(renderField)}</div></Disclosure>}
        <div className="card-actions">
          <button className="primary" disabled={busy}>
            {busy ? "Salvando…" : submit}
          </button>
          {onCancel && (
            <button
              type="button"
              className="secondary"
              onClick={onCancel}
              disabled={busy}
            >
              Cancelar edição
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
export function ModuleTabs({
  tabs,
  current,
  onChange,
  label,
  primaryTabs,
  unified = false,
}: {
  tabs: string[];
  current: string;
  onChange: (tab: string) => void;
  label: string;
  primaryTabs?: string[];
  unified?: boolean;
}) {
  const main = primaryTabs ? primaryTabs.filter(t => tabs.includes(t)).slice(0, 3) : tabs.slice(0, 3), more = tabs.filter(t => !main.includes(t));
  const moreActive = more.includes(current);
  const [expanded, setExpanded] = useState(moreActive);
  const select = (tab: string) => { onChange(tab); setExpanded(false); };
  const button = (t: string) => <button type="button" key={t} aria-current={t === current ? "page" : undefined} className={t === current ? "primary" : "secondary"} onClick={() => select(t)}>{t}</button>;
  return <nav className="module-tabs" aria-label={label}>
    {unified?tabs.map(button):<>
    {main.map(button)}
    {!!more.length && <details className="ui-tab-more" open={expanded} onToggle={e => setExpanded(e.currentTarget.open)}>
      <summary aria-label={moreActive ? `Mais opções: ${current}` : "Mais opções"} aria-current={moreActive ? "page" : undefined}>Mais<span className="ui-tab-current">{moreActive ? ` · ${current}` : ""}</span><ChevronDown size={16} aria-hidden="true" /></summary>
      <div>{more.map(button)}</div>
    </details>}
    {moreActive && <span className="ui-current-section">{current}</span>}
    </>}
  </nav>;
}
export function ModuleState({
  query,
  children,
  loadingLabel,
}: {
  query: { isPending: boolean; error: unknown; refetch: () => unknown };
  children: ReactNode;
  loadingLabel?:string;
}) {
  if (query.isPending) return <LoadingState label={loadingLabel}/>;
  if (query.error)
    return (
      <section className="icabv-card" role="alert">
        <p>Não foi possível carregar os dados.</p>
        <button className="secondary" onClick={() => void query.refetch()}>
          Tentar novamente
        </button>
      </section>
    );
  return <>{children}</>;
}
export function downloadData(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob(
      [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
      {
        type:
          typeof data === "string"
            ? "text/csv;charset=utf-8"
            : "application/json",
      },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvData(rows: unknown[][]) {
  return (
    "\ufeff" +
    rows
      .map((r) =>
        r
          .map(
            (v) =>
              '"' +
              String(v ?? "")
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(";"),
      )
      .join("\r\n")
  );
}
export function safeHttps(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}
export type Capabilities = {
  louvor_manager: boolean;
  ebd_manager: boolean;
  ebd_teacher: boolean;
  ebd_observer: boolean;
};
export type PersonOption = { id: string; full_name: string };
export function useModulePeople(module: string, enabled: boolean) {
  return useQuery({
    queryKey: ["modules", "people", module],
    queryFn: () =>
      moduleRpc<PersonOption[]>("module_people", { target_module: module }),
    enabled,
  });
}
