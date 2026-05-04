// admin-process-credit: approuve ou refuse une demande de crédit manuelle
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

const truncateDiscordValue = (value: unknown, fallback = "—", maxLength = 1000) => {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.length > maxLength ? `${text.slice(0, Math.max(1, maxLength - 3))}...` : text;
};

async function sendDiscordAdminWebhook(webhookUrl: string, payload: { title: string; color: number; content: string; fields: Array<{ name: string; value: string; inline?: boolean }> }) {
  const url = new URL(webhookUrl.trim());
  url.searchParams.set("wait", "true");

  const sendPayload = async (body: Record<string, unknown>) => {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Discord webhook ${response.status}: ${responseText || response.statusText}`);
    }
  };

  try {
    await sendPayload({
      username: "SlowRun Admin",
      allowed_mentions: { parse: [] },
      content: truncateDiscordValue(payload.content, "—", 500),
      embeds: [{
        title: truncateDiscordValue(payload.title, "Notification", 250),
        color: payload.color,
        fields: payload.fields,
        timestamp: new Date().toISOString(),
      }],
    });
  } catch (embedError) {
    const fallbackContent = truncateDiscordValue([
      payload.title,
      payload.content,
      ...payload.fields.map((field) => `${truncateDiscordValue(field.name, "Champ", 80)}: ${truncateDiscordValue(field.value, "—", 220)}`),
    ].join("\n"), "Notification admin", 1800);

    try {
      await sendPayload({
        username: "SlowRun Admin",
        allowed_mentions: { parse: [] },
        content: fallbackContent,
      });
    } catch (fallbackError) {
      throw new Error(`${(embedError as Error).message} | fallback: ${(fallbackError as Error).message}`);
    }
  }
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

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      console.error("auth getUser failed", userErr);
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: caller } = await admin.from("profiles").select("is_admin").eq("id", callerId).maybeSingle();
    if (!caller?.is_admin) return json({ error: "Forbidden — admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const requestId = String(body?.request_id ?? "").trim();
    const approve = Boolean(body?.approve);
    if (!requestId) return json({ error: "request_id requis" }, 400);

    const { data: reqRow, error: reqErr } = await admin
      .from("credit_requests")
      .select("id, user_id, amount, status")
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr || !reqRow) return json({ error: "Demande introuvable" }, 404);
    if (reqRow.status !== "pending") return json({ error: "Demande déjà traitée" }, 400);

    const newStatus = approve ? "approved" : "rejected";
    let updReqErr = (await admin
      .from("credit_requests")
      .update({ status: newStatus, processed_at: new Date().toISOString(), processed_by: callerId })
      .eq("id", requestId)).error;
    if (updReqErr) {
      console.error("update with processed_at/by failed, retrying with status only", updReqErr);
      const retry = await admin
        .from("credit_requests")
        .update({ status: newStatus })
        .eq("id", requestId);
      updReqErr = retry.error;
    }
    if (updReqErr) return json({ error: updReqErr.message }, 500);

    if (approve) {
      const amount = Number(reqRow.amount);
      const { data: wallet } = await admin
        .from("wallets")
        .select("balance, total_credited")
        .eq("user_id", reqRow.user_id)
        .maybeSingle();

      const newBalance = +(Number(wallet?.balance ?? 0) + amount).toFixed(2);
      const newCredited = +(Number(wallet?.total_credited ?? 0) + amount).toFixed(2);

      if (wallet) {
        await admin
          .from("wallets")
          .update({ balance: newBalance, total_credited: newCredited, updated_at: new Date().toISOString() })
          .eq("user_id", reqRow.user_id);
      } else {
        await admin.from("wallets").insert({
          user_id: reqRow.user_id,
          balance: newBalance,
          total_credited: newCredited,
        });
      }

      await admin.from("payments").insert({
        user_id: reqRow.user_id,
        amount,
        provider: "manual",
        status: "credited",
        note: `Demande manuelle ${requestId}`,
      });
    }

    // Notification Discord admin
    const discordWebhook = Deno.env.get("DISCORD_ADMIN_WEBHOOK_URL")?.trim();
    let notificationError: string | null = null;
    if (discordWebhook) {
      try {
        const { data: profile } = await admin
          .from("profiles")
          .select("display_name, discord_id")
          .eq("id", reqRow.user_id)
          .maybeSingle();
        await sendDiscordAdminWebhook(discordWebhook, {
          title: approve ? "✅ Demande de crédit approuvée" : "❌ Demande de crédit refusée",
          color: approve ? 0x22c55e : 0xef4444,
          content: `${approve ? "Demande approuvée" : "Demande refusée"} • ${truncateDiscordValue(profile?.display_name)}`,
          fields: [
            { name: "Utilisateur", value: truncateDiscordValue(profile?.display_name), inline: true },
            { name: "Discord ID", value: truncateDiscordValue(profile?.discord_id), inline: true },
            { name: "Montant", value: truncateDiscordValue(`${Number(reqRow.amount).toFixed(2)} €`), inline: true },
            { name: "Demande", value: truncateDiscordValue(requestId), inline: false },
          ],
        });
      } catch (e) {
        console.error("Discord notify failed", e);
        notificationError = (e as Error).message;
      }
    }

    return json({ ok: true, notification_sent: !notificationError, notification_error: notificationError });
  } catch (e) {
    console.error("admin-process-credit error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
