// admin-credit: crédite ou retire des quotas (montant négatif = retire)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) return json({ error: "Missing server configuration" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    // Auth check
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const callerId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify caller is admin
    const { data: caller } = await admin.from("profiles").select("is_admin").eq("id", callerId).maybeSingle();
    if (!caller?.is_admin) return json({ error: "Forbidden — admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.user_id ?? "").trim();
    const amount = Number(body?.amount);
    const note = body?.note ? String(body.note) : null;

    if (!userId) return json({ error: "user_id requis" }, 400);
    if (!Number.isFinite(amount) || amount === 0) return json({ error: "amount doit être un nombre non nul (négatif pour retirer)" }, 400);

    const { data: wallet } = await admin
      .from("wallets")
      .select("balance, total_credited, total_spent")
      .eq("user_id", userId)
      .maybeSingle();

    const currentBalance = Number(wallet?.balance ?? 0);
    const newBalance = +(currentBalance + amount).toFixed(2);
    if (newBalance < 0) return json({ error: `Solde insuffisant (${currentBalance.toFixed(2)} q, retrait de ${Math.abs(amount).toFixed(2)} q impossible)` }, 400);

    const totalCredited = Number(wallet?.total_credited ?? 0);
    const totalSpent = Number(wallet?.total_spent ?? 0);
    const newCredited = amount > 0 ? +(totalCredited + amount).toFixed(2) : totalCredited;
    const newSpent = amount < 0 ? +(totalSpent + Math.abs(amount)).toFixed(2) : totalSpent;

    if (wallet) {
      const { error: updErr } = await admin
        .from("wallets")
        .update({
          balance: newBalance,
          total_credited: newCredited,
          total_spent: newSpent,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (updErr) return json({ error: updErr.message }, 500);
    } else {
      const { error: insErr } = await admin.from("wallets").insert({
        user_id: userId,
        balance: newBalance,
        total_credited: newCredited,
        total_spent: newSpent,
      });
      if (insErr) return json({ error: insErr.message }, 500);
    }

    // Log as a payment row for traceability
    await admin.from("payments").insert({
      user_id: userId,
      amount,
      provider: "admin",
      status: amount > 0 ? "credited" : "debited",
      note,
    });

    // Notification Discord admin
    const discordWebhook = Deno.env.get("DISCORD_ADMIN_WEBHOOK_URL");
    if (discordWebhook) {
      try {
        const { data: profile } = await admin
          .from("profiles")
          .select("display_name, discord_id")
          .eq("id", userId)
          .maybeSingle();
        const isCredit = amount > 0;
        await fetch(discordWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embeds: [{
              title: isCredit ? "🟢 Crédit admin" : "🔴 Débit admin",
              color: isCredit ? 0x3b82f6 : 0xef4444,
              fields: [
                { name: "Utilisateur", value: profile?.display_name ?? "—", inline: true },
                { name: "Discord ID", value: profile?.discord_id ?? "—", inline: true },
                { name: "Montant", value: `**${amount.toFixed(2)} €**`, inline: true },
                { name: "Nouveau solde", value: `${newBalance.toFixed(2)} €`, inline: true },
                ...(note ? [{ name: "Note", value: note, inline: false }] : []),
              ],
              timestamp: new Date().toISOString(),
            }],
          }),
        });
      } catch (e) {
        console.error("Discord notify failed", e);
      }
    }

    return json({ ok: true, new_balance: newBalance });
  } catch (e) {
    console.error("admin-credit error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
