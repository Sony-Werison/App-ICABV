import { supabase } from "./supabase";
import { schemas, type Kind, type Item } from "../../app/model";
function failure(error: { message: string }) {
  const message = error.message;
  throw Error(
    message.includes("version_conflict")
      ? "Este registro mudou. Atualize a lista."
      : message.includes("schedule_conflict")
        ? "Esta pessoa já está escalada nesse horário."
        : message.includes("record_linked")
          ? "Remova os vínculos das escalas antes de excluir."
          : message.includes("invalid_member")
            ? "Selecione uma pessoa ativa."
            : message.includes("invalid_event")
              ? "Selecione um evento disponível."
              : "Não foi possível concluir. Confira seu acesso e tente novamente.",
  );
}
export async function readRecords(): Promise<Item[]> {
  if (!supabase) throw Error("Supabase não configurado.");
  const items: Item[] = [];
  // PostgREST caps each response; page explicitly so totals never use a truncated list.
  for (let offset = 0; offset < 10000; offset += 100) {
    const { data, error } = await supabase
      .from("management_records")
      .select("*")
      .order("created_at")
      .order("id")
      .range(offset, offset + 99);
    if (error) failure(error);
    const rows = data ?? [];
    items.push(
      ...rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        data: r.data,
        version: r.version,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    );
    if (rows.length < 100) return items;
  }
  throw Error(
    "A lista ultrapassou 10.000 registros. Solicite um relatório completo antes de consultar os totais.",
  );
}
export async function saveRecord(
  kind: Kind,
  data: Record<string, string | number>,
  item?: Item,
) {
  const payload = schemas[kind].parse(data);
  const result = await supabase!.rpc("save_management_record", {
    resource: item?.id ?? null,
    record_kind: kind,
    payload,
    expected_version: item?.version ?? null,
  });
  if (result.error) failure(result.error);
}
export async function deleteRecord(item: Item) {
  const result = await supabase!.rpc("delete_management_record", {
    resource: item.id,
    expected_version: item.version,
  });
  if (result.error) failure(result.error);
}
