import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Bitcoin, CreditCard, Copy, Loader2, RefreshCw, CheckCircle2, Clock, XCircle, Hourglass } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { SUPABASE_ANON_KEY, SUPABASE_FUNCTIONS_URL, supabase } from "@/lib/supabase";

const CRYPTO_POLL_MS = 15000;

type Kind = "card" | "crypto" | "manual";

interface Tx {
  id: string;
  kind: Kind;
  amount_eur: number;
  status: string;
  created_at: string;
  paid_at?: string | null;
  // crypto only
  address?: string | null;
  network?: string | null;
  amount_token?: number | null;
  tx_hash?: string | null;
  expires_at?: string | null;
}

const statusMeta = (status: string) => {
  switch (status) {
    case "paid":
    case "approved":
    case "succeeded":
      return { label: "Crédité", variant: "default" as const, Icon: CheckCircle2 };
    case "pending":
      return { label: "En attente", variant: "secondary" as const, Icon: Clock };
    case "expired":
      return { label: "Expiré", variant: "outline" as const, Icon: Hourglass };
    case "cancelled":
    case "rejected":
    case "failed":
      return { label: status === "rejected" ? "Refusé" : "Annulé", variant: "destructive" as const, Icon: XCircle };
    default:
      return { label: status, variant: "outline" as const, Icon: Clock };
  }
};

const kindMeta: Record<Kind, { label: string; Icon: typeof CreditCard }> = {
  card: { label: "Carte bancaire", Icon: CreditCard },
  crypto: { label: "Crypto", Icon: Bitcoin },
  manual: { label: "Demande manuelle", Icon: Clock },
};

const Transactions = () => {
  const { profile, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Tx[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Tx | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected?.id ?? null;

  const callCryptoCheck = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return;
    await fetch(`${SUPABASE_FUNCTIONS_URL}/crypto-topup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action: "check" }),
    }).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const [payRes, cryptoRes, reqRes] = await Promise.all([
      supabase
        .from("payments")
        .select("id, amount, status, created_at, provider")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("crypto_payments")
        .select("id, amount_eur, amount_usdt, address, network, status, tx_hash, created_at, paid_at, expires_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("credit_requests")
        .select("id, amount, status, created_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const list: Tx[] = [
      ...((payRes.data ?? []) as any[])
        .filter((p) => String(p.provider ?? "").toLowerCase() !== "crypto")
        .map((p) => ({
          id: p.id,
          kind: "card" as Kind,
          amount_eur: Number(p.amount ?? 0),
          status: String(p.status ?? "pending"),
          created_at: p.created_at,
        })),
      ...((cryptoRes.data ?? []) as any[]).map((c) => ({
        id: c.id,
        kind: "crypto" as Kind,
        amount_eur: Number(c.amount_eur ?? 0),
        status: String(c.status ?? "pending"),
        created_at: c.created_at,
        paid_at: c.paid_at,
        address: c.address,
        network: c.network,
        amount_token: Number(c.amount_usdt ?? 0),
        tx_hash: c.tx_hash,
        expires_at: c.expires_at,
      })),
      ...((reqRes.data ?? []) as any[]).map((r) => ({
        id: r.id,
        kind: "manual" as Kind,
        amount_eur: Number(r.amount ?? 0),
        status: String(r.status ?? "pending"),
        created_at: r.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setItems(list);
    setSelected((prev) => (prev ? list.find((t) => t.id === prev.id) ?? prev : prev));
    setLoadingData(false);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    setLoadingData(true);
    load();
  }, [profile?.id, load]);

  const hasPendingCrypto = useMemo(
    () => items.some((t) => t.kind === "crypto" && t.status === "pending"),
    [items],
  );

  // Suivi live des paiements crypto en attente
  useEffect(() => {
    if (!hasPendingCrypto) return;
    let cancelled = false;
    const tick = async () => {
      await callCryptoCheck();
      if (!cancelled) await load();
    };
    tick();
    const interval = setInterval(tick, CRYPTO_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasPendingCrypto, callCryptoCheck, load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await callCryptoCheck();
    await load();
    setRefreshing(false);
    toast.success("Historique actualisé");
  };

  const isLoading = authLoading || !profile || loadingData;
  const totalCredited = items
    .filter((t) => ["paid", "approved", "succeeded"].includes(t.status))
    .reduce((sum, t) => sum + t.amount_eur, 0);

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Historique des <span className="text-gradient-primary">transactions</span>
          </h1>
          <p className="mt-1 text-muted-foreground">
            Tous tes rechargements de crédits, par carte ou en crypto, avec leur suivi en temps réel.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="gap-2">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualiser
          </Button>
          <Link to="/credit">
            <Button className="gap-2">Créditer mon solde</Button>
          </Link>
        </div>
      </div>

      <Card className="p-6">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            Aucune transaction pour le moment. Recharge ton solde pour voir ton historique ici.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {items.length} transaction{items.length > 1 ? "s" : ""} · {totalCredited.toFixed(2)} € crédités au total
            </p>
            <div className="space-y-2">
              {items.map((tx) => {
                const { label, variant, Icon: StatusIcon } = statusMeta(tx.status);
                const { label: kindLabel, Icon: KindIcon } = kindMeta[tx.kind];
                const clickable = tx.kind === "crypto";
                return (
                  <button
                    key={`${tx.kind}-${tx.id}`}
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && setSelected(tx)}
                    className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/20 p-4 text-left transition-colors ${
                      clickable ? "hover:border-primary/50 hover:bg-secondary/40" : "cursor-default"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary">
                        <KindIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {kindLabel}
                          {tx.kind === "crypto" && tx.network ? ` · ${tx.network}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.created_at).toLocaleString("fr-FR")}
                          {clickable && tx.status === "pending" ? " · clique pour suivre" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">+{tx.amount_eur.toFixed(2)} €</span>
                      <Badge variant={variant} className="gap-1">
                        {tx.status === "pending" && clickable ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <StatusIcon className="h-3 w-3" />
                        )}
                        {label}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suivi du paiement crypto</DialogTitle>
            <DialogDescription>
              {selected?.status === "pending"
                ? "Nous vérifions la blockchain automatiquement toutes les 15 secondes."
                : "Détail de la transaction."}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Montant</span>
                <span className="font-semibold">{selected.amount_eur.toFixed(2)} €</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">À envoyer</span>
                <span className="font-mono">
                  {selected.amount_token} {selected.network === "TRC20" ? "USDT" : selected.network === "SOL" ? "USDC" : "SOL"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Réseau</span>
                <span>{selected.network}</span>
              </div>
              {selected.address && (
                <div>
                  <span className="text-muted-foreground">Adresse de réception</span>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 break-all rounded bg-secondary/50 p-2 text-xs">{selected.address}</code>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(selected.address ?? "");
                        toast.success("Adresse copiée");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Statut</span>
                <Badge variant={statusMeta(selected.status).variant} className="gap-1">
                  {selected.status === "pending" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  {statusMeta(selected.status).label}
                </Badge>
              </div>
              {selected.paid_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Crédité le</span>
                  <span>{new Date(selected.paid_at).toLocaleString("fr-FR")}</span>
                </div>
              )}
              {selected.status === "pending" && selected.expires_at && (
                <p className="text-xs text-muted-foreground">
                  Expire le {new Date(selected.expires_at).toLocaleString("fr-FR")}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Transactions;
