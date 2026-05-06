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

const CANONICAL_ORIGIN = "https://slowrun.app";

function getCheckoutOrigin(req: Request) {
  const origin = req.headers.get("origin")?.trim();
  if (!origin) return CANONICAL_ORIGIN;

  try {
    const url = new URL(origin);
    if (url.hostname === "slowrun.app" || url.hostname === "www.slowrun.app" || url.hostname === "dashboard.slowrun.app") {
      return CANONICAL_ORIGIN;
    }
    return origin;
  } catch {
    return CANONICAL_ORIGIN;
  }
}

async function notifyDiscordTopup(admin: ReturnType<typeof createClient>, userId: string, amount: number, newBalance: number, sessionId: string) {
  const discordWebhook = Deno.env.get("DISCORD_ADMIN_WEBHOOK_URL");
  if (!discordWebhook) return;

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
            { name: "Session", value: sessionId, inline: false },
          ],
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (e) {
    console.error("Discord notify failed", e);
  }
}

async function applyStripeCredit(admin: ReturnType<typeof createClient>, userId: string, sessionId: string, amount: number, note: string) {
  const { data: existingPayment } = await admin
    .from("payments")
    .select("id, status")
    .eq("provider_ref", sessionId)
    .maybeSingle();

  if (existingPayment?.status === "paid") {
    const { data: wallet } = await admin
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    return {
      ok: true,
      duplicate: true,
      credited: false,
      session_id: sessionId,
      amount,
      new_balance: Number(wallet?.balance ?? 0),
    };
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
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("wallets").insert({
      user_id: userId,
      balance: newBalance,
      total_credited: newCredited,
      total_spent: 0,
    });
    if (error) throw new Error(error.message);
  }

  if (existingPayment?.id) {
    const { error } = await admin
      .from("payments")
      .update({
        user_id: userId,
        amount,
        provider: "stripe",
        status: "paid",
        note,
      })
      .eq("id", existingPayment.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("payments").insert({
      user_id: userId,
      amount,
      provider: "stripe",
      provider_ref: sessionId,
      status: "paid",
      note,
    });
    if (error) throw new Error(error.message);
  }

  await notifyDiscordTopup(admin, userId, amount, newBalance, sessionId);

  return {
    ok: true,
    duplicate: false,
    credited: true,
    session_id: sessionId,
    amount,
    new_balance: newBalance,
  };
}

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
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      console.error("stripe-checkout auth failed", userErr);
      return json({ error: "Unauthorized" }, 401);
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email ?? undefined;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    const shouldReconcile = body?.reconcile === true;

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
      return json(await applyStripeCredit(admin, userId, session.id, amount, "Stripe checkout verified on return"));
    }

    if (shouldReconcile) {
      if (!supabaseServiceRoleKey) return json({ error: "Missing server configuration" }, 500);

      const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
      const since = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
      const sessions = await stripe.checkout.sessions.list({ limit: 100, created: { gte: since } });
      const matchingSessions = sessions.data.filter((session) =>
        session.metadata?.user_id === userId &&
        session.payment_status === "paid" &&
        session.status === "complete",
      );

      const repaired: Array<{ session_id: string; amount: number; new_balance: number }> = [];
      for (const session of matchingSessions) {
        const amount = Number(session.metadata?.amount_eur ?? ((session.amount_total ?? 0) / 100));
        if (!Number.isFinite(amount) || amount <= 0) continue;

        const result = await applyStripeCredit(admin, userId, session.id, amount, "Stripe checkout reconciled automatically");
        if (result.credited) {
          repaired.push({
            session_id: session.id,
            amount,
            new_balance: Number(result.new_balance ?? 0),
          });
        }
      }

      return json({
        ok: true,
        repaired_count: repaired.length,
        repaired_sessions: repaired,
        new_balance: repaired.at(-1)?.new_balance ?? null,
      });
    }

    const eur = Number(body?.amount);
    if (!Number.isFinite(eur) || eur < 5 || eur > 5000) {
      return json({ error: "Montant invalide (5-5000 €)" }, 400);
    }

    const origin = getCheckoutOrigin(req);

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

    if (supabaseServiceRoleKey) {
      const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: existingPending } = await admin
        .from("payments")
        .select("id")
        .eq("provider_ref", session.id)
        .maybeSingle();

      if (!existingPending) {
        const { error: pendingError } = await admin.from("payments").insert({
          user_id: userId,
          amount: eur,
          provider: "stripe",
          provider_ref: session.id,
          status: "pending",
          note: "Stripe checkout session created",
        });
        if (pendingError) {
          console.error("Unable to create pending Stripe payment", pendingError);
        }
      }
    }

    return json({ url: session.url, id: session.id });
  } catch (e) {
    console.error("stripe-checkout error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
