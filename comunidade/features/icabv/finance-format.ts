export function parseBRL(value: string): number | null {
  const match = /^(\d{1,7})(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 100000000
    ? cents
    : null;
}
export function brl(cents: number | string) {
  const value = Number(cents);
  return Number.isSafeInteger(value)
    ? (value / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })
    : "Valor indisponível";
}
export type DemoLedgerRow = {
  id: string;
  created_at: string;
  kind: "settlement" | "refund" | "income" | "expense" | "reversal";
  amount_cents: number;
  description: string;
  category: string;
  reverses_id: string | null;
};
export function demoFinanceCsv(rows: DemoLedgerRow[]) {
  const cell = (value: string | number) => {
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) throw new Error("invalid_amount");
      return String(value);
    }
    let start = 0;
    while (
      start < value.length &&
      (value.charCodeAt(start) <= 32 || /\s/.test(value[start]))
    )
      start++;
    const safe =
      /^[=+\-@]/.test(value.slice(start)) || /^[\t\r\n]/.test(value)
        ? `'${value}`
        : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return (
    "\uFEFF" +
    [
      [
        "Identificador",
        "Data UTC",
        "Tipo",
        "Centavos BRL",
        "Categoria",
        "Descrição",
        "Ambiente",
      ],
      ...rows.map((r) => [
        r.id,
        r.created_at,
        r.kind,
        r.amount_cents,
        r.category,
        r.description,
        "DEMONSTRAÇÃO — SEM VALOR FISCAL",
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n") +
    "\r\n"
  );
}
