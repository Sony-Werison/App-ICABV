import { z } from "zod";
import pt from "./pt-BR.json";
export { pt };
export const roles = [
  "visitor",
  "member",
  "volunteer",
  "leader",
  "secretary",
  "treasurer",
  "elder",
  "admin",
] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = pt.roles;
export const canManagePeople = (assigned: readonly Role[]) =>
  assigned.some((r) => r === "secretary" || r === "admin");
export const canSeeFinance = (assigned: readonly Role[]) =>
  assigned.some((r) => ["treasurer", "elder", "admin"].includes(r));
export const emailSchema = z.string().trim().email();
export const passwordSchema = z.string().min(12).max(128);
export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
});
export const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/);
export const consentVersion = "2026-10-20.v1";
export const consentSchema = z.object({
  terms: z.literal(true),
  sensitive: z.literal(true),
  adult: z.literal(true),
  analytics: z.boolean(),
});
export const theme = {
  brand: "#991B1B",
  ebd: "#8B5CF6",
  light: {
    background: "#F8FAFC",
    surface: "#FFFFFF",
    text: "#111827",
    muted: "#475569",
    border: "#CBD5E1",
  },
  dark: {
    background: "#09090B",
    surface: "#18181B",
    text: "#FAFAFA",
    muted: "#A1A1AA",
    border: "#52525B",
  },
};
export type Person = {
  id: string;
  full_name: string;
  membership_status: string;
};
export type Profile = { person: Person; roles: Role[]; onboarded: boolean };
