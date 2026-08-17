import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Users, Wallet, ShoppingCart, Plus, Minus, Package, Trash2, Calculator, History, AlertCircle, Bitcoin, Crown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SUPABASE_ANON_KEY, SUPABASE_FUNCTIONS_URL, supabase } from "@/lib/supabase";
import { CRYPTO_CATALOG } from "@/lib/cryptoCatalog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MemberRole, ROLE_COLOR_PALETTE, NO_ROLE_VALUE } from "@/lib/memberRoles";

import { toast } from "sonner";

interface CryptoNetworkRow {
  id: string;
  label: string;
  token_symbol: string;
  address: string | null;
  contract: string | null;
  rate_eur: number;
  enabled: boolean;
  sort_order: number;
}
interface AdminProfile {
  id: string;
  display_name: string | null;
  discord_id: string | null;
  avatar_url: string | null;
  status: string;
  is_admin: boolean;
  member_tag: string | null;
  created_at: string;
}
interface CreditReq {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  created_at: string;
  profiles?: { display_name: string | null };
}
interface PaymentRow {
  id: string;
  user_id: string;
  amount: number;
  provider: string;
  status: string;
  created_at: string;
  profiles?: { display_name: string | null };
}
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

interface RevenueShareConfig {
  bot_name: string | null;
  partner_user_id: string | null;
  share_pct: number;
}

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  price_eur: number;
  image_url: string | null;
  active: boolean;
  stock: number | null;
  bonus_credit_eur: number | null;
}


interface WalletRow {
  user_id: string;
  balance: number;
  total_credited: number;
  total_spent: number;
  overdraft_limit_eur?: number;
}

interface RefundRow {
  id: string;
  user_id: string | null;
  user_name: string | null;
  amount_eur: number;
  fee_pct: number;
  fee_eur: number;
  refund_eur: number;
  note: string | null;
  created_at: string;
}

const UNLIMITED_OVERDRAFT = 1000000;

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

  if (looksLikeTicketmaster && hasIsoEventDate && hasCiroStylePlacement) {
    return "CiroAIO";
  }

  return null;
};

const Admin = () => {
  const [users, setUsers] = useState<AdminProfile[]>([]);
  const [credits, setCredits] = useState<CreditReq[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [wallets, setWallets] = useState<Record<string, WalletRow>>({});
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [creditAmount, setCreditAmount] = useState<Record<string, number>>({});
  const [newProd, setNewProd] = useState({ name: "", description: "", price_eur: 0, image_url: "", stock: "", bonus_credit_eur: "" });
  const [refundForm, setRefundForm] = useState({ user_id: "", amount: "", note: "" });
  const [shareConfig, setShareConfig] = useState<RevenueShareConfig>({ bot_name: "", partner_user_id: "", share_pct: 50 });
  const [shareConfigDraft, setShareConfigDraft] = useState<RevenueShareConfig>({ bot_name: "", partner_user_id: "", share_pct: 50 });
  const [sharedPurchases, setSharedPurchases] = useState<PurchaseRow[]>([]);
  const [historyUser, setHistoryUser] = useState<AdminProfile | null>(null);
  const [historyPurchases, setHistoryPurchases] = useState<PurchaseRow[]>([]);
  const [historyProducts, setHistoryProducts] = useState<{ id: string; product_name: string; quantity: number; total_eur: number; price_eur: number; status: string; created_at: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [overdraftDraft, setOverdraftDraft] = useState<Record<string, string>>({});
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseRow | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; product_name: string; quantity: number; total_eur: number; price_eur: number; status: string; created_at: string } | null>(null);
  const [cryptoNetworks, setCryptoNetworks] = useState<CryptoNetworkRow[]>([]);
  const [networkDraft, setNetworkDraft] = useState<Record<string, { address?: string; contract?: string; rate_eur?: string }>>({});

  const loadNetworks = async () => {
    const { data } = await supabase
      .from("crypto_networks")
      .select("id, label, token_symbol, address, contract, rate_eur, enabled, sort_order")
      .order("sort_order", { ascending: true });
    setCryptoNetworks((data ?? []) as CryptoNetworkRow[]);
  };

  const [seeding, setSeeding] = useState(false);

  const seedNetworks = async () => {
    setSeeding(true);
    try {
      const { data: existing, error: readErr } = await supabase.from("crypto_networks").select("id");
      if (readErr) {
        toast.error(readErr.message);
        return;
      }
      const have = new Set((existing ?? []).map((r: { id: string }) => String(r.id)));
      const rows = CRYPTO_CATALOG.filter((c) => !have.has(c.id)).map((c) => ({
        id: c.id,
        label: c.label,
        token_symbol: c.token_symbol,
        address: "",
        contract: c.contract,
        rate_eur: 0,
        enabled: false,
        sort_order: c.sort_order,
      }));

      if (!rows.length) {
        toast.success("Toutes les cryptos sont déjà présentes");
        return;
      }

      const { error } = await supabase.from("crypto_networks").insert(rows);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`${rows.length} crypto(s) ajoutée(s)`);
      loadNetworks();
    } finally {
      setSeeding(false);
    }
  };


  const saveNetwork = async (id: string, patch: Partial<CryptoNetworkRow>) => {
    const { error } = await supabase
      .from("crypto_networks")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Réseau mis à jour");
    loadNetworks();
  };



  const [roles, setRoles] = useState<MemberRole[]>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleColor, setNewRoleColor] = useState(ROLE_COLOR_PALETTE[0]);

  const loadRoles = async () => {
    const { data, error } = await supabase.from("member_roles").select("*").order("sort_order", { ascending: true });
    if (error) { setRolesError(error.message); setRoles([]); return; }
    setRolesError(null);
    setRoles((data ?? []) as MemberRole[]);
  };

  const createRole = async () => {
    const name = newRoleName.trim();
    if (!name) return toast.error("Donne un nom au rôle");
    const { error } = await supabase.from("member_roles").insert({ name, color: newRoleColor, sort_order: roles.length });
    if (error) return toast.error(error.message);
    setNewRoleName("");
    toast.success(`Rôle ${name} créé`);
    loadRoles();
  };

  const updateRole = async (id: string, patch: Partial<MemberRole>) => {
    const { error } = await supabase.from("member_roles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const renameRole = async (role: MemberRole, nextName: string) => {
    const name = nextName.trim();
    if (!name || name === role.name) return;
    const { error } = await supabase.from("member_roles").update({ name, updated_at: new Date().toISOString() }).eq("id", role.id);
    if (error) return toast.error(error.message);
    await supabase.from("profiles").update({ member_tag: name }).eq("member_tag", role.name);
    toast.success("Rôle renommé");
    loadRoles();
    load();
  };

  const deleteRole = async (role: MemberRole) => {
    if (!confirm(`Supprimer le rôle ${role.name} ? Il sera retiré des membres concernés.`)) return;
    const { error } = await supabase.from("member_roles").delete().eq("id", role.id);
    if (error) return toast.error(error.message);
    await supabase.from("profiles").update({ member_tag: null }).eq("member_tag", role.name);
    toast.success("Rôle supprimé");
    loadRoles();
    load();
  };

  const assignRole = async (userId: string, value: string) => {
    const newTag = value === NO_ROLE_VALUE ? null : value;
    const { error } = await supabase.from("profiles").update({ member_tag: newTag }).eq("id", userId);
    if (error) return toast.error(error.message);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, member_tag: newTag } : u)));
    toast.success(newTag ? `Rôle ${newTag} attribué` : "Rôle retiré");
  };

  const load = async () => {
    const [u, c, p, pu, pr, w, rf, sc] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("credit_requests").select("*, profiles(display_name)").order("created_at", { ascending: false }),
      supabase.from("payments").select("*, profiles(display_name)").order("created_at", { ascending: false }).limit(50),
      supabase.from("purchases").select("*, profiles(display_name)").order("created_at", { ascending: false }).limit(50),
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("wallets").select("user_id, balance, total_credited, total_spent, overdraft_limit_eur"),
      supabase.from("refunds").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("revenue_share_config").select("bot_name, partner_user_id, share_pct").maybeSingle(),
    ]);
    setUsers((u.data ?? []) as AdminProfile[]);
    setCredits((c.data ?? []) as CreditReq[]);
    setPayments((p.data ?? []) as PaymentRow[]);
    setPurchases((pu.data ?? []) as PurchaseRow[]);
    setProducts((pr.data ?? []) as ProductRow[]);
    const wMap: Record<string, WalletRow> = {};
    ((w.data ?? []) as WalletRow[]).forEach((row) => { wMap[row.user_id] = row; });
    setWallets(wMap);
    setRefunds((rf.data ?? []) as RefundRow[]);
    const cfg = (sc.data ?? { bot_name: "", partner_user_id: "", share_pct: 50 }) as RevenueShareConfig;
    setShareConfig(cfg);
    setShareConfigDraft({ bot_name: cfg.bot_name ?? "", partner_user_id: cfg.partner_user_id ?? "", share_pct: cfg.share_pct ?? 50 });

    // Load all purchases matching the configured bot (separate query, no limit on filter)
    if (cfg.bot_name) {
      const { data: sp } = await supabase
        .from("purchases")
        .select("*, profiles(display_name)")
        .order("created_at", { ascending: false });
      setSharedPurchases(((sp ?? []) as PurchaseRow[]).filter((purchase) => matchesBotName(inferPurchaseBot(purchase), cfg.bot_name)));
    } else {
      setSharedPurchases([]);
    }
  };

  useEffect(() => {
    load();
    loadNetworks();
    loadRoles();
    // Realtime subscription on wallets so balances update live
    const channel = supabase
      .channel("admin-wallets")
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets" }, (payload) => {
        const row = (payload.new ?? payload.old) as WalletRow | undefined;
        if (!row?.user_id) return;
        setWallets((prev) => ({ ...prev, [row.user_id]: { ...prev[row.user_id], ...(payload.new as WalletRow) } }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const createProduct = async () => {
    if (!newProd.name || newProd.price_eur <= 0) return toast.error("Nom et prix requis");
    const { error } = await supabase.from("products").insert({
      name: newProd.name,
      description: newProd.description || null,
      price_eur: newProd.price_eur,
      image_url: newProd.image_url || null,
      stock: newProd.stock === "" ? null : Number(newProd.stock),
      bonus_credit_eur: newProd.bonus_credit_eur === "" ? 0 : Number(newProd.bonus_credit_eur),
      active: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Produit créé");
    setNewProd({ name: "", description: "", price_eur: 0, image_url: "", stock: "", bonus_credit_eur: "" });
    load();
  };


  const toggleProduct = async (id: string, active: boolean) => {
    const { error } = await supabase.from("products").update({ active }).eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Supprimer ce produit ?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Supprimé"); load(); }
  };

  const setStatus = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Compte ${status === "approved" ? "approuvé" : "refusé"}`);
    // Notifie l'utilisateur via DM Discord (best effort)
    supabase.functions.invoke("notify-status", { body: { user_id: id, status } })
      .then(({ error: e }) => { if (e) console.error("notify-status", e); });
    load();
  };

  const adjustCredit = async (userId: string, sign: 1 | -1) => {
    const raw = creditAmount[userId];
    if (!raw || raw <= 0) return toast.error("Montant invalide");
    const amount = raw * sign;
    const { data, error } = await supabase.functions.invoke("admin-credit", {
      body: { user_id: userId, amount, note: sign > 0 ? "Crédit manuel admin" : "Retrait manuel admin" },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data?.error) {
      toast.error(data.error);
      return;
    }
    toast.success(sign > 0 ? `+${raw} q crédité` : `-${raw} q retiré`);
    if (data?.notification_sent === false && data?.notification_error) {
      toast.error(`Webhook Discord en erreur: ${data.notification_error}`);
    }
    setCreditAmount((s) => ({ ...s, [userId]: 0 }));
    load();
  };

  const handleCreditReq = async (id: string, approve: boolean) => {
    const { data, error } = await supabase.functions.invoke("admin-process-credit", {
      body: { request_id: id, approve },
    });
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);

    toast.success(approve ? "Crédit ajouté" : "Demande refusée");
    if (data?.notification_sent === false) {
      toast.error(`Webhook Discord en erreur: ${data?.notification_error || "erreur inconnue"}`);
    }
    load();
  };

  const createRefund = async () => {
    const userId = refundForm.user_id;
    const amount = Number(refundForm.amount);
    if (!userId) return toast.error("Sélectionne un utilisateur");
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Montant invalide");
    const fee_pct = 3;
    const fee_eur = +(amount * fee_pct / 100).toFixed(2);
    const refund_eur = +(amount - fee_eur).toFixed(2);
    const user = users.find((x) => x.id === userId);
    const { error } = await supabase.from("refunds").insert({
      user_id: userId,
      user_name: user?.display_name ?? null,
      amount_eur: amount,
      fee_pct,
      fee_eur,
      refund_eur,
      note: refundForm.note || null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Remboursement enregistré : ${refund_eur.toFixed(2)} €`);
    setRefundForm({ user_id: "", amount: "", note: "" });
    load();
  };

  const deleteRefund = async (id: string) => {
    if (!confirm("Supprimer cette ligne ?")) return;
    const { error } = await supabase.from("refunds").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  const saveShareConfig = async () => {
    const payload = {
      id: true,
      bot_name: shareConfigDraft.bot_name?.trim() || null,
      partner_user_id: shareConfigDraft.partner_user_id || null,
      share_pct: Number(shareConfigDraft.share_pct) || 50,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("revenue_share_config").upsert(payload, { onConflict: "id" });
    if (error) return toast.error(error.message);
    toast.success("Config partage sauvegardée");
    load();
  };

  const assignPurchaseToTrackedBot = async (purchaseId: string) => {
    if (!shareConfig.bot_name) return toast.error("Configure d'abord le bot suivi dans l'onglet Partage");
    const { error } = await supabase.functions.invoke("admin-tag-purchase-bot", {
      body: { purchase_id: purchaseId, source_bot: shareConfig.bot_name },
    });
    if (error) return toast.error(error.message);
    toast.success("Panier ajouté au partage");
    load();
  };

  const openHistory = async (user: AdminProfile) => {
    setHistoryUser(user);
    setHistoryLoading(true);
    setHistoryPurchases([]);
    setHistoryProducts([]);
    const [pu, pp] = await Promise.all([
      supabase.from("purchases").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("product_purchases").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    setHistoryPurchases((pu.data ?? []) as PurchaseRow[]);
    setHistoryProducts((pp.data ?? []) as any[]);
    setHistoryLoading(false);
  };

  const deleteHistoryItem = async (id: string, kind: "purchase" | "product", label: string) => {
    if (!confirm(`Supprimer "${label}" et recréditer le solde ?`)) return;
    const { data, error } = await supabase.functions.invoke("admin-delete-purchase", {
      body: { purchase_id: id, kind, refund: true },
    });
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    toast.success("Supprimé et solde recrédité");
    if (kind === "purchase") {
      setHistoryPurchases((s) => s.filter((p) => p.id !== id));
      setSelectedPurchase(null);
    } else {
      setHistoryProducts((s) => s.filter((p) => p.id !== id));
      setSelectedProduct(null);
    }
    load();
  };

  const applyOverdraft = async (userId: string, value: number) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (sessionError || !accessToken) return toast.error("Session admin expirée, reconnecte-toi");

    let response: Response;
    try {
      response = await fetch(`${SUPABASE_FUNCTIONS_URL}/admin-set-overdraft`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId, overdraft_limit_eur: value }),
      });
    } catch {
      return toast.error("Impossible de joindre le serveur");
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.error) {
      return toast.error(result?.error ?? `Erreur serveur (${response.status})`);
    }
    // Mise à jour optimiste immédiate de l'encoche
    setWallets((s) => ({
      ...s,
      [userId]: { ...(s[userId] ?? { user_id: userId, balance: 0, total_credited: 0, total_spent: 0 }), overdraft_limit_eur: value } as WalletRow,
    }));
    toast.success(
      value >= UNLIMITED_OVERDRAFT
        ? "Découvert illimité activé"
        : `Découvert défini à ${value.toFixed(2)} €`
    );
    setOverdraftDraft((s) => ({ ...s, [userId]: "" }));
    load();
  };

  const saveOverdraft = async (userId: string) => {
    const raw = overdraftDraft[userId];
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return toast.error("Valeur invalide (≥ 0)");
    await applyOverdraft(userId, value);
  };

  const toggleUnlimitedOverdraft = async (userId: string, next: boolean) => {
    await applyOverdraft(userId, next ? UNLIMITED_OVERDRAFT : 0);
  };

  const pending = users.filter((u) => u.status === "pending");
  const rejectedUsers = users.filter((u) => u.status === "rejected");
  const refundPreview = (() => {
    const amount = Number(refundForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const fee = +(amount * 0.03).toFixed(2);
    return { fee, refund: +(amount - fee).toFixed(2) };
  })();
  const totalRefunded = refunds.reduce((sum, r) => sum + Number(r.refund_eur), 0);
  const totalFees = refunds.reduce((sum, r) => sum + Number(r.fee_eur), 0);

  const sharePct = Number(shareConfig.share_pct ?? 50);
  const partner = users.find((u) => u.id === shareConfig.partner_user_id);
  const totalCommissionShared = sharedPurchases.reduce((s, p) => s + Number(p.commission ?? 0), 0);
  const totalDueToPartner = +(totalCommissionShared * sharePct / 100).toFixed(2);

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Panel <span className="text-gradient-accent">Admin</span>
        </h1>
        <p className="mt-1 text-muted-foreground">Gère les utilisateurs, crédits et paiements.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-card p-4"><div className="text-sm text-muted-foreground">Utilisateurs</div><div className="mt-1 text-2xl font-bold">{users.length}</div></Card>
        <Card className="glass-card p-4"><div className="text-sm text-muted-foreground">En attente</div><div className="mt-1 text-2xl font-bold text-warning">{pending.length}</div></Card>
        <Card className="glass-card p-4"><div className="text-sm text-muted-foreground">Demandes crédit</div><div className="mt-1 text-2xl font-bold text-primary">{credits.filter(c=>c.status==='pending').length}</div></Card>
        <Card className="glass-card p-4"><div className="text-sm text-muted-foreground">Paiements 50 derniers</div><div className="mt-1 text-2xl font-bold">{payments.length}</div></Card>
      </div>

      <Tabs defaultValue="approvals" className="mt-8">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-10">
          <TabsTrigger value="approvals">Approbations ({pending.length})</TabsTrigger>
          <TabsTrigger value="users"><Users className="mr-1 h-4 w-4" />Utilisateurs</TabsTrigger>
          <TabsTrigger value="credits"><Wallet className="mr-1 h-4 w-4" />Crédits</TabsTrigger>
          <TabsTrigger value="products"><Package className="mr-1 h-4 w-4" />Produits</TabsTrigger>
          <TabsTrigger value="payments">Paiements</TabsTrigger>
          <TabsTrigger value="purchases"><ShoppingCart className="mr-1 h-4 w-4" />Achats</TabsTrigger>
          <TabsTrigger value="accounting"><Calculator className="mr-1 h-4 w-4" />Comptabilité</TabsTrigger>
          <TabsTrigger value="share"><Share2 className="mr-1 h-4 w-4" />Partage</TabsTrigger>
          <TabsTrigger value="roles"><Crown className="mr-1 h-4 w-4" />Rôles</TabsTrigger>
          <TabsTrigger value="crypto"><Bitcoin className="mr-1 h-4 w-4" />Crypto</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="mt-4">
          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold">Rôles des membres</h3>
            <p className="mt-1 text-sm text-muted-foreground">Crée, renomme, colore ou supprime les rôles affichés sur les profils.</p>

            {rolesError && (
              <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                Impossible de charger les rôles : {rolesError}
              </div>
            )}

            <div className="mt-5 space-y-4">
              {roles.map((role) => (
                <div key={role.id} className="flex flex-wrap items-center gap-3 border-b border-border/40 pb-4 last:border-0">
                  <Badge className="border-0 text-white" style={{ backgroundColor: role.color }}>{role.name}</Badge>
                  <Input
                    defaultValue={role.name}
                    onBlur={(e) => renameRole(role, e.target.value)}
                    className="h-8 w-40 text-xs"
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    {ROLE_COLOR_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Couleur ${c}`}
                        onClick={() => updateRole(role.id, { color: c })}
                        className={`h-6 w-6 rounded-full border-2 transition ${role.color === c ? "border-foreground" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <Input
                      type="color"
                      value={role.color}
                      onChange={(e) => updateRole(role.id, { color: e.target.value })}
                      className="h-7 w-10 cursor-pointer p-1"
                    />
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => deleteRole(role)}>
                    <Trash2 className="mr-1 h-4 w-4" />Supprimer
                  </Button>
                </div>
              ))}
              {roles.length === 0 && !rolesError && (
                <p className="text-sm text-muted-foreground">Aucun rôle pour le moment.</p>
              )}
            </div>

            <div className="mt-6 rounded-lg border border-border/60 p-4">
              <Label className="text-sm">Nouveau rôle</Label>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Input
                  placeholder="Nom du rôle (ex: VIP)"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="h-9 w-48"
                />
                <div className="flex flex-wrap items-center gap-1">
                  {ROLE_COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Couleur ${c}`}
                      onClick={() => setNewRoleColor(c)}
                      className={`h-6 w-6 rounded-full border-2 transition ${newRoleColor === c ? "border-foreground" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <Input
                    type="color"
                    value={newRoleColor}
                    onChange={(e) => setNewRoleColor(e.target.value)}
                    className="h-7 w-10 cursor-pointer p-1"
                  />
                </div>
                <Button size="sm" onClick={createRole}><Plus className="mr-1 h-4 w-4" />Créer</Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="crypto" className="mt-4">
          <Card className="glass-card p-6">
            <h3 className="font-semibold">Devises crypto affichées sur la page Crédit</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Active ou désactive chaque réseau. Si aucun n'est activé, la section crypto est masquée pour les utilisateurs.
              Si un seul est activé, il n'y a pas de sélecteur de devise. Une seule adresse suffit par famille de chaîne :
              une adresse EVM couvre ETH / BNB / Base / Arbitrum / Optimism / Polygon / Avalanche, une adresse Solana couvre SOL + USDC/USDT SPL,
              une adresse TRON couvre TRX + USDT TRC20. Laisse le taux à 0 pour utiliser le prix live du marché.
            </p>
            <Button className="mt-3" size="sm" variant="outline" onClick={seedNetworks} disabled={seeding}>
              {seeding ? "Ajout en cours…" : "Ajouter toutes les cryptos disponibles"}
            </Button>


            {cryptoNetworks.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Aucun réseau configuré (table <code>crypto_networks</code> manquante ou vide).
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {cryptoNetworks.map((n) => (
                  <div key={n.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{n.label}</div>
                        <div className="text-xs text-muted-foreground">{n.id} · {n.token_symbol}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">{n.enabled ? "Affiché" : "Masqué"}</Label>
                        <Switch checked={n.enabled} onCheckedChange={(v) => saveNetwork(n.id, { enabled: v })} />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div>
                        <Label className="text-xs">Adresse de réception</Label>
                        <Input
                          className="mt-1"
                          value={networkDraft[n.id]?.address ?? n.address ?? ""}
                          onChange={(e) => setNetworkDraft((p) => ({ ...p, [n.id]: { ...p[n.id], address: e.target.value } }))}
                          placeholder="Adresse de réception (identique pour toute la famille de chaîne)"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Contrat / mint du token</Label>
                        <Input
                          className="mt-1"
                          value={networkDraft[n.id]?.contract ?? n.contract ?? ""}
                          onChange={(e) => setNetworkDraft((p) => ({ ...p, [n.id]: { ...p[n.id], contract: e.target.value } }))}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Taux (1 € = X {n.token_symbol})</Label>
                        <Input
                          className="mt-1"
                          type="number"
                          step="0.01"
                          value={networkDraft[n.id]?.rate_eur ?? String(n.rate_eur ?? "")}
                          onChange={(e) => setNetworkDraft((p) => ({ ...p, [n.id]: { ...p[n.id], rate_eur: e.target.value } }))}
                        />
                      </div>
                    </div>
                    <Button
                      className="mt-3"
                      size="sm"
                      onClick={() => saveNetwork(n.id, {
                        address: networkDraft[n.id]?.address ?? n.address ?? "",
                        contract: networkDraft[n.id]?.contract ?? n.contract ?? "",
                        rate_eur: Number(networkDraft[n.id]?.rate_eur ?? n.rate_eur) || 0,
                      })}
                    >
                      Enregistrer
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>


        <TabsContent value="approvals" className="mt-4">
          <Card className="glass-card p-6">
            {pending.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Aucun compte en attente.</div>
            ) : pending.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 py-3 last:border-0">
                <div className="flex items-center gap-3">
                  {u.avatar_url && <img src={u.avatar_url} className="h-10 w-10 rounded-full" alt="" />}
                  <div>
                    <div className="font-medium">{u.display_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">Discord: {u.discord_id ?? "—"} • {new Date(u.created_at).toLocaleString("fr-FR")}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setStatus(u.id, "approved")} className="bg-success hover:bg-success/90"><Check className="mr-1 h-4 w-4" />Approuver</Button>
                  <Button size="sm" variant="destructive" onClick={() => setStatus(u.id, "rejected")}><X className="mr-1 h-4 w-4" />Refuser</Button>
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card className="glass-card p-6">
            {users.filter((u) => u.status !== "rejected").map((u) => {
              const w = wallets[u.id];
              return (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 py-3 last:border-0">
                <div className="flex items-center gap-3">
                  {u.avatar_url && <img src={u.avatar_url} className="h-10 w-10 rounded-full" alt="" />}
                  <div>
                    <div className="font-medium">{u.display_name ?? "—"} {u.is_admin && <Badge className="ml-1 bg-accent text-accent-foreground">Admin</Badge>} {u.member_tag && <Badge className="ml-1 border-0 text-white" style={{ backgroundColor: roles.find((r) => r.name === u.member_tag)?.color ?? "#7c3aed" }}>{u.member_tag}</Badge>}</div>
                    <div className="text-xs text-muted-foreground">Discord: {u.discord_id ?? "—"}</div>
                    <div className="mt-1 text-xs">
                      <span className="font-semibold text-primary">Solde : {Number(w?.balance ?? 0).toFixed(2)} q</span>
                      <span className="ml-2 text-muted-foreground">(crédité {Number(w?.total_credited ?? 0).toFixed(2)} • dépensé {Number(w?.total_spent ?? 0).toFixed(2)})</span>
                      {Number(w?.overdraft_limit_eur ?? 0) >= UNLIMITED_OVERDRAFT ? (
                        <span className="ml-2 text-warning">• découvert illimité</span>
                      ) : Number(w?.overdraft_limit_eur ?? 0) > 0 ? (
                        <span className="ml-2 text-warning">• découvert {Number(w?.overdraft_limit_eur).toFixed(2)} €</span>
                      ) : null}
                      {Number(w?.balance ?? 0) < 0 && (
                        <span className="ml-2 text-destructive">• doit créditer {Math.abs(Number(w?.balance ?? 0)).toFixed(2)} €</span>
                      )}

                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={u.status === "approved" ? "default" : "secondary"}>{u.status}</Badge>
                  <Input
                    type="number"
                    placeholder="€"
                    value={creditAmount[u.id] ?? ""}
                    onChange={(e) => setCreditAmount((s) => ({ ...s, [u.id]: Number(e.target.value) }))}
                    className="w-24"
                  />
                  <Button size="sm" variant="outline" onClick={() => adjustCredit(u.id, 1)}>
                    <Plus className="mr-1 h-4 w-4" />Créditer
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => adjustCredit(u.id, -1)}>
                    <Minus className="mr-1 h-4 w-4" />Retirer
                  </Button>
                  <div className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1">
                    <AlertCircle className="h-3.5 w-3.5 text-warning" />
                    <span className="text-xs text-muted-foreground">Découvert</span>
                    {Number(w?.overdraft_limit_eur ?? 0) < UNLIMITED_OVERDRAFT && (
                      <>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder={Number(w?.overdraft_limit_eur ?? 0).toFixed(2)}
                          value={overdraftDraft[u.id] ?? ""}
                          onChange={(e) => setOverdraftDraft((s) => ({ ...s, [u.id]: e.target.value }))}
                          className="h-7 w-20 text-xs"
                        />
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => saveOverdraft(u.id)}>OK</Button>
                      </>
                    )}
                    <div className="flex items-center gap-1 border-l border-border/60 pl-2">
                      <Switch
                        checked={Number(w?.overdraft_limit_eur ?? 0) >= UNLIMITED_OVERDRAFT}
                        onCheckedChange={(v) => toggleUnlimitedOverdraft(u.id, v)}
                      />
                      <span className="text-xs text-muted-foreground">Illimité</span>
                    </div>
                  </div>

                  <Select value={u.member_tag ?? NO_ROLE_VALUE} onValueChange={(v) => assignRole(u.id, v)}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Rôle" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ROLE_VALUE}>Aucun rôle</SelectItem>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.name}>
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                            {r.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => openHistory(u)}>
                    <History className="mr-1 h-4 w-4" />Voir achats
                  </Button>
                  {!u.is_admin && u.status === "approved" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm(`Retirer l'accès au dashboard pour ${u.display_name ?? "cet utilisateur"} ? Son compte repassera en "refusé".`)) {
                          setStatus(u.id, "rejected");
                        }
                      }}
                    >
                      <X className="mr-1 h-4 w-4" />Retirer l'accès
                    </Button>
                  )}
                </div>
              </div>
              );
            })}

            {rejectedUsers.length > 0 && (
              <div className="mt-8 border-t border-border/40 pt-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Comptes refusés</h3>
                    <p className="text-sm text-muted-foreground">Tu peux réactiver un compte refusé en un clic.</p>
                  </div>
                  <Badge variant="destructive">{rejectedUsers.length}</Badge>
                </div>

                <div className="space-y-3">
                  {rejectedUsers.map((u) => (
                    <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 p-3">
                      <div className="flex items-center gap-3">
                        {u.avatar_url && <img src={u.avatar_url} className="h-10 w-10 rounded-full" alt="" />}
                        <div>
                          <div className="font-medium">{u.display_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">Discord: {u.discord_id ?? "—"}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="destructive">rejected</Badge>
                        <Button size="sm" onClick={() => setStatus(u.id, "approved")}>
                          <Check className="mr-1 h-4 w-4" />Réapprouver
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="credits" className="mt-4">
          <Card className="glass-card p-6">
            {credits.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Aucune demande.</div>
            ) : credits.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 py-3 last:border-0">
                <div>
                  <div className="font-medium">{c.profiles?.display_name ?? "—"} — {c.amount} €</div>
                  <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("fr-FR")}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.status === "approved" ? "default" : c.status === "pending" ? "secondary" : "destructive"}>{c.status}</Badge>
                  {c.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => handleCreditReq(c.id, true)}>Valider</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleCreditReq(c.id, false)}>Refuser</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold">Nouveau produit</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <Label>Nom *</Label>
                <Input value={newProd.name} onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} />
              </div>
              <div>
                <Label>Prix (€) *</Label>
                <Input type="number" min={0} step="0.01" value={newProd.price_eur || ""} onChange={(e) => setNewProd({ ...newProd, price_eur: Number(e.target.value) })} />
              </div>
              <div>
                <Label>URL image</Label>
                <Input value={newProd.image_url} onChange={(e) => setNewProd({ ...newProd, image_url: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <Label>Stock (vide = illimité)</Label>
                <Input type="number" min={0} value={newProd.stock} onChange={(e) => setNewProd({ ...newProd, stock: e.target.value })} />
              </div>
              <div>
                <Label>Crédit bonus (€) — ajouté en + au wallet</Label>
                <Input type="number" min={0} step="0.01" value={newProd.bonus_credit_eur} onChange={(e) => setNewProd({ ...newProd, bonus_credit_eur: e.target.value })} placeholder="0" />
              </div>
              <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea value={newProd.description} onChange={(e) => setNewProd({ ...newProd, description: e.target.value })} rows={2} />
              </div>

            </div>
            <Button className="mt-4" onClick={createProduct}><Plus className="mr-1 h-4 w-4" />Créer le produit</Button>
          </Card>

          <Card className="glass-card mt-4 p-6">
            <h3 className="mb-4 text-lg font-semibold">Catalogue ({products.length})</h3>
            {products.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">Aucun produit.</div>
            ) : products.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 py-3 last:border-0">
                <div className="flex items-center gap-3">
                  {p.image_url && <img src={p.image_url} className="h-12 w-12 rounded object-cover" alt="" />}
                  <div>
                    <div className="font-medium">
                      {p.name} — {Number(p.price_eur).toFixed(2)} €
                      {Number(p.bonus_credit_eur ?? 0) > 0 && (
                        <span className="ml-2 text-xs text-primary">+{Number(p.bonus_credit_eur).toFixed(2)} € bonus</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.description ?? "—"} • Stock: {p.stock ?? "∞"} • Crédite {(Number(p.price_eur) + Number(p.bonus_credit_eur ?? 0)).toFixed(2)} €</div>
                  </div>

                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={p.active} onCheckedChange={(v) => toggleProduct(p.id, v)} />
                    <span className="text-xs">{p.active ? "Actif" : "Inactif"}</span>
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => deleteProduct(p.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card className="glass-card p-6">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-border/40 py-3 last:border-0">
                <div>
                  <div className="font-medium">{p.profiles?.display_name ?? "—"} — {Number(p.amount).toFixed(2)} €</div>
                  <div className="text-xs text-muted-foreground">{p.provider} • {new Date(p.created_at).toLocaleString("fr-FR")}</div>
                </div>
                <Badge>{p.status}</Badge>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="purchases" className="mt-4">
          <Card className="glass-card p-6">
            {purchases.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-border/40 py-3 last:border-0">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.event_name}</div>
                  <div className="text-xs text-muted-foreground">{p.profiles?.display_name ?? "—"} • {p.store} • Qté {p.quantity}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Source bot : {inferPurchaseBot(p) || "—"}</span>
                    {shareConfig.bot_name && !matchesBotName(inferPurchaseBot(p), shareConfig.bot_name) && (
                      <Button size="sm" variant="outline" onClick={() => assignPurchaseToTrackedBot(p.id)}>
                        Ajouter à {shareConfig.bot_name}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{Number(p.price_quota).toFixed(2)} €</div>
                  <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("fr-FR")}</div>
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="accounting" className="mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="glass-card p-4">
              <div className="text-sm text-muted-foreground">Total remboursé</div>
              <div className="mt-1 text-2xl font-bold">{totalRefunded.toFixed(2)} €</div>
            </Card>
            <Card className="glass-card p-4">
              <div className="text-sm text-muted-foreground">Total frais Stripe (3%)</div>
              <div className="mt-1 text-2xl font-bold text-warning">{totalFees.toFixed(2)} €</div>
            </Card>
            <Card className="glass-card p-4">
              <div className="text-sm text-muted-foreground">Nb remboursements</div>
              <div className="mt-1 text-2xl font-bold">{refunds.length}</div>
            </Card>
          </div>

          <Card className="glass-card mt-4 p-6">
            <h3 className="text-lg font-semibold">Calculer un remboursement</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              3% de commission Stripe sont déduits du montant initialement payé par l'utilisateur.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <Label>Utilisateur</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={refundForm.user_id}
                  onChange={(e) => setRefundForm({ ...refundForm, user_id: e.target.value })}
                >
                  <option value="">— Choisir —</option>
                  {users.filter((u) => u.status === "approved").map((u) => (
                    <option key={u.id} value={u.id}>{u.display_name ?? u.id.slice(0, 8)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Montant payé (€)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={refundForm.amount}
                  onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })}
                />
              </div>
              <div>
                <Label>Note (optionnel)</Label>
                <Input
                  value={refundForm.note}
                  onChange={(e) => setRefundForm({ ...refundForm, note: e.target.value })}
                />
              </div>
            </div>

            {refundPreview && (
              <div className="mt-4 rounded-lg border border-border/60 bg-secondary/30 p-4">
                <div className="text-sm text-muted-foreground">Montant à rembourser à l'utilisateur</div>
                <div className="mt-1 text-3xl font-bold text-primary">{refundPreview.refund.toFixed(2)} €</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Frais Stripe (3%) retenus : {refundPreview.fee.toFixed(2)} €
                </div>
              </div>
            )}

            <Button className="mt-4" onClick={createRefund}>
              <Calculator className="mr-1 h-4 w-4" />Enregistrer le remboursement
            </Button>
          </Card>

          <Card className="glass-card mt-4 p-6">
            <h3 className="mb-4 text-lg font-semibold">Historique ({refunds.length})</h3>
            {refunds.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">Aucun remboursement.</div>
            ) : refunds.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 py-3 last:border-0">
                <div className="min-w-0">
                  <div className="font-medium">{r.user_name ?? "—"} — {Number(r.refund_eur).toFixed(2)} €</div>
                  <div className="text-xs text-muted-foreground">
                    Payé {Number(r.amount_eur).toFixed(2)} € • Frais {Number(r.fee_eur).toFixed(2)} € ({Number(r.fee_pct).toFixed(2)}%)
                    {r.note && <> • {r.note}</>}
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("fr-FR")}</div>
                </div>
                <Button size="sm" variant="destructive" onClick={() => deleteRefund(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="share" className="mt-4">
          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold">Configuration du partage</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Quand un panier est pris par le bot configuré, sa commission est partagée avec le partenaire.
              Le bot doit envoyer un champ <code>source_bot</code> (ou <code>bot</code>, <code>bot_name</code>, <code>bot_id</code>) dans le payload <code>purchase</code>.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <Label>Nom du bot (source_bot)</Label>
                <Input
                  value={shareConfigDraft.bot_name ?? ""}
                  placeholder="ex: cybr"
                  onChange={(e) => setShareConfigDraft({ ...shareConfigDraft, bot_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Partenaire</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={shareConfigDraft.partner_user_id ?? ""}
                  onChange={(e) => setShareConfigDraft({ ...shareConfigDraft, partner_user_id: e.target.value })}
                >
                  <option value="">— Choisir —</option>
                  {users.filter((u) => u.status === "approved").map((u) => (
                    <option key={u.id} value={u.id}>{u.display_name ?? u.id.slice(0, 8)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Part partenaire (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  value={shareConfigDraft.share_pct}
                  onChange={(e) => setShareConfigDraft({ ...shareConfigDraft, share_pct: Number(e.target.value) })}
                />
              </div>
            </div>
            <Button className="mt-4" onClick={saveShareConfig}>Sauvegarder</Button>
          </Card>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Card className="glass-card p-4">
              <div className="text-sm text-muted-foreground">Bot suivi</div>
              <div className="mt-1 text-2xl font-bold">{shareConfig.bot_name || "—"}</div>
            </Card>
            <Card className="glass-card p-4">
              <div className="text-sm text-muted-foreground">Partenaire</div>
              <div className="mt-1 text-xl font-bold">{partner?.display_name ?? "—"}</div>
            </Card>
            <Card className="glass-card p-4">
              <div className="text-sm text-muted-foreground">Total dû ({sharePct}% des commissions)</div>
              <div className="mt-1 text-2xl font-bold text-primary">{totalDueToPartner.toFixed(2)} €</div>
              <div className="text-xs text-muted-foreground">Commission totale : {totalCommissionShared.toFixed(2)} €</div>
            </Card>
          </div>

          <Card className="glass-card mt-4 p-6">
            <h3 className="mb-4 text-lg font-semibold">Paniers du bot ({sharedPurchases.length})</h3>
            {!shareConfig.bot_name ? (
              <div className="py-6 text-center text-muted-foreground">Configure d'abord le nom du bot ci-dessus.</div>
            ) : sharedPurchases.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">Aucun panier pour ce bot pour le moment.</div>
            ) : sharedPurchases.map((p) => {
              const com = Number(p.commission ?? 0);
              const part = +(com * sharePct / 100).toFixed(2);
              return (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 py-3 last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.event_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.profiles?.display_name ?? "—"} • {p.store} • Qté {p.quantity} • {new Date(p.created_at).toLocaleString("fr-FR")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">Commission : <span className="font-semibold">{com.toFixed(2)} €</span></div>
                    <div className="text-sm text-primary">Part partenaire : <span className="font-bold">{part.toFixed(2)} €</span></div>
                  </div>
                </div>
              );
            })}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!historyUser} onOpenChange={(o) => { if (!o) { setHistoryUser(null); setHistoryPurchases([]); setHistoryProducts([]); } }}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          {historyUser && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" /> Historique — {historyUser.display_name ?? historyUser.id.slice(0, 8)}
                </DialogTitle>
                <DialogDescription>
                  Supprimer un panier de test recrédite automatiquement le solde de l'utilisateur.
                </DialogDescription>
              </DialogHeader>

              {historyLoading && <div className="py-6 text-center text-sm text-muted-foreground">Chargement…</div>}

              {!historyLoading && (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <ShoppingCart className="h-4 w-4" /> Paniers ({historyPurchases.length})
                    </h3>
                    {historyPurchases.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">Aucun panier.</div>
                    ) : (
                      <div className="space-y-2">
                        {historyPurchases.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-secondary/20 p-3">
                            <button
                              type="button"
                              onClick={() => setSelectedPurchase(p)}
                              className="min-w-0 flex-1 text-left hover:opacity-80"
                            >
                              <div className="truncate text-sm font-medium">🎟️ {p.event_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {p.store} • Qté {p.quantity} • {new Date(p.created_at).toLocaleString("fr-FR")}
                              </div>
                            </button>
                            <div className="text-right">
                              <div className="text-sm font-semibold">{Number(p.price_quota).toFixed(2)} €</div>
                              <Badge variant="secondary" className="mt-1 text-[10px]">{p.status}</Badge>
                            </div>
                            <Button size="sm" variant="destructive" onClick={() => deleteHistoryItem(p.id, "purchase", p.event_name)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Package className="h-4 w-4" /> Produits ({historyProducts.length})
                    </h3>
                    {historyProducts.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">Aucun produit.</div>
                    ) : (
                      <div className="space-y-2">
                        {historyProducts.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-secondary/20 p-3">
                            <button
                              type="button"
                              onClick={() => setSelectedProduct(p)}
                              className="min-w-0 flex-1 text-left hover:opacity-80"
                            >
                              <div className="truncate text-sm font-medium">{p.product_name}</div>
                              <div className="text-xs text-muted-foreground">
                                Qté {p.quantity} • {new Date(p.created_at).toLocaleString("fr-FR")}
                              </div>
                            </button>
                            <div className="text-right">
                              <div className="text-sm font-semibold">{Number(p.total_eur).toFixed(2)} €</div>
                              <Badge variant="secondary" className="mt-1 text-[10px]">{p.status}</Badge>
                            </div>
                            <Button size="sm" variant="destructive" onClick={() => deleteHistoryItem(p.id, "product", p.product_name)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Détails panier */}
      <Dialog open={!!selectedPurchase} onOpenChange={(o) => !o && setSelectedPurchase(null)}>
        <DialogContent className="max-w-lg">
          {selectedPurchase && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">🎟️ {selectedPurchase.event_name}</DialogTitle>
                <DialogDescription>Détails du panier (vue admin).</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Événement</div>
                    <div className="font-medium">{selectedPurchase.event_name}</div>
                    {selectedPurchase.event_date && (
                      <div className="text-xs text-muted-foreground">{selectedPurchase.event_date}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Site / Store</div>
                    <div className="font-medium">{selectedPurchase.site ?? selectedPurchase.store}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Catégorie</div>
                    <div className="font-medium">{selectedPurchase.category ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Quantité</div>
                    <div className="font-medium">{selectedPurchase.quantity}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Source bot</div>
                    <div className="font-medium">{inferPurchaseBot(selectedPurchase) || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Commission (PAS) — débitée</div>
                    <div className="font-semibold text-primary">{Number(selectedPurchase.price_quota).toFixed(2)} €</div>
                  </div>
                </div>
                {selectedPurchase.seats && selectedPurchase.seats.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Seats</div>
                    <div className="space-y-1 rounded-lg border border-border/60 bg-secondary/30 p-3">
                      {selectedPurchase.seats.map((s, i) => (
                        <div key={i} className="text-xs font-mono">{s}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border/60 pt-3">
                  <Badge variant="secondary">{selectedPurchase.status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(selectedPurchase.created_at).toLocaleString("fr-FR")}</span>
                </div>
                <div className="flex justify-end pt-2">
                  <Button variant="destructive" onClick={() => deleteHistoryItem(selectedPurchase.id, "purchase", selectedPurchase.event_name)}>
                    <Trash2 className="mr-1 h-4 w-4" /> Supprimer & recréditer
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Détails produit acheté */}
      <Dialog open={!!selectedProduct} onOpenChange={(o) => !o && setSelectedProduct(null)}>
        <DialogContent className="max-w-md">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedProduct.product_name}</DialogTitle>
                <DialogDescription>Détails de l'achat produit.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Quantité</div>
                    <div className="font-medium">{selectedProduct.quantity}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Prix unitaire</div>
                    <div className="font-medium">{Number(selectedProduct.price_eur ?? 0).toFixed(2)} €</div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border/60 pt-3">
                  <Badge variant="secondary">{selectedProduct.status}</Badge>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total débité</div>
                    <div className="text-lg font-bold text-primary">{Number(selectedProduct.total_eur).toFixed(2)} €</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(selectedProduct.created_at).toLocaleString("fr-FR")}</div>
                <div className="flex justify-end pt-2">
                  <Button variant="destructive" onClick={() => deleteHistoryItem(selectedProduct.id, "product", selectedProduct.product_name)}>
                    <Trash2 className="mr-1 h-4 w-4" /> Supprimer & recréditer
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Admin;
