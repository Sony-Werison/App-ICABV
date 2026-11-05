import { mutationResults } from "./offline-rpcs";
import { IndexedOfflineStore, type Command, type OfflineStore } from "./offline-store";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rowIds = new Set(["worship_songs", "worship_services", "worship_rehearsals", "ebd_classes", "ebd_modules", "ebd_recordings", "ebd_attendance", "ebd_lesson_sessions"]);
const descriptions: Record<string, string> = { review_identity: "Revisão de vínculo de conta", ebd_attendance: "Chamada da EBD", ebd_lesson_sessions: "Tema da aula da EBD", worship_songs: "Música do Louvor", worship_services: "Escala do Louvor", ebd_recordings: "Registro de aula", ebd_classes: "Turma da EBD", persons: "Dados do perfil", person_contacts: "Dados de contato", save_management_record: "Registro da gestão", commit_food_item: "Contribuição para cestas básicas", respond_service_assignment: "Resposta à escala", register_event: "Participação em evento" };
export type SyncSession = { user: string; token: string } | null;
type Environment = { online: () => boolean; now: () => number; uuid: () => string; fetch: typeof fetch; session: () => Promise<SyncSession>; changed: () => void; lock?: (name: string, callback: () => Promise<void>) => Promise<void> };
function identity(headers: Headers) {
  try { const token = headers.get("authorization")?.replace(/^Bearer /i, "") ?? ""; const data = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); return typeof data.sub === "string" && uuid.test(data.sub) ? data.sub : ""; } catch { return ""; }
}
function filterValue(value: string) {
  if (value.startsWith("eq.")) return { op: "eq", value: value.slice(3) };
  if (value === "is.null") return { op: "is", value: null };
  if (value.startsWith("in.(") && value.endsWith(")")) {
    const inside = value.slice(4, -1);
    let values: string[];
    try { values = JSON.parse("[" + inside + "]"); } catch { values = inside.split(","); }
    return { op: "in", value: values };
  }
  throw Error("Esta alteração precisa de uma conexão ativa e de uma atualização do aplicativo.");
}
function matches(row: Record<string, unknown>, filters: Command["filters"] = {}) {
  return Object.entries(filters).every(([key, f]) => f.op === "in" ? (f.value as unknown[]).map(String).includes(String(row[key])) : f.op === "is" ? row[key] == null : String(row[key]) === String(f.value));
}
function rewrite<T>(value: T, mappings: Record<string, string>): T {
  if (typeof value === "string") { let text: string = value; for (const [from, to] of Object.entries(mappings)) text = text.replaceAll(from, to); return text as T; }
  if (Array.isArray(value)) return value.map(v => rewrite(v, mappings)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, mappings)])) as T;
  return value;
}
export class OfflineTransport {
  private store: OfflineStore;
  private env: Environment;
  private project: string;
  private flushing?: Promise<void>;
  private results = new Map<string, { data: unknown; error?: { message: string; code?: string }; status: number }>();
  queuedVersion = 0;
  constructor(project: string, store: OfflineStore, env: Environment) { this.project = project; this.store = store; this.env = env; }
  pending(user: string) { return this.store.list(user, this.project); }
  async cancel(user: string, key: number) { const c = (await this.pending(user)).find(c => c.key === key); if (c) { await this.store.remove(key); this.env.changed(); } }
  async retry(user: string) { for (const c of await this.pending(user)) if (c.state === "review") { c.state = "pending"; c.error = undefined; c.wire = undefined; await this.store.put(c); } await this.flush(user); }
  private async overlay(data: unknown, target: string, user: string, readFilters: Command["filters"], append = true) {
    const single = !Array.isArray(data), rows = (single ? data ? [data] : [] : data) as Record<string, unknown>[];
    for (const c of await this.pending(user)) {
      if (c.state === "review" || c.command.kind !== "table" || c.command.target !== target) continue;
      if (c.command.method === "DELETE") { for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], c.command.filters)) rows.splice(i, 1); continue; }
      const changes = (Array.isArray(c.optimistic) ? c.optimistic : [c.optimistic]) as Record<string, unknown>[];
      for (const change of changes) {
        const keys = c.command.on_conflict?.split(",") ?? ("id" in change ? ["id"] : target === "person_contacts" ? ["person_id"] : Object.keys(change).filter(k => k.endsWith("_id")));
        const existing = rows.find(r => c.command.method === "PATCH" ? matches(r, c.command.filters) : keys.length && keys.every(k => r[k] === change[k]));
        if (existing) Object.assign(existing, change);
        else if (append && c.command.method === "POST" && matches(change, readFilters)) {
          const known = keys.length ? await this.store.baseline?.(user, this.project, target, Object.fromEntries(keys.map(k => [k, change[k]]))) : undefined;
          if (!known) rows.push(change);
        }
      }
    }
    return single ? rows[0] ?? null : rows;
  }
  async request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.origin !== this.project || !url.pathname.startsWith("/rest/v1/")) return this.env.fetch(input, init);
    const user = identity(request.headers), target = url.pathname.slice("/rest/v1/".length), isRpc = target.startsWith("rpc/"), name = isRpc ? target.slice(4) : target;
    const bodyText = ["GET", "HEAD"].includes(request.method) ? "" : await request.clone().text();
    const mutation = user && (isRpc ? !!mutationResults[name] && request.method === "POST" : ["POST", "PATCH", "DELETE"].includes(request.method));
    if (!mutation) {
      const key = [this.project, user, request.method, url.pathname + url.search, bodyText, request.headers.get("accept"), request.headers.get("range")].join("|");
      if (this.env.online()) {
        try {
          const response = await this.env.fetch(request);
          if (response.ok && request.method !== "HEAD") {
            try { await this.store.cache({ key, user, project: this.project, body: await response.clone().text(), status: response.status, headers: [...response.headers].filter(([k]) => ["content-type", "content-range"].includes(k)), savedAt: this.env.now() }); } catch { /* A read remains usable if the cache is full. */ }
          }
          return response;
        } catch (error) { if (request.signal.aborted) throw error; }
      }
      const cached = await this.store.read(key);
      if (!cached) throw Error("Sem conexão. Abra esta tela com internet antes de usá-la offline.");
      let content = cached.body;
      if (isRpc && name === "notification_feed" && user) {
        const feed = JSON.parse(content);
        const marks = (await this.pending(user)).filter(c => c.command.target === "mark_app_notification").map(c => c.command.body as { notification_key: string; notification_version: string });
        for (const item of feed.items ?? []) if (!item.read_at && marks.some(m => m.notification_key === item.key && m.notification_version === item.version)) { item.read_at = new Date(this.env.now()).toISOString(); feed.unread_count = Math.max(0, feed.unread_count - 1); }
        content = JSON.stringify(feed);
      }
      if (!isRpc && user) {
        const filters: NonNullable<Command["filters"]> = {};
        for (const [k, v] of url.searchParams) if (!["select", "order", "limit", "offset", "on_conflict"].includes(k)) { try { filters[k] = filterValue(v); } catch {} }
        try { content = JSON.stringify(await this.overlay(JSON.parse(content), name, user, filters, Number(url.searchParams.get("offset") ?? 0) === 0)); } catch {}
      }
      return new Response(content, { status: cached.status, headers: [...cached.headers, ["x-icabv-offline", "true"]] });
    }
    const filters: NonNullable<Command["filters"]> = {};
    for (const [k, v] of url.searchParams) if (!["select", "on_conflict", "columns", "order", "limit", "offset"].includes(k)) filters[k] = filterValue(v);
    const body = bodyText ? JSON.parse(bodyText) : null;
    const resolution = request.headers.get("prefer")?.match(/resolution=([^,]+)/)?.[1];
    const command: Command = { kind: isRpc ? "rpc" : "table", target: name, method: request.method, body, ...(isRpc ? {} : { filters, resolution, on_conflict: url.searchParams.get("on_conflict") ?? undefined }) };
    if (!isRpc && name === "ebd_attendance" && request.method === "POST" && !Array.isArray(body) && this.store.baseline) {
      const match = { class_id: body.class_id, person_id: body.person_id, lesson_date: body.lesson_date };
      const original = await this.store.baseline(user, this.project, name, match);
      const rows = await this.overlay(original ? [original] : [], name, user, Object.fromEntries(Object.entries(match).map(([k, v]) => [k, { op: "eq", value: v }])));
      const row = (rows as Record<string, unknown>[]).find(r => Object.entries(match).every(([k, v]) => r[k] === v));
      command.expected = { exists: !!row, match, values: row ? Object.fromEntries(["present", "criteria", "score", "note"].filter(k => k in body).map(k => [k, row[k] ?? null])) : {} };
    }
    let optimistic: unknown = isRpc ? mutationResults[name] === "uuid" ? this.env.uuid() : mutationResults[name] === "time" ? new Date(this.env.now()).toISOString() : null : body;
    if (!isRpc && rowIds.has(name) && request.method === "POST") optimistic = Array.isArray(body) ? body.map(r => ({ ...r, id: r.id ?? this.env.uuid() })) : { ...body, id: body.id ?? this.env.uuid() };
    const op = await this.store.add({ id: this.env.uuid(), user, project: this.project, command, optimistic, description: descriptions[name] ?? (isRpc ? "Alteração na igreja" : "Alteração de cadastro"), state: "pending", createdAt: this.env.now() });
    this.env.changed();
    if (this.env.online()) await this.flush(user);
    const sent = this.results.get(op.id); this.results.delete(op.id);
    if (sent?.error) return Response.json(sent.error, { status: sent.status });
    const pending = !sent;
    if (pending) { this.queuedVersion++; this.env.changed(); }
    let data = sent ? sent.data : optimistic;
    if (!isRpc) {
      if (!request.headers.get("prefer")?.includes("return=representation")) data = null;
      else {
        const rows = Array.isArray(data) ? data : data ? [data] : [];
        if (request.headers.get("accept")?.includes("vnd.pgrst.object")) {
          if (rows.length !== 1) return Response.json({ message: "Não foi possível identificar um único registro.", code: "PGRST116" }, { status: 406 });
          data = rows[0];
        } else data = rows;
      }
    }
    return Response.json(data, { status: pending ? 202 : 200, headers: pending ? { "x-icabv-pending": op.id } : {} });
  }
  async flush(user: string) {
    if (!this.env.online()) return;
    if (this.flushing) return this.flushing;
    const work = async () => {
      for (;;) {
        const next = (await this.pending(user))[0];
        if (!next || next.state === "review" || !this.env.online()) break;
        let session: SyncSession;
        try { session = await this.env.session(); } catch { break; }
        if (!session || session.user !== user) break;
        const mappings = await this.store.mappings(user, this.project);
        if (!next.wire) { next.wire = rewrite(next.command, mappings); await this.store.put(next); }
        let response: Response;
        try { response = await this.env.fetch(this.project + "/rest/v1/rpc/sync_operation", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.token, apikey: transportPublicKey }, body: JSON.stringify({ operation_id: next.id, command: next.wire }) }); } catch { break; }
        const data = await response.json().catch(() => ({ message: "Resposta inválida do servidor." }));
        if (!response.ok) {
          if (response.status >= 500 || response.status === 408 || response.status === 429) break;
          next.state = "review";
          const failure = data as { message?: string; code?: string };
          next.error = response.status === 401 ? "Entre novamente para enviar esta alteração." : failure.message?.includes("version_conflict") || failure.message?.includes("offline_conflict") ? "O registro mudou no servidor. Confira a versão atual antes de refazer esta alteração." : next.command.kind === "rpc" && next.command.target === "save_visit_availability" && failure.code === "22023" && failure.message === "invalid_availability" ? "A disponibilidade foi rejeitada. Confira os dias e a frequência ou selecione datas a partir de hoje, dentro dos próximos 90 dias." : "O servidor não aceitou esta alteração. Confira os dados e seu acesso antes de tentar novamente.";
          await this.store.put(next);
          this.results.set(next.id, { data: null, error: { ...failure, message: failure.message ?? next.error }, status: response.status });
          break;
        }
        const ids: Record<string, string> = {};
        if (typeof next.optimistic === "string" && uuid.test(next.optimistic) && typeof data === "string" && uuid.test(data)) ids[next.optimistic] = data;
        else if (next.command.kind === "table") {
          const before = Array.isArray(next.optimistic) ? next.optimistic : [next.optimistic], after = Array.isArray(data) ? data : [data];
          before.forEach((r, i) => { if (r?.id && after[i]?.id && r.id !== after[i].id) ids[r.id] = after[i].id; });
        }
        if (Object.keys(ids).length) await this.store.map(user, this.project, ids);
        this.results.set(next.id, { data, status: response.status });
        if (this.results.size > 100) this.results.delete(this.results.keys().next().value!);
        await this.store.remove(next.key!);
        this.env.changed();
      }
    };
    this.flushing = (this.env.lock ? this.env.lock("icabv-sync-" + user, work) : work()).finally(() => { this.flushing = undefined; this.env.changed(); });
    return this.flushing;
  }
}
let sessionReader: () => Promise<SyncSession> = async () => null;
let transportPublicKey = "";
export let offlineTransport: OfflineTransport | undefined;
export function configureOfflineSession(reader: () => Promise<SyncSession>) { sessionReader = reader; }
export function offlineVersion() { return offlineTransport?.queuedVersion ?? 0; }
export const savedMessage = (before: number, message = "Salvo com sucesso.") => offlineVersion() > before ? "Guardado neste dispositivo. Será enviado quando a conexão voltar." : message;
export function offlineFetch(origin: string, publicKey: string): typeof fetch {
  transportPublicKey = publicKey;
  const native = globalThis.fetch.bind(globalThis);
  if (typeof window !== "undefined" && globalThis.indexedDB) {
    offlineTransport ??= new OfflineTransport(new URL(origin).origin, new IndexedOfflineStore(), { online: () => navigator.onLine, now: Date.now, uuid: () => crypto.randomUUID(), fetch: native, session: () => sessionReader(), changed: () => window.dispatchEvent(new Event("icabv-sync")), lock: navigator.locks ? async (name, fn) => { await navigator.locks.request(name, fn); } : undefined });
  }
  return async (input, init) => {
    if (typeof window === "undefined" || !globalThis.indexedDB) return native(input, init);
    return offlineTransport!.request(input, init);
  };
}
