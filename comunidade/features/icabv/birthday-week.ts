export type Birthday = { person_id: string; full_name: string; birth_day: number; birth_month: number; anniversary_type?: "birthday" | "wedding" };

/** Calendar dates for the church's current Monday–Sunday week. */
export function birthdayWeekDates(today: string) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(date);
    day.setUTCDate(date.getUTCDate() + offset);
    return { month: day.getUTCMonth() + 1, day: day.getUTCDate() };
  });
}

export async function loadWeeklyBirthdays(today: string, loadPage: (month: number, page: number) => Promise<Birthday[]>) {
  const dates = birthdayWeekDates(today);
  const order = new Map(dates.map((date, index) => [`${date.month}-${date.day}`, index]));
  const result: Birthday[] = [];
  for (const month of new Set(dates.map(date => date.month))) {
    for (let page = 0; ; page++) {
      const rows = await loadPage(month, page);
      result.push(...rows.filter(person => order.has(`${person.birth_month}-${person.birth_day}`)));
      if (rows.length < 100) break;
    }
  }
  return result.sort((a, b) => order.get(`${a.birth_month}-${a.birth_day}`)! - order.get(`${b.birth_month}-${b.birth_day}`)! || a.full_name.localeCompare(b.full_name, "pt-BR"));
}

/** Read every page before filtering today's shared birthdays (Brasília date). */
export async function loadDailyBirthdays(today:string,loadPage:(month:number,page:number)=>Promise<Birthday[]>) {
 const month=Number(today.slice(5,7)),day=Number(today.slice(8,10)),result:Birthday[]=[];
 for(let page=0;;page++) {
  const rows=await loadPage(month,page);
  result.push(...rows.filter(person=>person.birth_month===month&&person.birth_day===day));
  if(rows.length<100)break;
 }
 return result.sort((a,b)=>a.full_name.localeCompare(b.full_name,"pt-BR"));
}
