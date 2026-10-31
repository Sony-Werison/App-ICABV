import { createDemoClient } from "./demo-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { configureOfflineSession, offlineFetch } from "./offline-transport";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const realClient =
  url && key
    ? createClient(url, key, {
        global: { fetch: offlineFetch(url, key) },
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
configureOfflineSession(async () => {
  const result = await realClient?.auth.getSession();
  const session = result?.data.session;
  return session ? { user: session.user.id, token: session.access_token } : null;
});

const isDemo = () =>
  process.env.NODE_ENV === "development" &&
  typeof window !== "undefined" &&
  location.pathname === "/demo";
let demoClient: SupabaseClient | undefined;
function selected() {
  if (isDemo()) return (demoClient ??= createDemoClient());
  return realClient;
}
// Select per access: leaving /demo always restores the real authenticated client.
export const supabase: SupabaseClient | null =
  realClient || isDemo()
    ? new Proxy({} as SupabaseClient, {
        get(_target, key) {
          return Reflect.get(selected() ?? {}, key);
        },
      })
    : null;
