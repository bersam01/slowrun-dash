import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, ShoppingCart, CheckCircle2, Plus, Search, ExternalLink, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
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
}

const Dashboard = () => {
  const { profile } = useAuth();
  const [balance, setBalance] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalCredited, setTotalCredited] = useState(0);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance, total_spent, total_credited")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (wallet) {
        setBalance(Number(wallet.balance ?? 0));
        setTotalSpent(Number(wallet.total_spent ?? 0));
        setTotalCredited(Number(wallet.total_credited ?? 0));
      }
      const { data: p } = await supabase
        .from("purchases")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setPurchases((p ?? []) as Purchase[]);
    })();
  }, [profile]);

  const filtered = purchases.filter((p) =>
    p.event_name.toLowerCase().includes(search.toLowerCase()) ||
    p.store.toLowerCase().includes(search.toLowerCase())
  );

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            👋 {greeting}{" "}
            <span className="text-gradient-primary">{profile?.display_name ?? "Runner"}</span>
          </h1>
          <p className="mt-1 text-muted-foreground">Voici un aperçu de ton activité SlowRun.</p>
        </div>
        <Link to="/credit">
          <Button size="lg" className="gap-2 shadow-[var(--shadow-glow)]">
            <Plus className="h-5 w-5" /> Créditer mon solde
          </Button>
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard
          title="Solde actuel"
          value={`${balance.toFixed(2)} q`}
          description={`Équivalent ${balance.toFixed(2)} €`}
          icon={Wallet}
          variant="primary"
        />
        <StatCard
          title="Total achats"
          value={purchases.length.toString()}
          description="Nombre total de paniers achetés."
          icon={ShoppingCart}
          variant="accent"
        />
        <StatCard
          title="Total dépensé"
          value={`${totalSpent.toFixed(2)} €`}
          description={`Total crédité : ${totalCredited.toFixed(2)} €`}
          icon={TrendingUp}
          variant="neutral"
        />
      </div>

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
            {filtered.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
                Aucun achat pour le moment. Le bot Discord enregistrera ici tes paniers dès que tu en achètes.
              </div>
            )}
            {filtered.map((p) => (
              <div key={p.id} className="rounded-xl border border-border/60 bg-secondary/20 p-4 transition-colors hover:bg-secondary/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium">{p.event_name}</h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{p.store}</Badge>
                      <span>Qté {p.quantity}</span>
                      <span>•</span>
                      <span>{new Date(p.created_at).toLocaleString("fr-FR")}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{Number(p.price_quota).toFixed(2)} €</div>
                    <Badge
                      variant={p.status === "success" ? "default" : "secondary"}
                      className={p.status === "success" ? "bg-success text-success-foreground" : ""}
                    >
                      {p.status}
                    </Badge>
                  </div>
                </div>
                {p.product_url && (
                  <a
                    href={p.product_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Voir le panier <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="glass-card p-6">
          <h2 className="text-xl font-semibold">Bot Discord</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Utilise les commandes slash pour gérer tes quotas depuis Discord.
          </p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="rounded-lg bg-secondary/40 p-3 font-mono">/solde</div>
            <div className="rounded-lg bg-secondary/40 p-3 font-mono">/historique</div>
            <div className="rounded-lg bg-secondary/40 p-3 font-mono">/acheter event store prix</div>
          </div>
          <Link to="/api-keys">
            <Button variant="outline" className="mt-4 w-full">Gérer mes API keys</Button>
          </Link>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
