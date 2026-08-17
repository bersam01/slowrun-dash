// crypto-topup: rechargement en USDT (TRC20) 100% maison
// - action "create": crée une demande avec un montant USDT UNIQUE (centimes uniques) -> permet d'identifier le payeur
// - action "check" : interroge TronGrid, matche les transferts reçus sur l'adresse, crédite le wallet
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const EXPIRY_MINUTES = 60;

type Admin = ReturnType<typeof createClient>;

async function notifyDiscord(admin: Admin, userId: string, amountEur: number, amountUsdt: number, newBalance: number, txHash: string) {
  const webhook = Deno.env.get("DISCORD_ADMIN_WEBHOOK_URL");
  if (!webhook) return;
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, discord_id")
      .eq("id", userId)
      .maybeSingle();

    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "🪙 Nouveau topup (USDT TRC20)",
          color: 0x14b8a6,
          fields: [
            { name: "Utilisateur", value: String(profile?.display_name ?? "—"), inline: true },
            { name: "Discord ID", value: String(profile?.discord_id ?? "—"), inline: true },
            { name: "Montant", value: `**${amountEur.toFixed(2)} €** (${amountUsdt.toFixed(2)} USDT)`, inline: true },
            { name: "Nouveau solde", value: `${newBalance.toFixed(2)} €`, inline: true },
            { name: "Tx", value: txHash, inline: false },
          ],
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (e) {
    console.error("Discord notify failed", e);
  }
}

async function creditWallet(admin: Admin, userId: string, amountEur: number) {
  const { data: wallet } = await admin
    .from("wallets")
    .select("balance, total_credited, total_spent")
    .eq("user_id", userId)
    .maybeSingle();

  const currentBalance = Number(wallet?.balance ?? 0);
  const totalCredited = Number(wallet?.total_credited ?? 0);
  const newBalance = +(currentBalance + amountEur).toFixed(2);
  const newCredited = +(totalCredited + amountEur).toFixed(2);

  if (wallet) {
    const { error } = await admin
      .from("wallets")
      .update({ balance: newBalance, total_credited: newCredited, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin
      .from("wallets")
      .insert({ user_id: userId, balance: newBalance, total_credited: newCredited, total_spent: 0 });
    if (error) throw new Error(error.message);
  }

  return newBalance;
}

async function fetchTronTransfers(address: string) {
  const url = new URL(`https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("only_to", "true");
  url.searchParams.set("contract_address", USDT_TRC20_CONTRACT);

  const headers: Record<string, string> = {};
  const apiKey = Deno.env.get("TRONGRID_API_KEY");
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`TronGrid ${res.status}`);
  const payload = await res.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];

  return rows
    .filter((row: Record<string, unknown>) => String(row?.to ?? "") === address && String(row?.type ?? "Transfer") === "Transfer")
    .map((row: Record<string, unknown>) => {
      const decimals = Number((row as { token_info?: { decimals?: number } })?.token_info?.decimals ?? 6);
      const raw = String(row?.value ?? "0");
      return {
        tx_hash: String(row?.transaction_id ?? ""),
        amount: Number(raw) / Math.pow(10, decimals),
        timestamp: Number(row?.block_timestamp ?? 0),
      };
    })
    .filter((tx: { tx_hash: string }) => Boolean(tx.tx_hash));
}

/** Rapproche les transferts reçus avec les demandes en attente (matching par montant exact). */
async function reconcile(admin: Admin, address: string) {
  const nowIso = new Date().toISOString();

  // expire les vieilles demandes
  await admin
    .from("crypto_payments")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", nowIso);

  const { data: pending } = await admin
    .from("crypto_payments")
    .select("id, user_id, amount_eur, amount_usdt, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (!pending?.length) return [];

  const transfers = await fetchTronTransfers(address);
  if (!transfers.length) return [];

  const { data: usedRows } = await admin
    .from("crypto_payments")
    .select("tx_hash")
    .not("tx_hash", "is", null);
  const usedHashes = new Set((usedRows ?? []).map((r: { tx_hash: string | null }) => r.tx_hash));

  const credited: Array<{ id: string; amount_eur: number; tx_hash: string }> = [];

  for (const request of pending) {
    const expected = Number(request.amount_usdt);
    const createdAt = new Date(request.created_at as string).getTime() - 10 * 60 * 1000;

    const match = transfers.find((tx: { tx_hash: string; amount: number; timestamp: number }) =>
      !usedHashes.has(tx.tx_hash) &&
      tx.timestamp >= createdAt &&
      Math.abs(tx.amount - expected) < 0.005
    );
    if (!match) continue;

    usedHashes.add(match.tx_hash);

    // marque d'abord la demande (idempotence) puis crédite
    const { data: claimed, error: claimErr } = await admin
      .from("crypto_payments")
      .update({ status: "paid", tx_hash: match.tx_hash, paid_at: new Date().toISOString() })
      .eq("id", request.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimErr || !claimed) continue;

    try {
      const amountEur = Number(request.amount_eur);
      const newBalance = await creditWallet(admin, request.user_id as string, amountEur);
      await admin.from("payments").insert({
        user_id: request.user_id,
        amount: amountEur,
        provider: "crypto",
        status: "paid",
      });
      await notifyDiscord(admin, request.user_id as string, amountEur, expected, newBalance, match.tx_hash);
      credited.push({ id: request.id as string, amount_eur: amountEur, tx_hash: match.tx_hash });
    } catch (e) {
      console.error("crypto credit failed, rollback status", e);
      await admin.from("crypto_payments").update({ status: "pending", tx_hash: null, paid_at: null }).eq("id", request.id);
    }
  }

  return credited;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const address = Deno.env.get("TRON_USDT_ADDRESS")?.trim();

    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE) return json({ error: "Missing server configuration" }, 500);
    if (!address) return json({ error: "TRON_USDT_ADDRESS non configurée" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "check");

    if (action === "create") {
      const amountEur = Number(body?.amount);
      if (!Number.isFinite(amountEur) || amountEur < 1 || amountEur > 5000) {
        return json({ error: "Montant invalide (1 € à 5000 €)" }, 400);
      }

      const rate = Number(Deno.env.get("CRYPTO_EUR_USDT_RATE") ?? "1.08"); // 1 € = X USDT
      const base = amountEur * (Number.isFinite(rate) && rate > 0 ? rate : 1.08);

      // centimes uniques -> identification du payeur
      const { data: activeRows } = await admin
        .from("crypto_payments")
        .select("amount_usdt")
        .eq("status", "pending");
      const taken = new Set((activeRows ?? []).map((r: { amount_usdt: number }) => Number(r.amount_usdt).toFixed(2)));

      let amountUsdt = 0;
      for (let cents = 0; cents < 100; cents += 1) {
        const candidate = +(Math.floor(base * 100) / 100 + cents / 100).toFixed(2);
        if (!taken.has(candidate.toFixed(2))) {
          amountUsdt = candidate;
          break;
        }
      }
      if (!amountUsdt) return json({ error: "Trop de paiements en attente, réessaie dans quelques minutes." }, 409);

      const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString();
      const { data: created, error } = await admin
        .from("crypto_payments")
        .insert({
          user_id: userId,
          amount_eur: +amountEur.toFixed(2),
          amount_usdt: amountUsdt,
          address,
          network: "TRC20",
          status: "pending",
          expires_at: expiresAt,
        })
        .select("id, amount_eur, amount_usdt, address, network, status, expires_at")
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, payment: created });
    }

    if (action === "cancel") {
      const id = String(body?.id ?? "");
      if (!id) return json({ error: "id requis" }, 400);
      await admin.from("crypto_payments").update({ status: "cancelled" }).eq("id", id).eq("user_id", userId).eq("status", "pending");
      return json({ ok: true });
    }

    // action "check" (par défaut) : réconcilie puis renvoie l'état de l'utilisateur
    const credited = await reconcile(admin, address);
    const mine = credited.filter(() => true);

    const { data: pending } = await admin
      .from("crypto_payments")
      .select("id, amount_eur, amount_usdt, address, network, status, expires_at, tx_hash")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastPaid } = await admin
      .from("crypto_payments")
      .select("id, amount_eur, amount_usdt, tx_hash, paid_at")
      .eq("user_id", userId)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return json({ ok: true, pending: pending ?? null, last_paid: lastPaid ?? null, credited_count: mine.length });
  } catch (e) {
    console.error("crypto-topup error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
