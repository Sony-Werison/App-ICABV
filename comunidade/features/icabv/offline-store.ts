export type Command = { kind: "rpc" | "table"; target: string; method: string; body: unknown; filters?: Record<string, { op: string; value: unknown }>; resolution?: string; on_conflict?: string; expected?: { exists: boolean; match: Record<string, unknown>; values: Record<string, unknown> } };
export type PendingChange = { key?: number; id: string; user: string; project: string; command: Command; wire?: Command; optimistic: unknown; description: string; state: "pending" | "review"; error?: string; createdAt: number };
export type CachedRead = { key: string; user: string; project: string; body: string; status: number; headers: [string, string][]; savedAt: number };
export interface OfflineStore {
  list(user: string, project: string): Promise<PendingChange[]>;
  add(change: PendingChange): Promise<PendingChange>;
  put(change: PendingChange): Promise<void>;
  remove(key: number): Promise<void>;
  read(key: string): Promise<CachedRead | undefined>;
  cache(value: CachedRead): Promise<void>;
  mappings(user: string, project: string): Promise<Record<string, string>>;
  map(user: string, project: string, values: Record<string, string>): Promise<void>;
  baseline?(user: string, project: string, target: string, match: Record<string, unknown>): Promise<Record<string, unknown> | undefined>;
}
export class IndexedOfflineStore implements OfflineStore {
  private opening?: Promise<IDBDatabase>;
  private db() {
    return this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("icabv-offline-v1", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("changes", { keyPath: "key", autoIncrement: true });
        db.createObjectStore("reads", { keyPath: "key" });
        db.createObjectStore("mappings");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(Error("Não foi possível abrir o armazenamento deste dispositivo."));
    });
  }
  private async transact<T>(name: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode), request = action(tx.objectStore(name));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(Error("Não foi possível guardar a alteração neste dispositivo. Verifique o espaço disponível e tente novamente."));
    });
  }
  async list(user: string, project: string) { return (await this.transact<PendingChange[]>("changes", "readonly", s => s.getAll())).filter(c => c.user === user && c.project === project).sort((a, b) => a.key! - b.key!); }
  async add(change: PendingChange) { const key = await this.transact<IDBValidKey>("changes", "readwrite", s => s.add(change)); return { ...change, key: Number(key) }; }
  async put(change: PendingChange) { await this.transact("changes", "readwrite", s => s.put(change)); }
  async remove(key: number) { await this.transact("changes", "readwrite", s => s.delete(key)); }
  async read(key: string) { return this.transact<CachedRead | undefined>("reads", "readonly", s => s.get(key)); }
  async cache(value: CachedRead) {
    if (value.body.length > 2500000) return;
    await this.transact("reads", "readwrite", s => s.put(value));
    const rows = await this.transact<CachedRead[]>("reads", "readonly", s => s.getAll());
    const mine = rows.filter(r => r.user === value.user && r.project === value.project).sort((a, b) => b.savedAt - a.savedAt);
    let bytes = 0;
    for (let i = 0; i < mine.length; i++) {
      bytes += mine[i].body.length;
      if (i >= 120 || bytes > 20000000) await this.transact("reads", "readwrite", s => s.delete(mine[i].key));
    }
  }
  async mappings(user: string, project: string) { return await this.transact<Record<string, string> | undefined>("mappings", "readonly", s => s.get(project + "|" + user)) ?? {}; }
  async baseline(user: string, project: string, target: string, match: Record<string, unknown>) {
    const reads = (await this.transact<CachedRead[]>("reads", "readonly", s => s.getAll())).filter(r => r.user === user && r.project === project && r.key.includes("|GET|/rest/v1/" + target + "?")).sort((a, b) => b.savedAt - a.savedAt);
    for (const read of reads) {
      try {
        const data = JSON.parse(read.body), rows = Array.isArray(data) ? data : [data];
        const row = rows.find(r => r && Object.entries(match).every(([k, v]) => r[k] === v));
        if (row) return row as Record<string, unknown>;
      } catch {}
    }
  }
  async map(user: string, project: string, values: Record<string, string>) {
    const key = project + "|" + user, current = await this.mappings(user, project);
    await this.transact("mappings", "readwrite", s => s.put({ ...current, ...values }, key));
  }
}
