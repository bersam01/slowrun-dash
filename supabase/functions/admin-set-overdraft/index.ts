// admin-set-overdraft: définit overdraft_limit_eur pour un wallet (service role, bypass RLS)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    const callerId = userData?.user?.id as string | undefined;
    if (!callerId) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: caller } = await admin.from("profiles").select("is_admin").eq("id", callerId).maybeSingle();
    if (!caller?.is_admin) return json({ error: "Admin requis" }, 403);

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.user_id ?? "").trim();
    const value = Number(body?.overdraft_limit_eur);
    if (!userId) return json({ error: "user_id requis" }, 400);
    if (!Number.isFinite(value) || value < 0) return json({ error: "overdraft_limit_eur invalide" }, 400);

    // Upsert: si wallet n'existe pas encore, on le crée
    const { data: existing } = await admin.from("wallets").select("user_id").eq("user_id", userId).maybeSingle();
    if (existing) {
      const { error } = await admin
        .from("wallets")
        .update({ overdraft_limit_eur: value, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
    } else {
      const { error } = await admin
        .from("wallets")
        .insert({ user_id: userId, overdraft_limit_eur: value, balance: 0, total_credited: 0, total_spent: 0 });
      if (error) return json({ error: error.message }, 500);
    }
    return json({ ok: true, user_id: userId, overdraft_limit_eur: value });
  } catch (e) {
    console.error("admin-set-overdraft", e);
    return json({ error: (e as Error).message }, 500);
  }
});
