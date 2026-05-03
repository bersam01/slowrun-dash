// stripe-webhook: reçoit les events Stripe et crédite automatiquement (redeploy v3)
// Doit être déployé avec verify_jwt = false (Stripe n'envoie pas de JWT)
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const discordWebhook = Deno.env.get("DISCORD_ADMIN_WEBHOOK_URL");

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRole) {
    console.error("Missing env vars");
    return new Response("Missing config", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await req.text();
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Signature verification failed:", (err as Error).message);
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRole);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const amountStr = session.metadata?.amount_eur;
    const amount = Number(amountStr);

    if (!userId || !Number.isFinite(amount) || amount <= 0) {
      console.error("Invalid metadata", session.metadata);
      return new Response("Invalid metadata", { status: 400 });
    }

    // Idempotence : éviter de créditer 2x le même session_id
    const { data: existing } = await admin
      .from("payments")
      .select("id")
      .eq("provider_ref", session.id)
      .maybeSingle();

    if (existing) {
      console.log("Already processed:", session.id);
       return new Response(JSON.stringify({ received: true, duplicate: true }), {
         headers: jsonHeaders,
       });
    }

    // Crédite le wallet
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
      if (error) {
        console.error("Wallet update failed", error);
        return new Response("DB error", { status: 500 });
      }
    } else {
      const { error } = await admin.from("wallets").insert({
        user_id: userId,
        balance: newBalance,
        total_credited: newCredited,
        total_spent: 0,
      });
      if (error) {
        console.error("Wallet insert failed", error);
        return new Response("DB error", { status: 500 });
      }
    }

    // Log payment
    await admin.from("payments").insert({
      user_id: userId,
      amount,
      provider: "stripe",
      provider_ref: session.id,
      status: "paid",
      note: "Stripe checkout completed",
    });

    // Notification Discord admin
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
            embeds: [
              {
                title: "💰 Nouveau topup",
                color: 0x22c55e,
                fields: [
                  { name: "Utilisateur", value: profile?.display_name ?? "—", inline: true },
                  { name: "Discord ID", value: profile?.discord_id ?? "—", inline: true },
                  { name: "Montant", value: `**${amount.toFixed(2)} €**`, inline: true },
                  { name: "Nouveau solde", value: `${newBalance.toFixed(2)} €`, inline: true },
                  { name: "Session", value: session.id, inline: false },
                ],
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        });
      } catch (e) {
        console.error("Discord notify failed", e);
      }
    }

    console.log(`Credited ${amount}€ to ${userId}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: jsonHeaders,
  });
});
