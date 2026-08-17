// crypto-topup: rechargement crypto 100% maison (USDT TRC20 + USDC/USDT Solana)
// - action "networks": renvoie les réseaux activés (configurés dans le panel admin)
// - action "create"  : crée une demande avec un montant token UNIQUE (centimes uniques) -> identifie le payeur
// - action "check"   : interroge la blockchain, matche les transferts reçus, crédite le wallet
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDC_SPL_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const EXPIRY_MINUTES = 60;

type Admin = ReturnType<typeof createClient>;

type NetworkConfig = {
  id: string;
  label: string;
  token_symbol: string;
  address: string;
  contract: string;
  rate_eur: number;
  enabled: boolean;
  sort_order: number;
};

/** true si le réseau reçoit la crypto native (SOL) et non un token. */
const isNative = (n: { id: string; contract?: string | null }) =>
  String(n.contract ?? "").trim().toLowerCase() === "native" || n.id === "SOLNATIVE";

/** décimales utilisées pour rendre le montant unique (matching). */
const tokenDecimals = (n: NetworkConfig) => (isNative(n) ? 4 : 2);


type Transfer = { tx_hash: string; amount: number; timestamp: number };

/** Config des réseaux : table crypto_networks si dispo, sinon fallback env (TRON). */
async function loadNetworks(admin: Admin): Promise<NetworkConfig[]> {
  const { data, error } = await admin
    .from("crypto_networks")
    .select("id, label, token_symbol, address, contract, rate_eur, enabled, sort_order")
    .order("sort_order", { ascending: true });

  if (!error && data?.length) {
    return (data as NetworkConfig[]).map((n) => ({
      ...n,
      address: String(n.address ?? "").trim() ||
        (n.id === "TRC20"
          ? (Deno.env.get("TRON_USDT_ADDRESS") ?? "").trim()
          : (Deno.env.get("SOLANA_ADDRESS") ?? "").trim()),
      contract: isNative(n)
        ? "native"
        : String(n.contract ?? "").trim() || (n.id === "TRC20" ? USDT_TRC20_CONTRACT : USDC_SPL_MINT),
      rate_eur: Number(n.rate_eur) > 0 ? Number(n.rate_eur) : 0,
    }));
  }

  const fallbackRate = Number(Deno.env.get("CRYPTO_EUR_USDT_RATE") ?? "1.08");
  const tronAddress = (Deno.env.get("TRON_USDT_ADDRESS") ?? "").trim();
  const solAddress = (Deno.env.get("SOLANA_ADDRESS") ?? "").trim();
  return [
    {
      id: "TRC20",
      label: "USDT · TRON (TRC20)",
      token_symbol: "USDT",
      address: tronAddress,
      contract: USDT_TRC20_CONTRACT,
      rate_eur: Number.isFinite(fallbackRate) && fallbackRate > 0 ? fallbackRate : 1.08,
      enabled: Boolean(tronAddress),
      sort_order: 1,
    },
    {
      id: "SOL",
      label: "USDC · Solana (SPL)",
      token_symbol: "USDC",
      address: solAddress,
      contract: USDC_SPL_MINT,
      rate_eur: Number.isFinite(fallbackRate) && fallbackRate > 0 ? fallbackRate : 1.08,
      enabled: Boolean(solAddress),
      sort_order: 2,
    },
    {
      id: "SOLNATIVE",
      label: "SOL · Solana",
      token_symbol: "SOL",
      address: solAddress,
      contract: "native",
      rate_eur: 0, // 0 = taux live (prix du SOL)
      enabled: Boolean(solAddress),
      sort_order: 3,
    },
  ];
}

/** Prix live d'un token natif (EUR) -> nombre de tokens pour 1 €. */
async function liveRateEur(network: NetworkConfig): Promise<number> {
  if (Number(network.rate_eur) > 0) return Number(network.rate_eur);
  const ids: Record<string, string> = { SOLNATIVE: "solana", TRXNATIVE: "tron" };
  const coin = ids[network.id] ?? "solana";
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=eur`);
  if (!res.ok) throw new Error(`Prix indisponible (${res.status})`);
  const payload = await res.json();
  const price = Number(payload?.[coin]?.eur);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Prix indisponible");
  // marge de 2% pour couvrir la volatilité
  return +(1.02 / price).toFixed(8);
}

const publicNetworks = (networks: NetworkConfig[]) =>
  networks
    .filter((n) => n.enabled && n.address)
    .map((n) => ({
      id: n.id,
      label: n.label,
      token_symbol: n.token_symbol,
      rate_eur: n.rate_eur,
      decimals: tokenDecimals(n),
    }));


async function notifyDiscord(
  admin: Admin,
  userId: string,
  amountEur: number,
  amountToken: number,
  symbol: string,
  network: string,
  newBalance: number,
  txHash: string,
) {
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
          title: `🪙 Nouveau topup (${symbol} ${network})`,
          color: 0x14b8a6,
          fields: [
            { name: "Utilisateur", value: String(profile?.display_name ?? "—"), inline: true },
            { name: "Discord ID", value: String(profile?.discord_id ?? "—"), inline: true },
            { name: "Montant", value: `**${amountEur.toFixed(2)} €** (${amountToken.toFixed(2)} ${symbol})`, inline: true },
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

async function fetchTronTransfers(address: string, contract: string): Promise<Transfer[]> {
  const url = new URL(`https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("only_to", "true");
  url.searchParams.set("contract_address", contract);

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
    .filter((tx: Transfer) => Boolean(tx.tx_hash));
}

async function solanaRpc(method: string, params: unknown[]) {
  const rpc = Deno.env.get("SOLANA_RPC_URL")?.trim() || "https://api.mainnet-beta.solana.com";
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Solana RPC ${res.status}`);
  const payload = await res.json();
  if (payload?.error) throw new Error(`Solana RPC: ${payload.error?.message ?? "error"}`);
  return payload?.result;
}

/** Transferts SPL entrants (mint donné) vers l'adresse Solana du marchand. */
async function fetchSolanaTransfers(owner: string, mint: string): Promise<Transfer[]> {
  const accounts = await solanaRpc("getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  const atas: string[] = (accounts?.value ?? []).map((a: { pubkey: string }) => a.pubkey);
  if (!atas.length) return [];

  const transfers: Transfer[] = [];

  for (const ata of atas) {
    const sigs = await solanaRpc("getSignaturesForAddress", [ata, { limit: 25 }, { commitment: "confirmed" }]);
    const list = Array.isArray(sigs) ? sigs : [];

    for (const sig of list) {
      if (sig?.err) continue;
      const signature = String(sig?.signature ?? "");
      if (!signature) continue;

      const tx = await solanaRpc("getTransaction", [
        signature,
        { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
      ]);
      if (!tx?.meta) continue;

      const pick = (rows: Array<Record<string, unknown>> | undefined) =>
        (rows ?? []).filter((b) => String(b?.mint ?? "") === mint && String(b?.owner ?? "") === owner);

      const pre = pick(tx.meta.preTokenBalances);
      const post = pick(tx.meta.postTokenBalances);

      let delta = 0;
      for (const p of post) {
        const idx = Number(p?.accountIndex ?? -1);
        const before = pre.find((b) => Number(b?.accountIndex ?? -2) === idx);
        const postAmount = Number((p as { uiTokenAmount?: { uiAmount?: number } })?.uiTokenAmount?.uiAmount ?? 0);
        const preAmount = Number((before as { uiTokenAmount?: { uiAmount?: number } } | undefined)?.uiTokenAmount?.uiAmount ?? 0);
        delta += postAmount - preAmount;
      }

      if (delta > 0) {
        transfers.push({
          tx_hash: signature,
          amount: +delta.toFixed(6),
          timestamp: Number(tx?.blockTime ?? sig?.blockTime ?? 0) * 1000,
        });
      }
    }
  }

  return transfers;
}

/** Transferts SOL natifs entrants vers l'adresse du marchand. */
async function fetchSolanaNativeTransfers(owner: string): Promise<Transfer[]> {
  const sigs = await solanaRpc("getSignaturesForAddress", [owner, { limit: 25 }, { commitment: "confirmed" }]);
  const list = Array.isArray(sigs) ? sigs : [];
  const transfers: Transfer[] = [];

  for (const sig of list) {
    if (sig?.err) continue;
    const signature = String(sig?.signature ?? "");
    if (!signature) continue;

    const tx = await solanaRpc("getTransaction", [
      signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx?.meta) continue;

    const keys: Array<{ pubkey?: string }> = tx?.transaction?.message?.accountKeys ?? [];
    const idx = keys.findIndex((k) => String(k?.pubkey ?? k) === owner);
    if (idx < 0) continue;

    const pre = Number(tx.meta.preBalances?.[idx] ?? 0);
    const post = Number(tx.meta.postBalances?.[idx] ?? 0);
    const delta = (post - pre) / 1_000_000_000;

    if (delta > 0) {
      transfers.push({
        tx_hash: signature,
        amount: +delta.toFixed(9),
        timestamp: Number(tx?.blockTime ?? sig?.blockTime ?? 0) * 1000,
      });
    }
  }

  return transfers;
}

async function fetchTransfers(network: NetworkConfig): Promise<Transfer[]> {
  if (isNative(network)) return fetchSolanaNativeTransfers(network.address);
  if (network.id === "SOL") return fetchSolanaTransfers(network.address, network.contract);
  return fetchTronTransfers(network.address, network.contract);
}


/** Rapproche les transferts reçus avec les demandes en attente (matching par montant exact). */
async function reconcile(admin: Admin, networks: NetworkConfig[]) {
  const nowIso = new Date().toISOString();

  await admin
    .from("crypto_payments")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", nowIso);

  const { data: pending } = await admin
    .from("crypto_payments")
    .select("id, user_id, amount_eur, amount_usdt, network, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (!pending?.length) return [];

  const { data: usedRows } = await admin
    .from("crypto_payments")
    .select("tx_hash")
    .not("tx_hash", "is", null);
  const usedHashes = new Set((usedRows ?? []).map((r: { tx_hash: string | null }) => r.tx_hash));

  const credited: Array<{ id: string; amount_eur: number; tx_hash: string }> = [];
  const cache = new Map<string, Transfer[]>();

  for (const request of pending) {
    const networkId = String(request.network ?? "TRC20");
    const network = networks.find((n) => n.id === networkId && n.address);
    if (!network) continue;

    if (!cache.has(networkId)) {
      try {
        cache.set(networkId, await fetchTransfers(network));
      } catch (e) {
        console.error(`fetch transfers failed for ${networkId}`, e);
        cache.set(networkId, []);
      }
    }
    const transfers = cache.get(networkId) ?? [];
    if (!transfers.length) continue;

    const expected = Number(request.amount_usdt);
    const createdAt = new Date(request.created_at as string).getTime() - 10 * 60 * 1000;

    const match = transfers.find((tx) =>
      !usedHashes.has(tx.tx_hash) &&
      tx.timestamp >= createdAt &&
      Math.abs(tx.amount - expected) < 0.005
    );
    if (!match) continue;

    usedHashes.add(match.tx_hash);

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
      await notifyDiscord(
        admin,
        request.user_id as string,
        amountEur,
        expected,
        network.token_symbol,
        network.id,
        newBalance,
        match.tx_hash,
      );
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

    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE) return json({ error: "Missing server configuration" }, 500);

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
    const networks = await loadNetworks(admin);

    if (action === "networks") {
      return json({ ok: true, networks: publicNetworks(networks) });
    }

    if (action === "create") {
      const amountEur = Number(body?.amount);
      if (!Number.isFinite(amountEur) || amountEur < 1 || amountEur > 5000) {
        return json({ error: "Montant invalide (1 € à 5000 €)" }, 400);
      }

      const requestedId = String(body?.network ?? "").trim();
      const available = networks.filter((n) => n.enabled && n.address);
      const network = requestedId ? available.find((n) => n.id === requestedId) : available[0];
      if (!network) return json({ error: "Aucun réseau crypto disponible pour le moment." }, 400);

      const base = amountEur * network.rate_eur;

      // centimes uniques (par réseau) -> identification du payeur
      const { data: activeRows } = await admin
        .from("crypto_payments")
        .select("amount_usdt")
        .eq("status", "pending")
        .eq("network", network.id);
      const taken = new Set((activeRows ?? []).map((r: { amount_usdt: number }) => Number(r.amount_usdt).toFixed(2)));

      let amountToken = 0;
      for (let cents = 0; cents < 100; cents += 1) {
        const candidate = +(Math.floor(base * 100) / 100 + cents / 100).toFixed(2);
        if (!taken.has(candidate.toFixed(2))) {
          amountToken = candidate;
          break;
        }
      }
      if (!amountToken) return json({ error: "Trop de paiements en attente, réessaie dans quelques minutes." }, 409);

      const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString();
      const { data: created, error } = await admin
        .from("crypto_payments")
        .insert({
          user_id: userId,
          amount_eur: +amountEur.toFixed(2),
          amount_usdt: amountToken,
          address: network.address,
          network: network.id,
          status: "pending",
          expires_at: expiresAt,
        })
        .select("id, amount_eur, amount_usdt, address, network, status, expires_at")
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, payment: { ...created, token_symbol: network.token_symbol, label: network.label } });
    }

    if (action === "cancel") {
      const id = String(body?.id ?? "");
      if (!id) return json({ error: "id requis" }, 400);
      await admin.from("crypto_payments").update({ status: "cancelled" }).eq("id", id).eq("user_id", userId).eq("status", "pending");
      return json({ ok: true });
    }

    // action "check" (par défaut) : réconcilie puis renvoie l'état de l'utilisateur
    const credited = await reconcile(admin, networks);

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

    const pendingNetwork = pending ? networks.find((n) => n.id === String(pending.network)) : null;

    return json({
      ok: true,
      networks: publicNetworks(networks),
      pending: pending ? { ...pending, token_symbol: pendingNetwork?.token_symbol ?? "USDT", label: pendingNetwork?.label ?? pending.network } : null,
      last_paid: lastPaid ?? null,
      credited_count: credited.length,
    });
  } catch (e) {
    console.error("crypto-topup error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
