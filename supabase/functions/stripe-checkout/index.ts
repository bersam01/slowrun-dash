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

async function applyStripeCredit(admin: ReturnType<typeof createClient>, userId: string, sessionId: string, amount: number) {
  const { data: existingPayment } = await admin
    .from("payments")
    .select("id, status")
    .eq("stripe_session_id", sessionId)
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

  try {
    if (existingPayment?.id) {
      const { error } = await admin
        .from("payments")
        .update({
          user_id: userId,
          amount,
          provider: "stripe",
          status: "paid",
        })
        .eq("id", existingPayment.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("payments").insert({
        user_id: userId,
        amount,
        provider: "stripe",
        stripe_session_id: sessionId,
        status: "paid",
      });
      if (error) throw new Error(error.message);
    }
  } catch (error) {
    if (wallet) {
      const { error: rollbackError } = await admin
        .from("wallets")
        .update({
          balance: currentBalance,
          total_credited: totalCredited,
          total_spent: Number(wallet.total_spent ?? 0),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (rollbackError) console.error("stripe-checkout wallet rollback failed", rollbackError);
    } else {
      const { error: rollbackError } = await admin.from("wallets").delete().eq("user_id", userId);
      if (rollbackError) console.error("stripe-checkout wallet rollback failed", rollbackError);
    }
    throw error;
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

      if (!sessionUserId || sessionUserId !== userId) return json({ error: "Session de paiement invalide" }, 403);
      if (session.payment_status !== "paid" || session.status !== "complete") {
        return json({ error: "Paiement non confirmé" }, 409);
      }

      const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

      // Vérification achat produit (= pack de crédits stylé)
      if (session.metadata?.kind === "product") {
        const productId = session.metadata?.product_id;
        const productName = session.metadata?.product_name ?? "Produit";
        const quantity = Math.max(1, Number(session.metadata?.quantity ?? 1) | 0);
        const unitPrice = Number(session.metadata?.unit_price_eur ?? 0);
        const bonusUnit = Number(session.metadata?.bonus_credit_eur ?? 0);
        const total = +(unitPrice * quantity).toFixed(2);
        const creditAmount = +((unitPrice + bonusUnit) * quantity).toFixed(2);
        if (!productId) return json({ error: "Produit manquant" }, 400);

        // 1) Créditer le wallet (idempotent via payments.stripe_session_id)
        const creditResult = await applyStripeCredit(admin, userId, session.id, creditAmount);

        // 2) Enregistrer l'achat produit (idempotent via product_purchases.stripe_session_id)
        const { data: existing } = await admin
          .from("product_purchases")
          .select("id")
          .eq("stripe_session_id", session.id)
          .maybeSingle();

        if (!existing) {
          const { error: insErr } = await admin.from("product_purchases").insert({
            user_id: userId,
            product_id: productId,
            product_name: productName,
            price_eur: unitPrice,
            quantity,
            total_eur: total,
            status: "paid",
            stripe_session_id: session.id,
          });
          if (insErr) console.error("product_purchases insert failed", insErr);

          const { data: prod } = await admin.from("products").select("stock").eq("id", productId).maybeSingle();
          if (prod?.stock !== null && prod?.stock !== undefined) {
            await admin.from("products").update({ stock: Math.max(0, prod.stock - quantity) }).eq("id", productId);
          }
        }

        return json({
          ok: true,
          kind: "product",
          product_name: productName,
          quantity,
          total,
          credited: creditAmount,
          bonus: +(bonusUnit * quantity).toFixed(2),
          new_balance: creditResult.new_balance,
          duplicate: !!existing,
        });
      }


      // Vérification topup wallet
      const amount = Number(session.metadata?.amount_eur ?? ((session.amount_total ?? 0) / 100));
      if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Montant invalide" }, 400);
      return json(await applyStripeCredit(admin, userId, session.id, amount));
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

        const result = await applyStripeCredit(admin, userId, session.id, amount);
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

    // === Branche: achat produit (checkout Stripe direct) ===
    const productId = typeof body?.product_id === "string" ? body.product_id.trim() : "";
    if (productId) {
      if (!supabaseServiceRoleKey) return json({ error: "Missing server configuration" }, 500);
      const quantity = Math.max(1, Math.min(100, Number(body?.quantity ?? 1) | 0));

      const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: product } = await admin
        .from("products")
        .select("id, name, description, price_eur, active, stock, image_url, bonus_credit_eur")
        .eq("id", productId)
        .maybeSingle();
      if (!product || !product.active) return json({ error: "Produit indisponible" }, 404);
      if (product.stock !== null && product.stock !== undefined && product.stock < quantity) {
        return json({ error: "Stock insuffisant" }, 400);
      }
      const bonusUnit = Number((product as { bonus_credit_eur?: number | null }).bonus_credit_eur ?? 0);


      const origin = getCheckoutOrigin(req);
      const productSession = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: product.name,
                ...(product.description ? { description: product.description } : {}),
                ...(product.image_url ? { images: [product.image_url] } : {}),
              },
              unit_amount: Math.round(Number(product.price_eur) * 100),
            },
            quantity,
          },
        ],
        success_url: `${origin}/products?status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/products?status=cancel`,
        metadata: {
          kind: "product",
          user_id: userId,
          product_id: product.id,
          product_name: product.name,
          quantity: String(quantity),
          unit_price_eur: String(product.price_eur),
        },
      });

      return json({ url: productSession.url, id: productSession.id });
    }

    const eur = Number(body?.amount);

    if (!Number.isFinite(eur) || eur < 1 || eur > 5000) {
      return json({ error: "Montant invalide (1-5000 €)" }, 400);
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
        .eq("stripe_session_id", session.id)
        .maybeSingle();

      if (!existingPending) {
        const { error: pendingError } = await admin.from("payments").insert({
          user_id: userId,
          amount: eur,
          provider: "stripe",
          stripe_session_id: session.id,
          status: "pending",
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
