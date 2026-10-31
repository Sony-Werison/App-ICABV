export function displayBrasilia(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function formatBrasilia(value: string): string {
  const shifted = new Date(new Date(value).getTime() - 3 * 60 * 60 * 1000);
  const iso = shifted.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}
export function parseBrasilia(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [, day, month, year, hour, minute] = m;
  const plain = `${year}-${month}-${day}T${hour}:${minute}:00`;
  const local = new Date(`${plain}Z`);
  if (
    !Number.isFinite(local.getTime()) ||
    local.toISOString().slice(0, 19) !== plain ||
    Number(year) < 2000
  )
    return null;
  return new Date(`${plain}-03:00`).toISOString();
}
type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
};
const escape = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
function fold(line: string) {
  let size = 0;
  let result = "";
  for (const character of line) {
    const cp = character.codePointAt(0)!;
    const bytes = cp <= 127 ? 1 : cp <= 2047 ? 2 : cp <= 65535 ? 3 : 4;
    if (size + bytes > 75) {
      result += "\r\n ";
      size = 1;
    }
    result += character;
    size += bytes;
  }
  return result;
}
export function calendarText(event: CalendarEvent, now = new Date()) {
  const stamp = (v: string | Date) =>
    new Date(v)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ICABV//Agenda//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${escape(event.id)}@icabv`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(event.starts_at)}`,
      `DTEND:${stamp(event.ends_at)}`,
      `SUMMARY:${escape(event.title)}`,
      `DESCRIPTION:${escape(event.description)}`,
      `LOCATION:${escape(event.location)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}
