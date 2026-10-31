// Development-only data source. No fetch, storage, credentials or real Supabase writes.
import type { SupabaseClient, Session } from "@supabase/supabase-js";
type Row = Record<string, unknown>;
export function createDemoClient(): SupabaseClient {
  const manager =
    new URLSearchParams(location.search).get("perfil") === "gestor";
  const id = "d0000000-0000-4000-8000-000000000001";
  const day = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const start = new Date(Date.now() + 3 * 86400000).toISOString();
  const end = new Date(Date.now() + 3 * 86400000 + 7200000).toISOString();
  const person = {
    id,
    auth_user_id: id,
    full_name: manager ? "Ana Exemplo" : "Lucas Exemplo",
    membership_status: "visitor",
    onboarded_at: new Date().toISOString(),
  };
  const user = {
    id,
    email: "exemplo@demo.invalid",
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  let session: Session | null = {
    access_token: "demo-only",
    refresh_token: "demo-only",
    expires_in: 3600,
    token_type: "bearer",
    user,
  } as Session;
  let roles = manager ? ["admin"] : ["visitor"];
  const listeners = new Set<(event: string, session: Session | null) => void>();
  let demoNotificationRead: string | null = null;
  const record = (key: string, kind: string, data: Row) => ({
    id: key,
    kind,
    data,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const memberId = "d0000000-0000-4000-8000-000000000002";
  const event = {
    id: "d0000000-0000-4000-8000-000000000003",
    title: "[Fictício] Culto de celebração",
    description: "Programação demonstrativa da ICABV.",
    location: "Local de demonstração",
    starts_at: start,
    ends_at: end,
    capacity: 120,
    audience: "public",
    status: "published",
    category: "Culto",
  };
  const tables: Record<string, Row[]> = {
    persons: [
      person,
      {
        id: memberId,
        full_name: "Maria Exemplo (fictício)",
        membership_status: "member",
      },
    ],
    person_contacts: [{ person_id: id, phone: "", email: "", birth_date: `1990-${day.slice(5)}`, avatar_url: "", share_birthday: true }],
    food_campaigns: [{ id: "demo-food-campaign", title: "[Fictício] Cestas da comunidade", description: "Ajude a completar as cestas das famílias acompanhadas pela igreja.", collection_point: "[Fictício] Secretaria, após os cultos", deadline: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), status: "open" }],
    food_items: [
      { id: "demo-rice", campaign_id: "demo-food-campaign", name: "Arroz", unit: "pacote de 5 kg", target_quantity: 10 },
      { id: "demo-beans", campaign_id: "demo-food-campaign", name: "Feijão", unit: "pacote de 1 kg", target_quantity: 20 },
    ],
    food_commitments: [{ item_id: "demo-rice", person_id: memberId, quantity: 2, received_quantity: 1 }],
    families: [
      {
        id: "d0000000-0000-4000-8000-000000000004",
        name: "Família Exemplo (fictício)",
      },
    ],
    events: [event],
    announcements: [
      {
        id: "demo-notice",
        title: "[Fictício] Bem-vindo à comunidade",
        body: "Explore os atalhos e conheça as telas do aplicativo.",
        audience: "public",
        published: true,
        expires_at: null,
      },
    ],
    content_links: [],
    consent_events: [],
    event_registrations: [],
    event_reminders: [],
    core_notifications: [],
    management_records: [
      record(memberId, "member", {
        name: "Maria Exemplo (fictício)",
        email: "maria@demo.invalid",
        phone: "",
        ministry: "Louvor",
        status: "Membro",
        birthday: "",
        notes: "",
      }),
      record("demo-income", "transaction", {
        description: "[Fictício] Ofertas de demonstração",
        direction: "Entrada",
        amount: 125000,
        category: "Ofertas",
        date: day,
        status: "Realizado",
        notes: "",
      }),
      record("demo-expense", "transaction", {
        description: "[Fictício] Manutenção",
        direction: "Saída",
        amount: 35000,
        category: "Manutenção",
        date: day,
        status: "Realizado",
        notes: "",
      }),
      record("demo-text", "content", {
        title: "[Fictício] Caminhar em comunidade",
        type: "Devocional",
        body: "Texto ilustrativo para visualizar a biblioteca de devocionais e estudos.",
        reference: "Salmo 133",
        speaker: "Equipe de demonstração",
        url: "",
        date: day,
        status: "Publicado",
      }),
      record("demo-event", "event", {
        title: "[Fictício] Encontro da comunidade",
        date: start.slice(0, 10),
        time: "19:00",
        location: "Local de demonstração",
        capacity: 120,
        status: "Confirmado",
        notes: "",
      }),
    ],
  };
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let first = 0,
      last = Number.MAX_SAFE_INTEGER,
      single = false,
      patch: Row | null = null,
      upsert: Row | null = null;
    const query = {
      select: () => query,
      order: () => query,
      eq: (key: string, value: unknown) => {
        filters.push((r) => r[key] === value);
        return query;
      },
      in: (key: string, values: unknown[]) => {
        filters.push((r) => values.includes(r[key]));
        return query;
      },
      range: (a: number, b: number) => {
        first = a;
        last = b;
        return query;
      },
      limit: (n: number) => {
        last = first + n - 1;
        return query;
      },
      single: () => {
        single = true;
        return query;
      },
      update: (data: Row) => {
        patch = data;
        return query;
      },
      upsert: (data: Row) => { upsert = data; return query; },
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (error: unknown) => unknown,
      ) =>
        Promise.resolve()
          .then(() => {
            if (upsert) {
              const row = (tables[table] ?? []).find(r => r.person_id === upsert!.person_id);
              if (row) Object.assign(row, upsert);
              else (tables[table] ??= []).push(upsert);
            }
            const rows = (tables[table] ?? []).filter((r) =>
              filters.every((f) => f(r)),
            );
            if (patch) rows.forEach((r) => Object.assign(r, patch));
            const data = rows.slice(first, last + 1);
            return {
              count: rows.length,
              data: single ? (data[0] ?? null) : data,
              error: null,
            };
          })
          .then(resolve, reject),
    };
    return query;
  }
  async function rpc(name: string, args: Row = {}) {
    const ok = (data: unknown) => ({ data, error: null });
    if (name === "my_roles") return ok(roles);
    if (name === "identity_directory") return ok({ items: [] });
    if (name === "identity_duplicates" || name === "identity_review_history") return ok([]);
    if (name === "notification_feed") return ok({ items: [{ key: "demo-announcement", version: "1", kind: "announcement", title: "[Fictício] Bem-vindo à comunidade", body: "Confira o comunicado da igreja.", tab: "content", section: null, occurred_at: start, actionable: false, read_at: demoNotificationRead }], unread_count: demoNotificationRead ? 0 : 1, total_count: 1 });
    if (name === "mark_app_notification") { demoNotificationRead = new Date().toISOString(); return ok(null); }
    if (name === "birthday_calendar" || name === "anniversary_calendar") {
      const month = Number(args.month_number);
      return ok(tables.person_contacts.filter(c => c.share_birthday && c.birth_date && Number(String(c.birth_date).slice(5, 7)) === month).map(c => ({ person_id: c.person_id, full_name: tables.persons.find(p => p.id === c.person_id)?.full_name, birth_day: Number(String(c.birth_date).slice(8, 10)), birth_month: month })));
    }
    if (name === "food_item_summary") return ok(tables.food_items.filter(i => i.campaign_id === args.campaign).map(i => {
      const commitments = tables.food_commitments.filter(c => c.item_id === i.id), mine = commitments.find(c => c.person_id === id);
      return { ...i, committed_quantity: commitments.reduce((n, c) => n + Number(c.quantity), 0), received_quantity: commitments.reduce((n, c) => n + Number(c.received_quantity), 0), my_quantity: mine?.quantity ?? 0, my_received: mine?.received_quantity ?? 0 };
    }));
    if (name === "commit_food_item") {
      const item = tables.food_items.find(i => i.id === args.item), campaign = tables.food_campaigns.find(c => c.id === item?.campaign_id), amount = Number(args.amount);
      if (!campaign || campaign.status !== "open" || String(campaign.deadline) < day) return { data: null, error: { message: "campaign_closed" } };
      const existing = tables.food_commitments.find(c => c.item_id === args.item && c.person_id === id);
      const other = tables.food_commitments.filter(c => c.item_id === args.item && c.person_id !== id).reduce((n, c) => n + Number(c.quantity), 0);
      if (amount < Number(existing?.received_quantity ?? 0)) return { data: null, error: { message: "below_received" } };
      if (amount + other > Number(item?.target_quantity)) return { data: null, error: { message: "item_full" } };
      if (existing) existing.quantity = amount;
      else tables.food_commitments.push({ item_id: args.item, person_id: id, quantity: amount, received_quantity: 0 });
      return ok(null);
    }
    if (["save_food_campaign", "save_food_item", "receive_food_item"].includes(name)) {
      if (!manager) return { data: null, error: { message: "forbidden" } };
      if (name === "receive_food_item") {
        const c = tables.food_commitments.find(c => c.item_id === args.item && c.person_id === args.contributor);
        if (!c || Number(args.amount) > Number(c.quantity)) return { data: null, error: { message: "invalid_quantity" } };
        c.received_quantity = args.amount;
        return ok(null);
      }
      const table = name === "save_food_campaign" ? "food_campaigns" : "food_items";
      const row = name === "save_food_campaign" ? { title: args.campaign_title, description: args.details, collection_point: args.collection, deadline: args.due_date, status: args.campaign_status } : { campaign_id: args.campaign, name: args.item_name, unit: args.item_unit, target_quantity: args.target };
      const existing = tables[table].find(r => r.id === args.resource);
      if (existing) Object.assign(existing, row);
      else tables[table].push({ id: crypto.randomUUID(), ...row });
      return ok(existing?.id ?? tables[table].at(-1)!.id);
    }
    if (name === "module_capabilities") return ok({louvor_manager:manager,ebd_manager:manager,ebd_teacher:false,ebd_observer:manager});
    if (name === "browse_events") return ok(args.page ? [] : tables.events);
    if (name === "browse_links") return ok([]);
    if (name === "event_availability_for")
      return ok([{ event_id: event.id, registered_count: 24 }]);
    if (name === "community_page")
      return ok(
        args.page
          ? []
          : [
              {
                id: "demo-unit",
                title:
                  args.kind === "department"
                    ? "[Fictício] Equipe de louvor"
                    : "[Fictício] Grupo de comunhão",
                description: "Unidade ilustrativa para conhecer os menus.",
                schedule: "Quartas-feiras, às 19h30",
                meeting_point: "Local de demonstração",
                published: true,
                my_status: "active",
                is_manager: manager,
              },
            ],
      );
    if (name === "my_service_assignments")
      return ok(
        args.page
          ? []
          : [
              {
                id: "demo-assignment",
                unit_title: "[Fictício] Louvor",
                title: "[Fictício] Apoio ao culto",
                starts_at: start,
                ends_at: end,
                status: "pending",
                attended: false,
                canceled: false,
              },
            ],
      );
    if (name === "finance_demo_enabled") return ok(false);
    if (name === "group_meeting_report")
      return ok([
        { planned: 2, held: 6, canceled: 0, confirmations: 18, presences: 15 },
      ]);
    const lists = [
      "prayer_feed_page",
      "community_roster",
      "community_leader_options",
      "unit_service_shifts",
      "service_roster",
      "service_exchange_page",
      "group_meeting_page",
      "group_meeting_roster",
      "group_chat_page",
      "item_availability_page",
    ];
    if (lists.includes(name)) return ok([]);
    if (name === "create_family") {
      tables.families.push({ id: crypto.randomUUID(), name: args.family_name });
      return ok(tables.families.at(-1)!.id);
    }
    if (name === "register_person") {
      const p = {
        id: crypto.randomUUID(),
        full_name: args.display_name,
        membership_status: "visitor",
      };
      tables.persons.push(p);
      return ok(p.id);
    }
    if (name === "set_membership") {
      const p = tables.persons.find((p) => p.id === args.person);
      if (p) p.membership_status = args.status;
      return ok(null);
    }
    if (name === "grant_role" || name === "revoke_role") {
      if (args.person === id)
        roles =
          name === "grant_role"
            ? [...new Set([...roles, String(args.assigned_role)])]
            : roles.filter((r) => r !== args.assigned_role);
      return ok(null);
    }
    if (name === "link_family") return ok(null);
    if (name === "save_management_record") {
      const existing = tables.management_records.find(
        (r) => r.id === args.resource,
      );
      if (existing && existing.version !== args.expected_version)
        return { data: null, error: { message: "version_conflict" } };
      if (existing) {
        existing.data = args.payload;
        existing.version = Number(existing.version) + 1;
      } else
        tables.management_records.push(
          record(
            crypto.randomUUID(),
            String(args.record_kind),
            args.payload as Row,
          ),
        );
      return ok(existing?.id ?? tables.management_records.at(-1)!.id);
    }
    if (name === "delete_management_record") {
      tables.management_records = tables.management_records.filter(
        (r) => r.id !== args.resource,
      );
      return ok(null);
    }
    return {
      data: null,
      error: {
        message:
          "Esta ação precisa de uma conta real; a demonstração permite explorar as telas e os registros fictícios.",
      },
    };
  }
  const client = {
    from,
    rpc,
    auth: {
      async getSession() {
        return { data: { session }, error: null };
      },
      onAuthStateChange(callback: (event: string, s: Session | null) => void) {
        listeners.add(callback);
        queueMicrotask(() => callback("INITIAL_SESSION", session));
        return {
          data: {
            subscription: { unsubscribe: () => listeners.delete(callback) },
          },
        };
      },
      async signOut() {
        session = null;
        listeners.forEach((f) => f("SIGNED_OUT", null));
        return { error: null };
      },
      async signInWithPassword() {
        return {
          data: { session: null, user: null },
          error: { message: "Use o acesso real para entrar." },
        };
      },
    },
  };
  return client as unknown as SupabaseClient;
}
