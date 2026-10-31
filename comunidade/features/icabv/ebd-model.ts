export type EbdClass = {
  id: string;
  name: string;
  kind: string;
  criteria: string[];
  start_date: string;
  include_saturday: boolean;
  report_style: string;
  archived: boolean;
  whatsapp_template: string;
};
export type EbdMember = {
  person_id: string;
  full_name: string;
  role: "student" | "teacher" | "historical";
  module_id: string | null;
  next_module_id: string | null;
  reading_group_size: number;
};
export type EbdModule = {
  id: string;
  class_id: string;
  title: string;
  description: string;
  position: number;
  daily_limit?: number;
  weekly_bible_limit?: number;
  weekly_video_limit?: number;
  archived: boolean;
};
export type Question = {
  prompt: string;
  type: "text" | "choice";
  options?: string[];
};
export type Activity = {
  position?: number;
  id: string;
  module_id: string;
  title: string;
  kind: string;
  body: string;
  passages: string;
  video_url: string;
  questions: Question[];
  available_on: string;
  due_on: string | null;
  published: boolean;
  minimum_seconds: number;
};
export type Submission = {
  source?:"legacy";
  legacy_score?:number|null;
  legacy_scale?:number|null;
  id: string;
  activity_id: string;
  person_id: string;
  answers: Record<string, string | number>;
  status: string;
  score: number | null;
  teacher_comment: string;
  teacher_id: string | null;
  student_reply: string;
  created_at: string;
  graded_at: string | null;
};
export type Attendance = {
  id: string;
  class_id: string;
  person_id: string;
  lesson_date: string;
  present: boolean;
  criteria: Record<string, boolean>;
  score: number | null;
  note: string;
};
export type LessonSession = { id: string; class_id: string; lesson_date: string; teacher_id: string; topic: string };
export type Recording = {
  status?:"normal"|"canceled";
  justification?:string;
  id: string;
  class_id: string;
  title: string;
  lesson_date: string;
  teacher: string;
  url: string;
  published: boolean;
};
export type LegacyHistory = {
  activity_id?:string|null;
  teacher_id?:string|null;
  score_original?:number|null;
  score_scale?:number|null;
  id: string;
  class_id: string;
  person_id: string;
  module_title: string;
  title: string;
  kind: string;
  question: string;
  answer: string;
  score: number | null;
  status: string;
  teacher_comment: string;
  student_reply: string;
  created_at: string;
};
export function studentSummary(
  personId: string,
  submissions: Submission[],
  attendance: Attendance[],
  activities: Activity[],
  period = "",
) {
  const delivered = submissions.filter(
      (s) => s.person_id === personId && s.created_at.startsWith(period) && !["class_evaluation","sunday_presence","daily_grade","weekly_grade"].includes(activities.find(a=>a.id===s.activity_id)?.kind??""),
    ),
    lessons = attendance.filter(
      (a) => a.person_id === personId && a.lesson_date.startsWith(period),
    );
  const graded = delivered.filter((s) => s.score !== null),
    total = graded.reduce((sum, s) => sum + Number(s.score), 0);
  return {
    submitted: delivered.length,
    pending: delivered.filter((s) => s.status === "pending").length,
    average: graded.length ? total / graded.length : null,
    present: lessons.filter((a) => a.present).length,
    lessons: lessons.length,
    totalActivities: activities.filter(
      (a) => a.published && a.available_on.startsWith(period),
    ).length,
    lastActivity:
      delivered
        .map((s) => s.created_at)
        .sort()
        .at(-1) ?? null,
  };
}
