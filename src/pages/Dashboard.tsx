import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Wallet, ShoppingCart, CheckCircle2, Plus, Search, ExternalLink, TrendingUp, Package, Shield, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SUPABASE_ANON_KEY, SUPABASE_FUNCTIONS_URL, supabase } from "@/lib/supabase";
import { Link } from "react-router-dom";

interface Purchase {
  id: string;
  event_name: string;
  store: string;
  product_url: string | null;
  quantity: number;
  price_quota: number;
  status: string;
  created_at: string;
  category: string | null;
  seats: string[] | null;
  retail_price: number | null;
  commission: number | null;
  site: string | null;
  event_date: string | null;
}

interface ProductPurchase {
  id: string;
  product_name: string;
  quantity: number;
  total_eur: number;
  status: string;
  created_at: string;
}

const Dashboard = () => {
  const { profile, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState(0);
  const [overdraftLimit, setOverdraftLimit] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalCredited, setTotalCredited] = useState(0);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [productPurchases, setProductPurchases] = useState<ProductPurchase[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Purchase | null>(null);
  const UNLIMITED_OVERDRAFT = 1000000;

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (accessToken) {
          await fetch(`${SUPABASE_FUNCTIONS_URL}/stripe-checkout`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
              apikey: SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ reconcile: true }),
          });
        }
      } catch {
        // best effort uniquement
      }

      const [walletRes, purchaseRes, prodRes] = await Promise.all([
        supabase.from("wallets").select("balance, total_spent, total_credited, overdraft_limit_eur").eq("user_id", profile.id).maybeSingle(),
        supabase.from("purchases").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("product_purchases").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(20),
      ]);
      if (cancelled) return;
      if (walletRes.data) {
        setBalance(Number(walletRes.data.balance ?? 0));
        setOverdraftLimit(Number(walletRes.data.overdraft_limit_eur ?? 0));
        setTotalSpent(Number(walletRes.data.total_spent ?? 0));
        setTotalCredited(Number(walletRes.data.total_credited ?? 0));
      }
      setPurchases((purchaseRes.data ?? []) as Purchase[]);
      setProductPurchases((prodRes.data ?? []) as ProductPurchase[]);
      setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, [profile]);

  const filtered = purchases.filter((p) =>
    (p.event_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (p.store ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const isLoading = authLoading || !profile || loadingData;

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            👋 {greeting}{" "}
            {profile?.display_name ? (
              <span className="text-gradient-primary">{profile.display_name}</span>
            ) : (
              <Skeleton className="inline-block h-7 w-32 align-middle" />
            )}
          </h1>
          <p className="mt-1 text-muted-foreground">Voici un aperçu de ton activité SlowRun.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/products">
            <Button size="lg" variant="outline" className="gap-2">
              <Package className="h-5 w-5" /> Acheter un produit
            </Button>
          </Link>
          <Link to="/credit">
            <Button size="lg" className="gap-2 shadow-[var(--shadow-glow)]">
              <Plus className="h-5 w-5" /> Créditer mon solde
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard
          title="Solde actuel"
          value={isLoading ? "…" : `${balance.toFixed(2)} €`}
          description={isLoading ? "Chargement…" : "Disponible pour achats"}
          icon={Wallet}
          variant="primary"
        />
        <StatCard
          title="Total achats"
          value={isLoading ? "…" : (purchases.length + productPurchases.length).toString()}
          description="Paniers + produits achetés."
          icon={ShoppingCart}
          variant="accent"
        />
        <StatCard
          title="Total dépensé"
          value={isLoading ? "…" : `${totalSpent.toFixed(2)} €`}
          description={isLoading ? "Chargement…" : `Total crédité : ${totalCredited.toFixed(2)} €`}
          icon={TrendingUp}
          variant="neutral"
        />
      </div>

      {!isLoading && overdraftLimit > 0 && (
        <Alert className="mt-5 border-primary/30 bg-primary/10">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <AlertTitle>
            {overdraftLimit >= UNLIMITED_OVERDRAFT
              ? "Découvert illimité activé"
              : `Découvert autorisé : ${overdraftLimit.toFixed(2)} €`}
          </AlertTitle>
          <AlertDescription>
            {overdraftLimit >= UNLIMITED_OVERDRAFT
              ? "Tu peux continuer à acheter même si ton solde passe en négatif."
              : `Tu peux dépenser jusqu'à ${overdraftLimit.toFixed(2)} € au-delà de ton solde actuel.`}
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && balance < 0 && (
        <Alert variant="destructive" className="mt-5">
          <Shield className="h-4 w-4" />
          <AlertTitle>Solde négatif</AlertTitle>
          <AlertDescription>
            Tu dois créditer {Math.abs(balance).toFixed(2)} € pour revenir à un solde positif.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="glass-card lg:col-span-2 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Derniers achats
              </h2>
              <p className="text-sm text-muted-foreground">Les paniers achetés via le bot Discord.</p>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un événement…"
                className="pl-9"
              />
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {isLoading && (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
                Aucun achat pour le moment. Le bot Discord enregistrera ici tes paniers dès que tu en achètes.
              </div>
            )}
            {!isLoading && filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className="block w-full rounded-xl border border-border/60 bg-secondary/20 p-4 text-left transition-colors hover:bg-secondary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium">🎟️ {p.event_name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{p.store}</Badge>
                      {p.category && <Badge variant="outline">{p.category}</Badge>}
                      <span>Qté {p.quantity}</span>
                      <span>•</span>
                      <span>{new Date(p.created_at).toLocaleString("fr-FR")}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{Number(p.price_quota).toFixed(2)} €</div>
                    <div className="text-[11px] text-muted-foreground">Commission payée</div>
                    <Badge
                      variant={p.status === "success" ? "default" : "secondary"}
                      className={`mt-1 ${p.status === "success" ? "bg-success text-success-foreground" : ""}`}
                    >
                      {p.status}
                    </Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="glass-card p-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Package className="h-5 w-5 text-accent" />
            Mes produits
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Produits achetés avec ton solde.</p>
          <div className="mt-4 space-y-2">
            {isLoading && <Skeleton className="h-16 w-full" />}
            {!isLoading && productPurchases.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                Aucun produit acheté.
              </div>
            )}
            {!isLoading && productPurchases.slice(0, 5).map((pp) => (
              <div key={pp.id} className="rounded-lg bg-secondary/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{pp.product_name}</span>
                  <span className="text-sm font-semibold">{Number(pp.total_eur).toFixed(2)} €</span>
                </div>
                <div className="text-xs text-muted-foreground">Qté {pp.quantity} • {new Date(pp.created_at).toLocaleString("fr-FR")}</div>
              </div>
            ))}
          </div>
          <Link to="/products">
            <Button variant="outline" className="mt-4 w-full">Voir le catalogue</Button>
          </Link>
        </Card>
      </div>

      {/* Détails du panier */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  🎟️ {selected.event_name}
                </DialogTitle>
                <DialogDescription>
                  Détails du panier acheté via le bot Discord.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Événement</div>
                    <div className="font-medium">{selected.event_name}</div>
                    {selected.event_date && (
                      <div className="text-xs text-muted-foreground">{selected.event_date}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Site / Store</div>
                    <div className="font-medium">{selected.site ?? selected.store}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Catégorie</div>
                    <div className="font-medium">{selected.category ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Quantité</div>
                    <div className="font-medium">{selected.quantity}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Prix retail (unitaire)</div>
                    <div className="font-medium">
                      {selected.retail_price != null ? `${Number(selected.retail_price).toFixed(2)} €` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Commission (PAS) — débitée</div>
                    <div className="font-semibold text-primary">
                      {Number(selected.price_quota).toFixed(2)} €
                    </div>
                  </div>
                </div>

                {selected.seats && selected.seats.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Seats</div>
                    <div className="space-y-1 rounded-lg border border-border/60 bg-secondary/30 p-3">
                      {selected.seats.map((s, i) => (
                        <div key={i} className="text-xs font-mono">{s}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-border/60 pt-3">
                  <Badge
                    variant={selected.status === "success" ? "default" : "secondary"}
                    className={selected.status === "success" ? "bg-success text-success-foreground" : ""}
                  >
                    {selected.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(selected.created_at).toLocaleString("fr-FR")}
                  </span>
                </div>

              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Dashboard;
