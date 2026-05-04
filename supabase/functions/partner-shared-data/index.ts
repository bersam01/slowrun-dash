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

const normalizeBotName = (value: string | null | undefined) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[•·].*$/u, "")
    .replace(/\bv?\d+(?:\.\d+)+(?:\b.*)?$/i, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase()
    .trim();

const matchesBotName = (sourceBot: string | null | undefined, configuredBot: string | null | undefined) => {
  const source = normalizeBotName(sourceBot);
  const configured = normalizeBotName(configuredBot);
  if (!source || !configured) return false;
  return source === configured || source.startsWith(configured) || configured.startsWith(source);
};

interface PurchaseRow {
  id: string;
  user_id: string;
  event_name: string;
  store: string;
  price_quota: number;
  quantity: number;
  status: string;
  created_at: string;
  commission: number | null;
  source_bot: string | null;
  category?: string | null;
  seats?: string[] | null;
  site?: string | null;
  event_date?: string | null;
  profiles?: { display_name: string | null };
}

const inferPurchaseBot = (purchase: PurchaseRow) => {
  if (purchase.source_bot) return purchase.source_bot;
  const storeText = `${purchase.store ?? ""} ${purchase.site ?? ""}`.toLowerCase();
  const categoryText = String(purchase.category ?? "").toLowerCase();
  const seats = purchase.seats ?? [];
  const hasIsoEventDate = /^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}/i.test(String(purchase.event_date ?? ""));
  const looksLikeTicketmaster =
    storeText.includes("ticketmaster fr") ||
    storeText.includes("ticketmaster") ||
    storeText === "tm" ||
    storeText.startsWith("tm ");
  const hasCiroStylePlacement =
    /gradin|section|tribune|pelouse|carre|carré|balcon|fosse/i.test(categoryText) || seats.length > 0;
  if (looksLikeTicketmaster && hasIsoEventDate && hasCiroStylePlacement) return "CiroAIO";
  return null;
};

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
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    const callerId = authData?.user?.id;
    if (authError || !callerId) return json({ error: "Unauthorized", isPartner: false }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: cfg } = await admin
      .from("revenue_share_config")
      .select("bot_name, partner_user_id, share_pct")
      .maybeSingle();

    if (!cfg || !cfg.partner_user_id || cfg.partner_user_id !== callerId) {
      return json({ isPartner: false, config: null, purchases: [] });
    }

    let sharedPurchases: PurchaseRow[] = [];
    if (cfg.bot_name) {
      const { data: sp } = await admin
        .from("purchases")
        .select("*, profiles(display_name)")
        .order("created_at", { ascending: false });
      sharedPurchases = ((sp ?? []) as PurchaseRow[]).filter((p) =>
        matchesBotName(inferPurchaseBot(p), cfg.bot_name),
      );
    }

    return json({
      isPartner: true,
      config: {
        bot_name: cfg.bot_name ?? null,
        share_pct: Number(cfg.share_pct ?? 50),
      },
      purchases: sharedPurchases,
    });
  } catch (e) {
    console.error("partner-shared-data error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
