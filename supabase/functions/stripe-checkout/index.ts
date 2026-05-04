// redeploy: stripe-checkout v4 with payment-return verification fallback
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !stripeKey) {
      return json({ error: "Missing server configuration" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const userId = claims.claims.sub as string;
    const userEmail = (claims.claims.email as string) ?? undefined;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (sessionId) {
      if (!supabaseServiceRoleKey) return json({ error: "Missing server configuration" }, 500);

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const sessionUserId = session.metadata?.user_id;
      const amount = Number(session.metadata?.amount_eur ?? ((session.amount_total ?? 0) / 100));

      if (!sessionUserId || sessionUserId !== userId) return json({ error: "Session de paiement invalide" }, 403);
      if (session.payment_status !== "paid" || session.status !== "complete") {
        return json({ error: "Paiement non confirmé" }, 409);
      }
      if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Montant invalide" }, 400);

      const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

      const { data: existing } = await admin
        .from("payments")
        .select("id")
        .eq("provider_ref", session.id)
        .maybeSingle();

      if (existing) {
        return json({ ok: true, duplicate: true, credited: false, session_id: session.id });
      }

      const { data: wallet } = await admin
        .from("wallets")
        .select("balance, total_credited, total_spent")
        .eq("user_id", userId)
        .maybeSingle();

      const currentBalance = Number(wallet?.balance ?? 0);
      const totalCredited = Number(wallet?.total_credited ?? 0);
      const newBalance = +(currentBalance + amount).toFixed(2);
      const newCredited = +(totalCredited + amount).toFixed(2);

      if (wallet) {
        const { error } = await admin
          .from("wallets")
          .update({
            balance: newBalance,
            total_credited: newCredited,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await admin.from("wallets").insert({
          user_id: userId,
          balance: newBalance,
          total_credited: newCredited,
          total_spent: 0,
        });
        if (error) return json({ error: error.message }, 500);
      }

      const { error: paymentError } = await admin.from("payments").insert({
        user_id: userId,
        amount,
        provider: "stripe",
        provider_ref: session.id,
        status: "paid",
        note: "Stripe checkout verified on return",
      });
      if (paymentError) return json({ error: paymentError.message }, 500);

      // Notification Discord admin
      const discordWebhook = Deno.env.get("DISCORD_ADMIN_WEBHOOK_URL");
      if (discordWebhook) {
        try {
          const { data: profile } = await admin
            .from("profiles")
            .select("display_name, discord_id")
            .eq("id", userId)
            .maybeSingle();
          await fetch(discordWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              embeds: [{
                title: "💰 Nouveau topup (Stripe)",
                color: 0x22c55e,
                fields: [
                  { name: "Utilisateur", value: profile?.display_name ?? "—", inline: true },
                  { name: "Discord ID", value: profile?.discord_id ?? "—", inline: true },
                  { name: "Montant", value: `**${amount.toFixed(2)} €**`, inline: true },
                  { name: "Nouveau solde", value: `${newBalance.toFixed(2)} €`, inline: true },
                  { name: "Session", value: session.id, inline: false },
                ],
                timestamp: new Date().toISOString(),
              }],
            }),
          });
        } catch (e) {
          console.error("Discord notify failed", e);
        }
      }

      return json({ ok: true, credited: true, session_id: session.id, new_balance: newBalance, amount });
    }

    const eur = Number(body?.amount);
    if (!Number.isFinite(eur) || eur < 5 || eur > 5000) {
      return json({ error: "Montant invalide (5-5000 €)" }, 400);
    }

    const origin = req.headers.get("origin") ?? "https://slowrun-dash.lovable.app";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: userEmail,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: `Crédit SlowRun (${eur} quotas)` },
            unit_amount: Math.round(eur * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/credit?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/credit?status=cancel`,
      metadata: {
        user_id: userId,
        amount_eur: String(eur),
      },
    });

    return json({ url: session.url, id: session.id });
  } catch (e) {
    console.error("stripe-checkout error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
