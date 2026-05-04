import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Share2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface SharedPurchase {
  id: string;
  event_name: string;
  store: string;
  quantity: number;
  created_at: string;
  commission: number | null;
  profiles?: { display_name: string | null };
}

interface PartnerData {
  isPartner?: boolean;
  config: { bot_name: string | null; share_pct: number };
  purchases: SharedPurchase[];
}

const Collab = () => {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [data, setData] = useState<PartnerData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: res, error } = await supabase.functions.invoke("partner-shared-data");
      if (cancelled) return;
      if (error || !(res as PartnerData | null)?.isPartner) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      setData(res as PartnerData);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && forbidden) return <Navigate to="/dashboard" replace />;

  const sharePct = Number(data?.config.share_pct ?? 50);
  const totalCommission = (data?.purchases ?? []).reduce((s, p) => s + Number(p.commission ?? 0), 0);
  const totalDue = +((totalCommission * sharePct) / 100).toFixed(2);

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-gradient-accent">Collaboration</span>
        </h1>
        <p className="mt-1 text-muted-foreground">
          Tous les paniers pris par les membres via {data?.config.bot_name ?? "le bot"}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass-card p-4">
          <div className="text-sm text-muted-foreground">Bot suivi</div>
          <div className="mt-1 text-2xl font-bold">
            {loading ? <Skeleton className="h-7 w-24" /> : data?.config.bot_name || "—"}
          </div>
        </Card>
        <Card className="glass-card p-4">
          <div className="text-sm text-muted-foreground">Ta part ({sharePct}%)</div>
          <div className="mt-1 text-2xl font-bold text-primary">
            {loading ? <Skeleton className="h-7 w-24" /> : `${totalDue.toFixed(2)} €`}
          </div>
          <div className="text-xs text-muted-foreground">
            Commission totale : {totalCommission.toFixed(2)} €
          </div>
        </Card>
        <Card className="glass-card p-4">
          <div className="text-sm text-muted-foreground">Paniers</div>
          <div className="mt-1 text-2xl font-bold">
            {loading ? <Skeleton className="h-7 w-16" /> : (data?.purchases.length ?? 0)}
          </div>
        </Card>
      </div>

      <Card className="glass-card mt-6 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
          <Share2 className="h-5 w-5 text-primary" />
          Paniers du bot ({data?.purchases.length ?? 0})
        </h2>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (data?.purchases ?? []).length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">Aucun panier pour le moment.</div>
        ) : (
          (data?.purchases ?? []).map((p) => {
            const com = Number(p.commission ?? 0);
            const part = +((com * sharePct) / 100).toFixed(2);
            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.event_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.profiles?.display_name ?? "—"} • {p.store} • Qté {p.quantity} •{" "}
                    {new Date(p.created_at).toLocaleString("fr-FR")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm">
                    Commission : <span className="font-semibold">{com.toFixed(2)} €</span>
                  </div>
                  <div className="text-sm text-primary">
                    Ta part : <span className="font-bold">{part.toFixed(2)} €</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </DashboardLayout>
  );
};

export default Collab;
