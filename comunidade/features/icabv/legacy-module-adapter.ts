import { normalizeSong } from "./worship-model";
type Row = Record<string, unknown>;
export type ImportPerson = {
  legacy_id: string;
  name: string;
  email: string;
  phone: string;
  person_id: string;
  roles?: string[];
};
export type ModuleBundle = {
  people: ImportPerson[];
  songs: Row[];
  services: Row[];
  classes: Row[];
  modules: Row[];
  enrollments: Row[];
  guardians: Row[];
  activities: Row[];
  recordings: Row[];
  history: Row[];
  attendance: Row[];
};
const object = (v: unknown): Row =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
const list = (v: unknown): Row[] => (Array.isArray(v) ? v.map(object) : []);
const text = (v: unknown) =>
  v === undefined || v === null
    ? ""
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
function date(v: unknown, fallback = "2000-01-01T12:00:00Z") {
  const r = object(v);
  const raw =
    typeof v === "string"
      ? v
      : typeof r.seconds === "number"
        ? new Date(r.seconds * 1000).toISOString()
        : typeof r._seconds === "number"
          ? new Date(r._seconds * 1000).toISOString()
          : fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw Error("Há uma data inválida no backup.");
  return d.toISOString();
}
const clampGrade = (v: unknown) =>
  v === undefined || v === null || v === ""
    ? null
    : Math.max(0, Math.min(10, Number(v) || 0));
function arrayOfStrings(v: unknown) {
  return Array.isArray(v)
    ? (v.filter((x) => typeof x === "string") as string[])
    : [];
}
const idOf = (v: Row, index: number) => text(v.id ?? v.person_id ?? index);
export function adaptModuleBackup(
  module: "louvor" | "ebd",
  raw: unknown,
): ModuleBundle {
  const root = object(raw),
    out: ModuleBundle = {
      people: [],
      songs: [],
      services: [],
      classes: [],
      modules: [],
      enrollments: [],
      guardians: [],
      activities: [],
      recordings: [],
      history: [],
      attendance: [],
    };
  if (module === "louvor") {
    const people = list(root.members),
      songs = list(root.songs),
      services = list(root.services),
      monthly = list(root.monthlySchedules ?? root.monthly_schedules);
    if (!songs.length && !people.length && !services.length && !monthly.length)
      throw Error("O arquivo não contém um backup do Louvor.");
    out.people = people.map((p, i) => ({
      legacy_id: text(p.person_id ?? p.id ?? i),
      name: text(p.full_name ?? p.name),
      email: text(p.email),
      phone: text(p.phone),
      person_id: "",
      roles: arrayOfStrings(p.roles),
    }));
    out.songs = songs.map((s, i) => ({
      ...normalizeSong(s),
      legacy_id: idOf(s, i),
      legacy_total: Math.max(
        0,
        Number(s.legacy_total ?? s.timesPlayedTotal) || 0,
      ),
      legacy_quarterly: Math.max(
        0,
        Number(s.legacy_quarterly ?? s.timesPlayedQuarterly) || 0,
      ),
    }));
    const knownPeople = new Set(out.people.map((p) => p.legacy_id)),
      knownSongs = new Set(out.songs.map((s) => text(s.legacy_id)));
    const assignments = (v: unknown) =>
      Object.fromEntries(
        Object.entries(object(v)).map(([key, value]) => [
          key,
          arrayOfStrings(value).filter((id) => knownPeople.has(id)),
        ]),
      );
    out.services = services.map((s, i) => ({
      legacy_id: idOf(s, i),
      title: text(s.title ?? s.name) || "Culto importado",
      starts_at: date(s.starts_at ?? s.date),
      period: text(s.period) || "outro",
      assignments: assignments(s.assignments ?? s.team),
      playlist: arrayOfStrings(s.playlist).filter((id) => knownSongs.has(id)),
      featured: !!(s.featured ?? s.isFeatured),
      status: ["planned", "completed", "canceled"].includes(text(s.status))
        ? s.status
        : "planned",
    }));
    for (const [i, s] of monthly.entries())
      for (const period of ["manha", "noite"]) {
        const starts =
          date(s.date).slice(0, 10) +
          `T${period === "manha" ? "09" : "19"}:00:00-03:00`;
        out.services.push({
          legacy_id: idOf(s, i) + ":" + period,
          title:
            text(s["name_" + period]) ||
            "Culto de " + (period === "manha" ? "manhã" : "noite"),
          starts_at: starts,
          period: period === "manha" ? "manhã" : "noite",
          assignments: assignments(
            Object.fromEntries(
              Object.entries(object(s.assignments))
                .filter(([key]) => key.toLowerCase().includes(period))
                .map(([key, v]) => [
                  key
                    .replace(/[_-]?(manha|noite)/gi, "")
                    .replace(/abertura/i, "Abertura")
                    .replace(/pregacao/i, "Pregação")
                    .replace(/multimidia/i, "Multimídia"),
                  v,
                ]),
            ),
          ),
          playlist: arrayOfStrings(s["playlist_" + period]).filter((id) =>
            knownSongs.has(id),
          ),
          featured: !!s.isFeatured,
          status: "planned",
        });
      }
  } else if (Array.isArray(root.ebd_classes)) {
    out.attendance = list(root.ebd_attendance).map((a) => ({
      ...a,
      legacy_id: a.id,
      class_legacy_id: a.class_id,
      person_legacy_id: a.person_id,
    }));
    out.people = list(root.people).map((p, i) => ({
      legacy_id: idOf(p, i),
      name: text(p.full_name ?? p.name),
      email: "",
      phone: "",
      person_id: "",
    }));
    if (
      !out.people.length &&
      (list(root.ebd_class_members).length || list(root.ebd_submissions).length)
    )
      throw Error(
        "O backup não inclui os nomes das pessoas. Exporte novamente pelo app atualizado.",
      );
    out.classes = list(root.ebd_classes).map((c) => ({
      ...c,
      legacy_id: c.id,
    }));
    out.modules = list(root.ebd_modules).map((m) => ({
      ...m,
      legacy_id: m.id,
      class_legacy_id: m.class_id,
    }));
    out.enrollments = list(root.ebd_class_members).map((m) => ({
      ...m,
      person_legacy_id: m.person_id,
      class_legacy_id: m.class_id,
      module_legacy_id: m.module_id,
      next_module_legacy_id: m.next_module_id,
    }));
    out.guardians = list(root.ebd_guardians).map((g) => ({
      student_legacy_id: g.student_id,
      guardian_legacy_id: g.guardian_id,
    }));
    out.activities = list(root.ebd_activities).map((a) => ({
      ...a,
      legacy_id: a.id,
      module_legacy_id: a.module_id,
      answer_key: object(
        list(root.ebd_activity_keys).find((k) => k.activity_id === a.id)
          ?.answers,
      ),
    }));
    out.recordings = list(root.ebd_recordings).map((r) => ({
      ...r,
      legacy_id: r.id,
      class_legacy_id: r.class_id,
    }));
    const oldHistory = list(root.ebd_legacy_history).map((h) => ({
      ...h,
      legacy_id: h.id,
      class_legacy_id: h.class_id,
      person_legacy_id: h.person_id,
    }));
    const converted = list(root.ebd_submissions).map((s) => {
      const a = list(root.ebd_activities).find((a) => a.id === s.activity_id),
        m = list(root.ebd_modules).find((m) => m.id === a?.module_id);
      return {
        legacy_id: s.id,
        class_legacy_id: m?.class_id,
        person_legacy_id: s.person_id,
        module_title: text(m?.title),
        title: text(a?.title) || "Atividade importada",
        kind: text(a?.kind),
        question: JSON.stringify(a?.questions ?? []),
        answer: JSON.stringify(s.answers ?? {}),
        score: clampGrade(s.score),
        status: s.status,
        teacher_comment: s.teacher_comment,
        student_reply: s.student_reply,
        created_at: date(s.created_at),
      };
    });
    out.history = [...oldHistory, ...converted];
  } else {
    const profiles = list(root.profiles),
      curriculum = object(root.curriculum),
      sourceClasses = list(root.classes);
    if (!profiles.length && !Object.keys(curriculum).length)
      throw Error("O arquivo não contém um backup do Portal EBD.");
    out.people = profiles.map((p, i) => ({
      legacy_id: idOf(p, i),
      name: text(p.name) || "Pessoa importada",
      email: text(p.email),
      phone: text(p.phone ?? p.whatsapp),
      person_id: "",
    }));
    const defaultClass = "legacy-ebd",
      classFor = (p: Row) => text(p.classId ?? p.class_id) || defaultClass;
    out.classes = sourceClasses.map((c, i) => ({
      legacy_id: idOf(c, i),
      name: text(c.name) || "Turma EBD",
      kind: ["standard", "teen", "youth"].includes(text(c.type))
        ? c.type
        : "youth",
      criteria: list(c.gradingCriteria)
        .map((k) => text(k.label))
        .filter(Boolean),
      include_saturday: !!c.includeSaturday,
      report_style: c.reportStyle === "grades" ? "grades" : "marking",
    }));
    const known = new Set(out.classes.map((c) => text(c.legacy_id)));
    for (const p of profiles) {
      const id = classFor(p);
      if (!known.has(id)) {
        out.classes.push({
          legacy_id: id,
          name:
            id === defaultClass
              ? "EBD · Acervo importado"
              : "Turma EBD · " + id,
          kind: "youth",
          criteria: ["Presença", "Bíblia", "Atividade"],
          include_saturday: false,
          report_style: "marking",
        });
        known.add(id);
      }
    }
    for (const c of out.classes) {
      if (!Array.isArray(c.criteria) || !c.criteria.length)
        c.criteria = ["Presença", "Atividade"];
      for (const [key, value] of Object.entries(curriculum)) {
        const m = object(value),
          mid = text(c.legacy_id) + ":" + key;
        out.modules.push({
          legacy_id: mid,
          class_legacy_id: c.legacy_id,
          title: text(m.title) || "Módulo " + key,
          description: text(m.description),
          position: Number(key) || 0,
          daily_limit: Math.max(
            0,
            Math.min(100, Number(m.dailyActivityLimit) || 0),
          ),
          weekly_bible_limit: Math.max(
            0,
            Math.min(100, Number(m.weeklyBibleLimit) || 0),
          ),
          weekly_video_limit: Math.max(
            0,
            Math.min(100, Number(m.weeklyVideoLimit) || 0),
          ),
        });
        for (const [i, a] of list(m.schedule).entries()) {
          const options = Array.isArray(a.options)
              ? a.options.map((o) =>
                  typeof o === "string"
                    ? o
                    : text(object(o).text ?? object(o).label),
                )
              : [],
            question = text(a.question),
            kind = ["bible", "video", "quiz", "video_bible", "manual"].includes(
              text(a.type),
            )
              ? text(a.type)
              : "manual";
          const questions = Array.isArray(a.questions)
            ? list(a.questions).map((q) => ({
                prompt: text(q.question ?? q.prompt),
                type: "text",
              }))
            : question
              ? [
                  {
                    prompt: question,
                    type: options.length >= 2 ? "choice" : "text",
                    ...(options.length >= 2 ? { options } : {}),
                  },
                ]
              : [];
          out.activities.push({
            legacy_id: mid + ":" + i,
            module_legacy_id: mid,
            title: (
              text(a.title ?? a.contentLabel) || "Atividade " + (i + 1)
            ).slice(0, 180),
            kind,
            body: text(a.content ?? a.description),
            passages:
              text(a.book) +
              (Array.isArray(a.chapters)
                ? " " + a.chapters.map((n) => Number(n) + 1).join(", ")
                : ""),
            video_url: a.videoId
              ? "https://www.youtube.com/watch?v=" +
                encodeURIComponent(text(a.videoId))
              : "",
            questions,
            answer_key:
              options.length >= 2
                ? {
                    0: Math.max(
                      0,
                      Math.min(options.length - 1, Number(a.correct) || 0),
                    ),
                  }
                : {},
            available_on: date(a.date ?? undefined).slice(0, 10),
            minimum_seconds: 0,
          });
        }
      }
    }
    for (const [i, p] of profiles.entries()) {
      const pid = idOf(p, i),
        cls = classFor(p),
        role = text(p.role);
      if (role === "student" || role === "teacher")
        out.enrollments.push({
          person_legacy_id: pid,
          class_legacy_id: cls,
          role,
          module_legacy_id:
            p.moduleId !== undefined && curriculum[text(p.moduleId)]
              ? cls + ":" + p.moduleId
              : null,
          next_module_legacy_id:
            p.nextModuleId !== undefined && curriculum[text(p.nextModuleId)]
              ? cls + ":" + p.nextModuleId
              : null,
          reading_group_size: Math.max(
            1,
            Math.min(100, Number(p.bibleReadingGroupSize) || 1),
          ),
        });
      for (const student of arrayOfStrings(p.linked_student_ids))
        if (out.people.some((p) => p.legacy_id === student))
          out.guardians.push({
            student_legacy_id: student,
            guardian_legacy_id: pid,
          });
    }
    out.history = list(root.submissions).map((s, i) => {
      const p = profiles.find((p, n) => idOf(p, n) === s.user_id);
      if (!p)
        throw Error("O histórico contém aluno ausente no cadastro do backup.");
      return {
        legacy_id: idOf(s, i),
        person_legacy_id: text(s.user_id),
        class_legacy_id: classFor(p),
        module_title: text(object(curriculum[text(s.moduleId)]).title),
        title: text(s.contentLabel) || "Atividade importada",
        kind: text(s.type) || "manual",
        question: text(s.question),
        answer: text(s.answer),
        correct_answer: text(s.correctAnswer),
        score: clampGrade(s.score),
        status: text(s.status),
        teacher_comment: text(s.teacherComment),
        student_reply: text(s.studentReply),
        created_at: date(s.createdAt),
      };
    });
    out.recordings = list(root.classRecordings)
      .map((r, i) => ({
        legacy_id: idOf(r, i),
        class_legacy_id:
          text(r.classId) || text(out.classes[0]?.legacy_id) || defaultClass,
        title: text(r.title) || "Gravação importada",
        lesson_date: date(r.date).slice(0, 10),
        teacher: text(r.teacher),
        url: text(r.link),
      }))
      .filter((r) => /^https:\/\//.test(r.url));
  }
  const ids = new Set<string>();
  for (const p of out.people) {
    if (ids.has(p.legacy_id)) throw Error("Há pessoas duplicadas no arquivo.");
    ids.add(p.legacy_id);
  }
  return out;
}
