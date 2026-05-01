// redeploy: bot-api v11 - force re-deploy, the live version is stale
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const API_VERSION = "bot-api-v11";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, x-client-info, apikey, content-type",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const normalizeDiscordId = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const sanitizeApiKey = (value: string | null | undefined) =>
  String(value ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");

const pickFirstPresent = (...values: unknown[]) =>
  values.find((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });

const parseOptionalString = (...values: unknown[]) => {
  const candidate = pickFirstPresent(...values);
  if (candidate === null || candidate === undefined) return null;
  const normalized = String(candidate).trim();
  return normalized.length ? normalized : null;
};

const parseOptionalNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "number" && Number.isFinite(value)) return value;

    const normalized = String(value).trim();
    if (!normalized) continue;

    const match = normalized.replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
    if (!match) continue;

    const parsed = Number(match[0]);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
};

const parseSeats = (...values: unknown[]): string[] | null => {
  for (const value of values) {
    if (Array.isArray(value)) {
      const seats = value.map((seat) => String(seat).trim()).filter(Boolean);
      if (seats.length) return seats;
      continue;
    }

    if (typeof value === "string") {
      const seats = value
        .split(/\r?\n|\s*\|\s*|\s*;\s*/)
        .map((seat) => seat.trim())
        .filter(Boolean);
      if (seats.length) return seats;
    }
  }

  return null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "x-bot-api-version": API_VERSION },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth: accept either the bot master key (SLOWRUN_BOT_API_KEY) or per-user sk_ key
    const authorizationHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    const bearerToken = sanitizeApiKey(authorizationHeader);
    const apiKey = sanitizeApiKey(
      req.headers.get("x-api-key") ??
      req.headers.get("X-API-Key") ??
      req.headers.get("apikey") ??
      req.headers.get("ApiKey") ??
      bearerToken,
    );
    if (!apiKey) return json({ error: "Missing API key" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Hardcoded fallback master keys for local bot setups.
    // Prefer the secret SLOWRUN_BOT_API_KEY, but keep these values accepted
    // so the desktop bot keeps working even if the runtime secret is different.
    const FALLBACK_MASTER_KEYS = [
      "slowrun_bot_test_2026",
      "slowrun_bot_master_2026_x9f7K2pQwL8mN3vR",
    ];
    const configuredMasterKeys = [
      Deno.env.get("SLOWRUN_BOT_API_KEY"),
      Deno.env.get("SLOWRUN_API_KEY"),
      ...FALLBACK_MASTER_KEYS,
    ]
      .map((value) => sanitizeApiKey(value))
      .filter(Boolean);
    console.log("bot-api auth attempt", {
      received_key_prefix: apiKey.slice(0, 8),
      received_key_length: apiKey.length,
      configured_count: configuredMasterKeys.length,
      matches_fallback: FALLBACK_MASTER_KEYS.includes(apiKey),
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    let ownerUserId = "";

    if (configuredMasterKeys.length && configuredMasterKeys.includes(apiKey)) {
      // Master bot key: full admin, no specific owner user
      ownerUserId = "";
    } else if (apiKey.startsWith("sk_")) {
      const key_hash = await sha256Hex(apiKey);
      const { data: keyRow, error: keyErr } = await admin
        .from("api_keys")
        .select("id, user_id")
        .eq("key_hash", key_hash)
        .maybeSingle();
      if (keyErr || !keyRow) return json({ error: "Invalid API key" }, 401);
      admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id).then();
      ownerUserId = keyRow.user_id as string;
    } else {
      return json({ error: "Invalid API key" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const discord_id = body?.discord_id ? normalizeDiscordId(body.discord_id) : null;

    // Resolve target user from discord_id (admin-key model: bot acts on behalf of any linked user)
    async function resolveUserId(): Promise<string | null> {
      if (!discord_id) return null;

      const { data, error } = await admin
        .from("profiles")
        .select("id, status, created_at")
        .eq("discord_id", discord_id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("resolveUserId failed", { discord_id, error });
        return null;
      }

      if (!data?.length) return null;

      if (data.length > 1) {
        console.warn("Multiple profiles found for discord_id", {
          discord_id,
          count: data.length,
        });
      }

      const approvedProfile = data.find((profile) => profile.status === "approved");
      return approvedProfile?.id ?? data[0]?.id ?? null;
    }

    async function resolveUserIdFromAuthIdentity(): Promise<string | null> {
      if (!discord_id) return null;

      let page = 1;
      const perPage = 200;

      while (page <= 10) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

        if (error) {
          console.error("resolveUserIdFromAuthIdentity failed", { discord_id, error });
          return null;
        }

        const users = data?.users ?? [];
        if (!users.length) break;

        const matchedUser = users.find((user) =>
          (user.identities ?? []).some((identity) => {
            if (identity.provider !== "discord") return false;
            const identityData = (identity.identity_data ?? {}) as Record<string, unknown>;
            const candidate = normalizeDiscordId(
              identity.provider_id ?? identityData.provider_id ?? identityData.sub ?? identityData.id,
            );
            return candidate === discord_id;
          }),
        );

        if (matchedUser) {
          const metadata = (matchedUser.user_metadata ?? {}) as Record<string, unknown>;
          const display_name =
            String(metadata.full_name ?? metadata.global_name ?? metadata.name ?? metadata.user_name ?? matchedUser.email ?? "").trim() || null;
          const avatar_url =
            String(metadata.avatar_url ?? metadata.picture ?? "").trim() || null;

          const { data: existingProfile } = await admin
            .from("profiles")
            .select("id")
            .eq("id", matchedUser.id)
            .maybeSingle();

          if (existingProfile) {
            const { error: syncError } = await admin
              .from("profiles")
              .update({ discord_id, display_name, avatar_url })
              .eq("id", matchedUser.id);

            if (syncError) {
              console.error("Unable to sync discord_id from auth identity", { discord_id, user_id: matchedUser.id, syncError });
            }
          }

          return matchedUser.id;
        }

        if (users.length < perPage) break;
        page += 1;
      }

      return null;
    }

    if (action === "balance") {
      const userId = (await resolveUserId()) ?? (await resolveUserIdFromAuthIdentity());
      if (!userId) return json({ error: "Compte non trouvé. Connecte-toi sur le site avec Discord d'abord." }, 404);

      const { data: profile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();

      const { data: wallet } = await admin
        .from("wallets")
        .select("balance, total_credited, total_spent")
        .eq("user_id", userId)
        .maybeSingle();

      return json({
        balance: Number(wallet?.balance ?? 0),
        total_credited: Number(wallet?.total_credited ?? 0),
        total_spent: Number(wallet?.total_spent ?? 0),
        display_name: profile?.display_name ?? null,
      });
    }

    if (action === "history") {
      const userId = (await resolveUserId()) ?? (await resolveUserIdFromAuthIdentity());
      if (!userId) return json({ error: "Compte non trouvé." }, 404);
      const limit = Math.min(Math.max(Number(body?.limit ?? 5), 1), 20);
      const { data } = await admin
        .from("purchases")
        .select("event_name, store, price_quota, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return json({ purchases: data ?? [] });
    }

    if (action === "purchase") {
      const userId = (await resolveUserId()) ?? (await resolveUserIdFromAuthIdentity());
      if (!userId) return json({ error: "Compte non trouvé." }, 404);

      console.log("[bot-api] purchase body received:", JSON.stringify(body));

      const purchasePayload = [body?.purchase, body?.payload, body?.data].find(
        (value) => value && typeof value === "object" && !Array.isArray(value),
      ) as Record<string, unknown> | undefined;
      const source = purchasePayload ?? body;

      const event_name = parseOptionalString(
        source?.event_name,
        source?.event,
        source?.name,
        source?.title,
      ) ?? "";
      const store = parseOptionalString(
        source?.store,
        source?.shop,
        source?.merchant,
        source?.site,
        source?.source,
      ) ?? "";
      const product_url = parseOptionalString(
        source?.product_url,
        source?.url,
        source?.link,
        source?.productLink,
      );
      const quantity = Math.max(1, Math.trunc(parseOptionalNumber(source?.quantity, source?.qty, source?.count) ?? 1));
      // amount = ce qui est débité du solde (= commission par défaut)
      const commission = parseOptionalNumber(source?.commission, source?.fee, source?.quota);
      const amount = parseOptionalNumber(source?.amount, source?.debit, source?.charged_amount, commission);
      const status = parseOptionalString(source?.status, source?.state) ?? "success";
      const category = parseOptionalString(
        source?.category,
        source?.cat,
        source?.ticket_category,
        source?.ticketCategory,
        source?.section,
      );
      const site = parseOptionalString(source?.site, source?.store, source?.shop, source?.merchant);
      const event_date = parseOptionalString(source?.event_date, source?.date, source?.eventDate);
      const retail_price = parseOptionalNumber(
        source?.retail_price,
        source?.retail,
        source?.retailPrice,
        source?.face_value,
        source?.price,
      );
      const seats = parseSeats(source?.seats, source?.ticket_seats, source?.places, source?.seat);

      console.log("[bot-api] purchase parsed:", {
        event_name,
        store,
        quantity,
        amount,
        commission,
        category,
        retail_price,
        site,
        event_date,
        seats_count: seats?.length ?? 0,
      });

      if (!event_name || !store || !Number.isFinite(amount) || amount <= 0) {
        return json({ error: "event_name, store et amount (>0) requis" }, 400);
      }

      const { data: wallet } = await admin
        .from("wallets")
        .select("balance, total_spent")
        .eq("user_id", userId)
        .maybeSingle();

      const balance = Number(wallet?.balance ?? 0);
      if (balance < amount) {
        return json({ error: `Solde insuffisant (${balance.toFixed(2)} q < ${amount.toFixed(2)} q)` }, 400);
      }

      const { error: insErr } = await admin.from("purchases").insert({
        user_id: userId,
        event_name,
        store,
        product_url,
        quantity,
        price_quota: amount,
        status,
        category,
        seats,
        retail_price,
        commission,
        site,
        event_date,
      });
      if (insErr) return json({ error: insErr.message }, 500);

      const new_balance = +(balance - amount).toFixed(2);
      const new_spent = +(Number(wallet?.total_spent ?? 0) + amount).toFixed(2);

      const { error: updErr } = await admin
        .from("wallets")
        .update({
          balance: new_balance,
          total_spent: new_spent,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (updErr) return json({ error: updErr.message }, 500);

      return json({ ok: true, new_balance });
    }

    if (action === "link_discord") {
      // Admin-only-ish: link an existing email-account to a discord_id.
      // The api-key owner can only modify their own profile here for safety.
      if (!discord_id) return json({ error: "discord_id requis" }, 400);
      const { error } = await admin
        .from("profiles")
        .update({ discord_id })
        .eq("id", ownerUserId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("bot-api error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
