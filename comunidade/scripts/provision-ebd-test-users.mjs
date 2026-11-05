import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the local Supabase project.");
}
const hostname = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
  throw new Error(`Refusing to create test accounts on non-local Supabase host: ${hostname}`);
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const manifestPath = new URL("../.ebd-test-users.json", import.meta.url);
let manifest = {};
try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const { data: classes, error: classError } = await supabase.from("ebd_classes")
  .select("id,name").eq("archived", false).order("name");
if (classError) throw classError;
if (!classes?.length) throw new Error("No active EBD classes found in the local database.");

async function ensureUser(schoolClass, role) {
  const slug = schoolClass.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 32) || "turma";
  const shortId = schoolClass.id.replaceAll("-", "").slice(0, 8);
  const email = `ebd.${role}.${slug}.${shortId}@example.test`;
  const fullName = `Teste ${role === "aluno" ? "Aluno" : "Professor"} · ${schoolClass.name}`;
  const previous = manifest[email];
  let userId = previous?.userId;
  let password = previous?.password;

  if (!userId) {
    const { data: page, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    const existing = page.users.find((user) => user.email === email);
    if (existing) {
      userId = existing.id;
      password ??= `${randomBytes(15).toString("base64url")}aA1!`;
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error) throw error;
    } else {
      password = `${randomBytes(15).toString("base64url")}aA1!`;
      const { data, error } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (error) throw error;
      userId = data.user.id;
    }
    manifest[email] = { userId, password, classId: schoolClass.id, className: schoolClass.name, role };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  }

  const { data: person, error: personError } = await supabase.from("persons")
    .select("id").eq("auth_user_id", userId).single();
  if (personError) throw personError;
  const { error: nameError } = await supabase.from("persons").update({ full_name: fullName }).eq("id", person.id);
  if (nameError) throw nameError;
  const { error: contactError } = await supabase.from("person_contacts")
    .upsert({ person_id: person.id, email }, { onConflict: "person_id" });
  if (contactError) throw contactError;
  const { error: enrollmentError } = await supabase.from("ebd_class_members")
    .upsert({ class_id: schoolClass.id, person_id: person.id, role: role === "aluno" ? "student" : "teacher" },
      { onConflict: "class_id,person_id" });
  if (enrollmentError) throw enrollmentError;
  return { email, password, role, className: schoolClass.name };
}

const credentials = [];
for (const schoolClass of classes) {
  for (const role of ["aluno", "professor"]) credentials.push(await ensureUser(schoolClass, role));
}
console.log("Usuários fictícios provisionados no Supabase local (senha guardada em comunidade/.ebd-test-users.json):");
console.table(credentials);
