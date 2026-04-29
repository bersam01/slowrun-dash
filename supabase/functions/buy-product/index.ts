// buy-product: débite le wallet et crée un product_purchase
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) return json({ error: "Missing config" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const productId = String(body?.product_id ?? "").trim();
    const quantity = Math.max(1, Math.min(100, Number(body?.quantity ?? 1) | 0));
    if (!productId) return json({ error: "product_id requis" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Vérifier user approuvé
    const { data: profile } = await admin.from("profiles").select("status").eq("id", userId).maybeSingle();
    if (profile?.status !== "approved") return json({ error: "Compte non approuvé" }, 403);

    // Charger produit
    const { data: product } = await admin
      .from("products")
      .select("id, name, price_eur, active, stock")
      .eq("id", productId)
      .maybeSingle();
    if (!product || !product.active) return json({ error: "Produit indisponible" }, 404);
    if (product.stock !== null && product.stock !== undefined && product.stock < quantity) {
      return json({ error: "Stock insuffisant" }, 400);
    }

    const total = +(Number(product.price_eur) * quantity).toFixed(2);

    // Charger wallet
    const { data: wallet } = await admin
      .from("wallets")
      .select("balance, total_spent")
      .eq("user_id", userId)
      .maybeSingle();
    const balance = Number(wallet?.balance ?? 0);
    if (balance < total) return json({ error: `Solde insuffisant (${balance.toFixed(2)} €, requis ${total.toFixed(2)} €)` }, 400);

    const newBalance = +(balance - total).toFixed(2);
    const newSpent = +(Number(wallet?.total_spent ?? 0) + total).toFixed(2);

    const { error: updErr } = await admin
      .from("wallets")
      .update({ balance: newBalance, total_spent: newSpent, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (updErr) return json({ error: updErr.message }, 500);

    const { error: insErr, data: purchase } = await admin
      .from("product_purchases")
      .insert({
        user_id: userId,
        product_id: product.id,
        product_name: product.name,
        price_eur: product.price_eur,
        quantity,
        total_eur: total,
        status: "paid",
      })
      .select()
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    // Décrémenter stock si géré
    if (product.stock !== null && product.stock !== undefined) {
      await admin.from("products").update({ stock: product.stock - quantity }).eq("id", product.id);
    }

    return json({ ok: true, purchase, new_balance: newBalance });
  } catch (e) {
    console.error("buy-product", e);
    return json({ error: (e as Error).message }, 500);
  }
});
