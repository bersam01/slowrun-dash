import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
      return json({ error: "Missing server configuration" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      console.error("super-api auth failed", userErr);
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body?.user_id ?? "").trim();
    const overdraft = Number(body?.overdraft_limit_eur);

    if (!targetUserId) return json({ error: "user_id requis" }, 400);
    if (!Number.isFinite(overdraft) || overdraft < 0) {
      return json({ error: "overdraft_limit_eur invalide" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: caller, error: callerErr } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", callerId)
      .maybeSingle();
    if (callerErr) {
      console.error("super-api caller lookup failed", callerErr);
      return json({ error: callerErr.message, details: callerErr.details, code: callerErr.code }, 500);
    }
    if (!caller?.is_admin) return json({ error: "Admin requis" }, 403);

    const { data: wallet, error: walletErr } = await admin
      .from("wallets")
      .select("user_id")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (walletErr) {
      console.error("super-api wallet lookup failed", walletErr);
      return json({ error: walletErr.message, details: walletErr.details, code: walletErr.code }, 500);
    }

    if (wallet) {
      const { error: updateErr } = await admin
        .from("wallets")
        .update({ overdraft_limit_eur: overdraft, updated_at: new Date().toISOString() })
        .eq("user_id", targetUserId);
      if (updateErr) {
        console.error("super-api update wallet failed", updateErr);
        return json({ error: updateErr.message, details: updateErr.details, hint: updateErr.hint, code: updateErr.code }, 500);
      }
    } else {
      const { error: insertErr } = await admin.from("wallets").insert({
        user_id: targetUserId,
        overdraft_limit_eur: overdraft,
        balance: 0,
        total_credited: 0,
        total_spent: 0,
      });
      if (insertErr) {
        console.error("super-api insert wallet failed", insertErr);
        return json({ error: insertErr.message, details: insertErr.details, hint: insertErr.hint, code: insertErr.code }, 500);
      }
    }

    return json({ ok: true, user_id: targetUserId, overdraft_limit_eur: overdraft });
  } catch (error) {
    console.error("super-api error", error);
    return json({ error: (error as Error).message }, 500);
  }
});