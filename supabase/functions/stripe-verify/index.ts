import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ status: session.payment_status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (session.metadata?.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Session ne correspond pas" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Idempotence: vérifie si déjà crédité
    const { data: existing } = await admin
      .from("credit_requests")
      .select("id")
      .eq("stripe_session_id", session_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ status: "already_credited" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amount = Number(session.metadata?.amount_eur ?? 0);
    if (amount <= 0) {
      return new Response(JSON.stringify({ error: "Montant invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trace + crédit wallet
    await admin.from("credit_requests").insert({
      user_id: userId,
      amount,
      status: "approved",
      stripe_session_id: session_id,
    });

    const { data: wallet } = await admin
      .from("wallets")
      .select("balance, total_credited")
      .eq("user_id", userId)
      .maybeSingle();

    const new_balance = +(Number(wallet?.balance ?? 0) + amount).toFixed(2);
    const new_credited = +(Number(wallet?.total_credited ?? 0) + amount).toFixed(2);

    if (wallet) {
      await admin
        .from("wallets")
        .update({
          balance: new_balance,
          total_credited: new_credited,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    } else {
      await admin.from("wallets").insert({
        user_id: userId,
        balance: new_balance,
        total_credited: new_credited,
        total_spent: 0,
      });
    }

    return new Response(JSON.stringify({ status: "credited", amount, new_balance }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stripe-verify error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
