import { demoFinanceCsv, type DemoLedgerRow } from "./finance-format";
export async function exportDemoFinance(rows: DemoLedgerRow[]) {
  const url = URL.createObjectURL(
    new Blob([demoFinanceCsv(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "icabv.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
