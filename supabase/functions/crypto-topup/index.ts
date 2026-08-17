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

type Chain = "tron" | "solana" | "evm" | "utxo";

type CatalogEntry = {
  label: string;
  token_symbol: string;
  chain: Chain;
  /** "native" ou adresse de contrat / mint SPL */
  contract: string;
  /** id CoinGecko pour le taux live */
  coingecko: string;
  /** décimales utilisées pour rendre le montant unique */
  uniq: number;
  /** groupe d'adresse : tous les réseaux d'un même groupe partagent la même adresse de réception */
  group: "tron" | "solana" | "evm" | "btc" | "ltc" | "doge" | "bch";
  /** chaîne EVM (chainid Etherscan v2 + instance Blockscout) */
  evm?: { chainId: number; blockscout?: string };
  /** chaîne UTXO Blockchair */
  utxo?: string;
  sort_order: number;
};

/** Catalogue des réseaux supportés (les adresses viennent du panel admin). */
const CATALOG: Record<string, CatalogEntry> = {
  // --- TRON ---
  TRC20: { label: "USDT · TRON (TRC20)", token_symbol: "USDT", chain: "tron", contract: USDT_TRC20_CONTRACT, coingecko: "tether", uniq: 2, group: "tron", sort_order: 1 },
  TRXNATIVE: { label: "TRX · TRON", token_symbol: "TRX", chain: "tron", contract: "native", coingecko: "tron", uniq: 2, group: "tron", sort_order: 2 },
  // --- SOLANA ---
  SOL: { label: "USDC · Solana (SPL)", token_symbol: "USDC", chain: "solana", contract: USDC_SPL_MINT, coingecko: "usd-coin", uniq: 2, group: "solana", sort_order: 3 },
  SOLUSDT: { label: "USDT · Solana (SPL)", token_symbol: "USDT", chain: "solana", contract: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", coingecko: "tether", uniq: 2, group: "solana", sort_order: 4 },
  SOLNATIVE: { label: "SOL · Solana", token_symbol: "SOL", chain: "solana", contract: "native", coingecko: "solana", uniq: 4, group: "solana", sort_order: 5 },
  // --- ETHEREUM ---
  ETH: { label: "ETH · Ethereum", token_symbol: "ETH", chain: "evm", contract: "native", coingecko: "ethereum", uniq: 5, group: "evm", evm: { chainId: 1, blockscout: "https://eth.blockscout.com" }, sort_order: 6 },
  ETHUSDT: { label: "USDT · Ethereum (ERC20)", token_symbol: "USDT", chain: "evm", contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", coingecko: "tether", uniq: 2, group: "evm", evm: { chainId: 1, blockscout: "https://eth.blockscout.com" }, sort_order: 7 },
  ETHUSDC: { label: "USDC · Ethereum (ERC20)", token_symbol: "USDC", chain: "evm", contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", coingecko: "usd-coin", uniq: 2, group: "evm", evm: { chainId: 1, blockscout: "https://eth.blockscout.com" }, sort_order: 8 },
  // --- BNB CHAIN ---
  BNB: { label: "BNB · BNB Chain", token_symbol: "BNB", chain: "evm", contract: "native", coingecko: "binancecoin", uniq: 4, group: "evm", evm: { chainId: 56 }, sort_order: 9 },
  BSCUSDT: { label: "USDT · BNB Chain (BEP20)", token_symbol: "USDT", chain: "evm", contract: "0x55d398326f99059ff775485246999027b3197955", coingecko: "tether", uniq: 2, group: "evm", evm: { chainId: 56 }, sort_order: 10 },
  // --- BASE ---
  BASEETH: { label: "ETH · Base", token_symbol: "ETH", chain: "evm", contract: "native", coingecko: "ethereum", uniq: 5, group: "evm", evm: { chainId: 8453, blockscout: "https://base.blockscout.com" }, sort_order: 11 },
  BASEUSDC: { label: "USDC · Base", token_symbol: "USDC", chain: "evm", contract: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", coingecko: "usd-coin", uniq: 2, group: "evm", evm: { chainId: 8453, blockscout: "https://base.blockscout.com" }, sort_order: 12 },
  // --- ARBITRUM / OPTIMISM / POLYGON / AVALANCHE ---
  ARBETH: { label: "ETH · Arbitrum", token_symbol: "ETH", chain: "evm", contract: "native", coingecko: "ethereum", uniq: 5, group: "evm", evm: { chainId: 42161, blockscout: "https://arbitrum.blockscout.com" }, sort_order: 13 },
  ARBUSDT: { label: "USDT · Arbitrum", token_symbol: "USDT", chain: "evm", contract: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", coingecko: "tether", uniq: 2, group: "evm", evm: { chainId: 42161, blockscout: "https://arbitrum.blockscout.com" }, sort_order: 14 },
  OPETH: { label: "ETH · Optimism", token_symbol: "ETH", chain: "evm", contract: "native", coingecko: "ethereum", uniq: 5, group: "evm", evm: { chainId: 10, blockscout: "https://optimism.blockscout.com" }, sort_order: 15 },
  POLNATIVE: { label: "POL · Polygon", token_symbol: "POL", chain: "evm", contract: "native", coingecko: "matic-network", uniq: 3, group: "evm", evm: { chainId: 137, blockscout: "https://polygon.blockscout.com" }, sort_order: 16 },
  POLUSDT: { label: "USDT · Polygon", token_symbol: "USDT", chain: "evm", contract: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", coingecko: "tether", uniq: 2, group: "evm", evm: { chainId: 137, blockscout: "https://polygon.blockscout.com" }, sort_order: 17 },
  AVAX: { label: "AVAX · Avalanche C-Chain", token_symbol: "AVAX", chain: "evm", contract: "native", coingecko: "avalanche-2", uniq: 4, group: "evm", evm: { chainId: 43114 }, sort_order: 18 },
  // --- UTXO ---
  BTC: { label: "BTC · Bitcoin", token_symbol: "BTC", chain: "utxo", contract: "native", coingecko: "bitcoin", uniq: 6, group: "btc", utxo: "bitcoin", sort_order: 19 },
  LTC: { label: "LTC · Litecoin", token_symbol: "LTC", chain: "utxo", contract: "native", coingecko: "litecoin", uniq: 4, group: "ltc", utxo: "litecoin", sort_order: 20 },
  DOGE: { label: "DOGE · Dogecoin", token_symbol: "DOGE", chain: "utxo", contract: "native", coingecko: "dogecoin", uniq: 2, group: "doge", utxo: "dogecoin", sort_order: 21 },
  BCH: { label: "BCH · Bitcoin Cash", token_symbol: "BCH", chain: "utxo", contract: "native", coingecko: "bitcoin-cash", uniq: 5, group: "bch", utxo: "bitcoin-cash", sort_order: 22 },
};

type NetworkConfig = {
  id: string;
  label: string;
  token_symbol: string;
  address: string;
  contract: string;
  rate_eur: number;
  enabled: boolean;
  sort_order: number;
  meta: CatalogEntry;
};

/** true si le réseau reçoit la crypto native (SOL, ETH, BTC…) et non un token. */
const isNative = (n: { contract?: string | null }) =>
  String(n.contract ?? "").trim().toLowerCase() === "native";

/** décimales utilisées pour rendre le montant unique (matching). */
const tokenDecimals = (n: NetworkConfig) => n.meta?.uniq ?? (isNative(n) ? 4 : 2);

type Transfer = { tx_hash: string; amount: number; timestamp: number };

const envAddress = (group: CatalogEntry["group"]) => {
  const keys: Record<string, string[]> = {
    tron: ["TRON_USDT_ADDRESS", "TRON_ADDRESS"],
    solana: ["SOLANA_ADDRESS"],
    evm: ["EVM_ADDRESS", "ETH_ADDRESS"],
    btc: ["BTC_ADDRESS"],
    ltc: ["LTC_ADDRESS"],
    doge: ["DOGE_ADDRESS"],
    bch: ["BCH_ADDRESS"],
  };
  for (const key of keys[group] ?? []) {
    const v = (Deno.env.get(key) ?? "").trim();
    if (v) return v;
  }
  return "";
};

/** Config des réseaux : table crypto_networks (panel admin) + catalogue intégré. */
async function loadNetworks(admin: Admin): Promise<NetworkConfig[]> {
  const { data } = await admin
    .from("crypto_networks")
    .select("id, label, token_symbol, address, contract, rate_eur, enabled, sort_order")
    .order("sort_order", { ascending: true });

  const rows = (data ?? []) as Array<Partial<NetworkConfig> & { id: string }>;
  const byId = new Map(rows.map((r) => [String(r.id), r]));

  // adresses saisies dans l'admin, partagées par groupe (une adresse EVM sert à toutes les chaînes EVM)
  const groupAddress = new Map<string, string>();
  for (const row of rows) {
    const meta = CATALOG[String(row.id)];
    const addr = String(row.address ?? "").trim();
    if (meta && addr && !groupAddress.has(meta.group)) groupAddress.set(meta.group, addr);
  }

  const ids = new Set<string>([...Object.keys(CATALOG), ...byId.keys()]);

  return [...ids]
    .map((id) => {
      const meta: CatalogEntry = CATALOG[id] ?? {
        label: id,
        token_symbol: "USDT",
        chain: "tron",
        contract: USDT_TRC20_CONTRACT,
        coingecko: "tether",
        uniq: 2,
        group: "tron",
        sort_order: 99,
      };
      const row = byId.get(id);
      const address =
        String(row?.address ?? "").trim() || groupAddress.get(meta.group) || envAddress(meta.group);
      const contract = meta.contract === "native"
        ? "native"
        : String(row?.contract ?? "").trim() || meta.contract;

      return {
        id,
        label: String(row?.label ?? meta.label),
        token_symbol: String(row?.token_symbol ?? meta.token_symbol),
        address,
        contract,
        rate_eur: Number(row?.rate_eur) > 0 ? Number(row?.rate_eur) : 0,
        enabled: row ? Boolean(row.enabled) : false,
        sort_order: Number(row?.sort_order ?? meta.sort_order),
        meta,
      } as NetworkConfig;
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Taux (nombre de tokens pour 1 €). Taux fixe possible pour les stablecoins. */
async function liveRateEur(network: NetworkConfig): Promise<number> {
  if (!isNative(network) && Number(network.rate_eur) > 0) return Number(network.rate_eur);
  const coin = network.meta?.coingecko ?? "tether";
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

/** Exécute plusieurs appels Solana en une requête pour éviter le rate-limit du RPC public. */
async function solanaRpcBatch(method: string, paramsList: unknown[][]) {
  if (!paramsList.length) return [];
  const rpc = Deno.env.get("SOLANA_RPC_URL")?.trim() || "https://api.mainnet-beta.solana.com";
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paramsList.map((params, index) => ({
      jsonrpc: "2.0",
      id: index + 1,
      method,
      params,
    }))),
  });
  if (!res.ok) throw new Error(`Solana RPC batch ${res.status}`);
  const payload = await res.json();
  if (!Array.isArray(payload)) throw new Error("Solana RPC batch invalide");
  const byId = new Map(payload.map((row) => [Number(row?.id), row]));
  return paramsList.map((_, index) => {
    const row = byId.get(index + 1);
    if (row?.error) {
      console.error("Solana RPC batch item failed", row.error);
      return null;
    }
    return row?.result ?? null;
  });
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
    const sigs = await solanaRpc("getSignaturesForAddress", [
      ata,
      { limit: 25, commitment: "confirmed" },
    ]);
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
  const sigs = await solanaRpc("getSignaturesForAddress", [
    owner,
    { limit: 25, commitment: "confirmed" },
  ]);
  const list = Array.isArray(sigs) ? sigs : [];
  const transfers: Transfer[] = [];

  const validSignatures = list.filter((sig) => !sig?.err && Boolean(sig?.signature));
  const transactions = await solanaRpcBatch(
    "getTransaction",
    validSignatures.map((sig) => [
      String(sig.signature),
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ]),
  );

  for (let index = 0; index < validSignatures.length; index += 1) {
    const sig = validSignatures[index];
    const signature = String(sig.signature);
    const tx = transactions[index];
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

/** Transferts TRX natifs entrants. */
async function fetchTronNativeTransfers(address: string): Promise<Transfer[]> {
  const url = new URL(`https://api.trongrid.io/v1/accounts/${address}/transactions`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("only_to", "true");
  const headers: Record<string, string> = {};
  const apiKey = Deno.env.get("TRONGRID_API_KEY");
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`TronGrid ${res.status}`);
  const payload = await res.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const out: Transfer[] = [];
  for (const row of rows) {
    const c = row?.raw_data?.contract?.[0];
    if (c?.type !== "TransferContract") continue;
    const value = Number(c?.parameter?.value?.amount ?? 0);
    if (value <= 0) continue;
    out.push({
      tx_hash: String(row?.txID ?? ""),
      amount: value / 1_000_000,
      timestamp: Number(row?.block_timestamp ?? 0),
    });
  }
  return out.filter((t) => Boolean(t.tx_hash));
}

/** Transferts EVM entrants (natif ou ERC20) via Etherscan v2 (clé) ou Blockscout (public). */
async function fetchEvmTransfers(network: NetworkConfig): Promise<Transfer[]> {
  const meta = network.meta;
  const address = network.address.toLowerCase();
  const native = isNative(network);
  const action = native ? "txlist" : "tokentx";
  const key = (Deno.env.get("ETHERSCAN_API_KEY") ?? "").trim();

  let url: string;
  if (key && meta.evm?.chainId) {
    const u = new URL("https://api.etherscan.io/v2/api");
    u.searchParams.set("chainid", String(meta.evm.chainId));
    u.searchParams.set("module", "account");
    u.searchParams.set("action", action);
    u.searchParams.set("address", network.address);
    if (!native) u.searchParams.set("contractaddress", network.contract);
    u.searchParams.set("sort", "desc");
    u.searchParams.set("page", "1");
    u.searchParams.set("offset", "50");
    u.searchParams.set("apikey", key);
    url = u.toString();
  } else if (meta.evm?.blockscout) {
    const u = new URL(`${meta.evm.blockscout}/api`);
    u.searchParams.set("module", "account");
    u.searchParams.set("action", action);
    u.searchParams.set("address", network.address);
    if (!native) u.searchParams.set("contractaddress", network.contract);
    u.searchParams.set("sort", "desc");
    u.searchParams.set("page", "1");
    u.searchParams.set("offset", "50");
    url = u.toString();
  } else {
    throw new Error(`Aucun explorateur configuré pour ${network.id} (ajoute la clé ETHERSCAN_API_KEY)`);
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Explorer ${network.id} ${res.status}`);
  const payload = await res.json();
  const rows = Array.isArray(payload?.result) ? payload.result : [];

  return rows
    .filter((row: Record<string, unknown>) =>
      String(row?.to ?? "").toLowerCase() === address &&
      String(row?.isError ?? "0") !== "1" &&
      (native || String(row?.contractAddress ?? "").toLowerCase() === network.contract.toLowerCase())
    )
    .map((row: Record<string, unknown>) => {
      const decimals = native ? 18 : Number(row?.tokenDecimal ?? 18);
      return {
        tx_hash: String(row?.hash ?? ""),
        amount: Number(String(row?.value ?? "0")) / Math.pow(10, decimals),
        timestamp: Number(row?.timeStamp ?? 0) * 1000,
      };
    })
    .filter((t: Transfer) => Boolean(t.tx_hash) && t.amount > 0);
}

/** Transferts entrants sur une chaîne UTXO (BTC, LTC, DOGE, BCH) via Blockchair. */
async function fetchUtxoTransfers(network: NetworkConfig): Promise<Transfer[]> {
  const chain = network.meta.utxo ?? "bitcoin";
  const u = new URL(`https://api.blockchair.com/${chain}/dashboards/address/${network.address}`);
  u.searchParams.set("limit", "50");
  const key = (Deno.env.get("BLOCKCHAIR_API_KEY") ?? "").trim();
  if (key) u.searchParams.set("key", key);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`Blockchair ${chain} ${res.status}`);
  const payload = await res.json();
  const data = payload?.data?.[network.address] ?? Object.values(payload?.data ?? {})[0];
  const utxos = Array.isArray((data as { utxo?: unknown[] })?.utxo) ? (data as { utxo: Array<Record<string, unknown>> }).utxo : [];

  return utxos
    .map((o) => ({
      tx_hash: String(o?.transaction_hash ?? ""),
      amount: Number(o?.value ?? 0) / 100_000_000,
      timestamp: Date.parse(String(o?.block_id ? (o?.time ?? "") : (o?.time ?? ""))) || Date.now(),
    }))
    .filter((t) => Boolean(t.tx_hash) && t.amount > 0);
}

async function fetchTransfers(network: NetworkConfig): Promise<Transfer[]> {
  const chain = network.meta.chain;
  if (chain === "solana") {
    return isNative(network)
      ? fetchSolanaNativeTransfers(network.address)
      : fetchSolanaTransfers(network.address, network.contract);
  }
  if (chain === "evm") return fetchEvmTransfers(network);
  if (chain === "utxo") return fetchUtxoTransfers(network);
  return isNative(network)
    ? fetchTronNativeTransfers(network.address)
    : fetchTronTransfers(network.address, network.contract);
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
    // Tolérance : les natifs bougent en prix + arrondis wallet → marge relative
    const tolerance = isNative(network)
      ? Math.max(0.0005, expected * 0.015)
      : Math.max(0.005, expected * 0.005);

    const candidates = transfers.filter((tx) =>
      !usedHashes.has(tx.tx_hash) &&
      tx.timestamp >= createdAt &&
      Math.abs(tx.amount - expected) < tolerance
    );
    // on prend le plus proche du montant attendu
    candidates.sort((a, b) => Math.abs(a.amount - expected) - Math.abs(b.amount - expected));
    const match = candidates[0];
    if (!match) {
      console.log("no match", {
        request: request.id,
        network: networkId,
        expected,
        tolerance,
        seen: transfers.map((t) => ({ a: t.amount, t: t.timestamp })),
      });
      continue;
    }



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

    // Ajoute dans crypto_networks toutes les cryptos du catalogue qui manquent (désactivées par défaut).
    if (action === "seed") {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (isAdmin === false) return json({ error: "Réservé aux admins" }, 403);

      const { data: existing } = await admin.from("crypto_networks").select("id");
      const have = new Set((existing ?? []).map((r: { id: string }) => String(r.id)));
      const rows = Object.entries(CATALOG)
        .filter(([id]) => !have.has(id))
        .map(([id, meta]) => ({
          id,
          label: meta.label,
          token_symbol: meta.token_symbol,
          address: "",
          contract: meta.contract,
          rate_eur: 0,
          enabled: false,
          sort_order: meta.sort_order,
        }));
      if (rows.length) {
        const { error } = await admin.from("crypto_networks").insert(rows);
        if (error) return json({ error: error.message }, 500);
      }
      return json({ ok: true, added: rows.length });
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

      let rate: number;
      try {
        rate = await liveRateEur(network);
      } catch (e) {
        return json({ error: (e as Error).message }, 502);
      }
      const base = amountEur * rate;
      const decimals = tokenDecimals(network);
      const step = Math.pow(10, -decimals);
      const factor = Math.pow(10, decimals);

      // dernières décimales uniques (par réseau) -> identification du payeur
      const { data: activeRows } = await admin
        .from("crypto_payments")
        .select("amount_usdt")
        .eq("status", "pending")
        .eq("network", network.id);
      const taken = new Set((activeRows ?? []).map((r: { amount_usdt: number }) => Number(r.amount_usdt).toFixed(decimals)));

      let amountToken = 0;
      for (let i = 0; i < 100; i += 1) {
        const candidate = +(Math.floor(base * factor) / factor + i * step).toFixed(decimals);
        if (!taken.has(candidate.toFixed(decimals))) {
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
      return json({
        ok: true,
        payment: { ...created, token_symbol: network.token_symbol, label: network.label, decimals },
      });
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
      pending: pending
        ? {
            ...pending,
            token_symbol: pendingNetwork?.token_symbol ?? "USDT",
            label: pendingNetwork?.label ?? pending.network,
            decimals: pendingNetwork ? tokenDecimals(pendingNetwork) : 2,
          }
        : null,

      last_paid: lastPaid ?? null,
      credited_count: credited.length,
    });
  } catch (e) {
    console.error("crypto-topup error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
