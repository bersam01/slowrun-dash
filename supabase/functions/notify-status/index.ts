// notify-status: envoie un DM Discord quand un admin approuve/refuse un compte
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendDiscordDM(botToken: string, discordId: string, content: string) {
  const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: discordId }),
  });
  if (!dmRes.ok) throw new Error(`DM channel: ${dmRes.status} ${await dmRes.text()}`);
  const dm = await dmRes.json();

  const msgRes = await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!msgRes.ok) throw new Error(`DM send: ${msgRes.status} ${await msgRes.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) return json({ error: "Server misconfigured" }, 500);
    if (!BOT_TOKEN) return json({ error: "DISCORD_BOT_TOKEN missing" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const callerId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Vérifie que le caller est admin
    const { data: caller } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", callerId)
      .maybeSingle();
    if (!caller?.is_admin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const { user_id, status } = body as { user_id?: string; status?: string };
    if (!user_id || (status !== "approved" && status !== "rejected")) {
      return json({ error: "Invalid payload" }, 400);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("discord_id, display_name")
      .eq("id", user_id)
      .maybeSingle();

    if (!profile) return json({ error: "Profile not found" }, 404);
    if (!profile.discord_id) return json({ ok: true, skipped: "no_discord_id" });

    const name = profile.display_name ?? "";
    const content = status === "approved"
      ? `🎉 Salut ${name} !\n\n` +
        `Bonne nouvelle : ton compte **SlowRun Dashboard** vient d'être **approuvé** ! ✅\n` +
        `Tu peux dès maintenant te connecter ici : https://slowrun.app/login`
      : `👋 Salut ${name},\n\n` +
        `Malheureusement, ta demande d'accès à **SlowRun Dashboard** a été **refusée**. ❌\n` +
        `Si tu penses qu'il s'agit d'une erreur, contacte un administrateur sur Discord.`;

    try {
      await sendDiscordDM(BOT_TOKEN, profile.discord_id, content);
    } catch (e) {
      console.error("DM error", e);
      return json({ ok: false, error: (e as Error).message }, 200);
    }

    return json({ ok: true, sent: true });
  } catch (e) {
    console.error("notify-status error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
