// admin-delete-purchase: supprime un panier (purchases) et recrédite le wallet
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

    // Vérifier admin
    const { data: caller } = await admin.from("profiles").select("is_admin").eq("id", callerId).maybeSingle();
    if (!caller?.is_admin) return json({ error: "Admin requis" }, 403);

    const body = await req.json().catch(() => ({}));
    const purchaseId = String(body?.purchase_id ?? "").trim();
    const kind = String(body?.kind ?? "purchase"); // "purchase" | "product"
    const refund = body?.refund !== false; // défaut: true

    if (!purchaseId) return json({ error: "purchase_id requis" }, 400);

    if (kind === "product") {
      const { data: pp } = await admin
        .from("product_purchases")
        .select("id, user_id, total_eur")
        .eq("id", purchaseId)
        .maybeSingle();
      if (!pp) return json({ error: "Achat introuvable" }, 404);

      if (refund) {
        const { data: w } = await admin.from("wallets").select("balance, total_spent").eq("user_id", pp.user_id).maybeSingle();
        const newBal = +(Number(w?.balance ?? 0) + Number(pp.total_eur)).toFixed(2);
        const newSpent = +(Math.max(0, Number(w?.total_spent ?? 0) - Number(pp.total_eur))).toFixed(2);
        await admin.from("wallets").update({ balance: newBal, total_spent: newSpent, updated_at: new Date().toISOString() }).eq("user_id", pp.user_id);
      }
      const { error } = await admin.from("product_purchases").delete().eq("id", purchaseId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, refunded: refund });
    }

    const { data: p } = await admin
      .from("purchases")
      .select("id, user_id, price_quota")
      .eq("id", purchaseId)
      .maybeSingle();
    if (!p) return json({ error: "Panier introuvable" }, 404);

    if (refund) {
      const { data: w } = await admin.from("wallets").select("balance, total_spent").eq("user_id", p.user_id).maybeSingle();
      const newBal = +(Number(w?.balance ?? 0) + Number(p.price_quota)).toFixed(2);
      const newSpent = +(Math.max(0, Number(w?.total_spent ?? 0) - Number(p.price_quota))).toFixed(2);
      await admin.from("wallets").update({ balance: newBal, total_spent: newSpent, updated_at: new Date().toISOString() }).eq("user_id", p.user_id);
    }

    const { error } = await admin.from("purchases").delete().eq("id", purchaseId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, refunded: refund });
  } catch (e) {
    console.error("admin-delete-purchase", e);
    return json({ error: (e as Error).message }, 500);
  }
});
