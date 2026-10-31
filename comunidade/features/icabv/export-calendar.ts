import { calendarText } from "./event-format";
export async function exportCalendar(
  event: Parameters<typeof calendarText>[0],
) {
  const url = URL.createObjectURL(
    new Blob([calendarText(event)], { type: "text/calendar;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "icabv.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
