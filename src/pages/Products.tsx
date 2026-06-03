import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price_eur: number;
  image_url: string | null;
  active: boolean;
  stock: number | null;
}

const Products = () => {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });
    setProducts((data ?? []) as Product[]);
    setLoading(false);
  };

  useEffect(() => { if (profile) load(); }, [profile]);

  useEffect(() => {
    const status = searchParams.get("status");
    const sessionId = searchParams.get("session_id");
    if (status === "success" && sessionId) {
      (async () => {
        const tryVerify = async (attempt = 0): Promise<void> => {
          const { data, error } = await supabase.functions.invoke("stripe-checkout", {
            body: { session_id: sessionId },
          });
          if (!error && !data?.error) {
            toast.success(
              data?.duplicate
                ? "Achat déjà enregistré."
                : `✅ Achat confirmé : ${data?.product_name ?? "produit"} ×${data?.quantity ?? 1}`,
            );
            load();
            return;
          }
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 1500));
            return tryVerify(attempt + 1);
          }
          toast.error(data?.error ?? error?.message ?? "Vérification du paiement échouée");
        };
        await tryVerify();
      })();
      searchParams.delete("status");
      searchParams.delete("session_id");
      setSearchParams(searchParams, { replace: true });
    } else if (status === "cancel") {
      toast.info("Paiement annulé.");
      searchParams.delete("status");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openBuy = (p: Product) => {
    setSelected(p);
    setQuantity(1);
  };

  const confirmBuy = async () => {
    if (!selected) return;
    const qty = Math.max(1, Math.min(100, Math.floor(quantity || 1)));
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("stripe-checkout", {
      body: { product_id: selected.id, quantity: qty },
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    if (data?.url) {
      window.location.href = data.url as string;
    } else {
      toast.error("Impossible de générer le lien de paiement.");
    }
  };

  const maxQty = selected?.stock ?? 100;
  const total = selected ? +(Number(selected.price_eur) * Math.max(1, Math.min(maxQty, Math.floor(quantity || 1)))).toFixed(2) : 0;

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-gradient-primary">Produits</span>
        </h1>
        <p className="mt-1 text-muted-foreground">Paiement sécurisé par Stripe.</p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0,1,2].map((i) => <Skeleton key={i} className="h-64 w-full" />)}
        </div>
      ) : products.length === 0 ? (
        <Card className="glass-card p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Aucun produit disponible pour le moment.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const inStock = p.stock === null || p.stock > 0;
            return (
              <Card key={p.id} className="glass-card overflow-hidden">
                {p.image_url && (
                  <div className="aspect-video overflow-hidden bg-secondary/40">
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{p.name}</h3>
                    {p.stock !== null && <Badge variant="secondary">Stock {p.stock}</Badge>}
                  </div>
                  {p.description && <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-2xl font-bold text-gradient-primary">{Number(p.price_eur).toFixed(2)} €</span>
                    <Button disabled={!inStock} onClick={() => openBuy(p)}>
                      {inStock ? "Acheter" : "Rupture"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              Choisis la quantité, puis tu seras redirigé vers Stripe pour le paiement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="qty">Quantité</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                max={maxQty}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="mt-1"
              />
              {selected?.stock !== null && selected?.stock !== undefined && (
                <p className="mt-1 text-xs text-muted-foreground">Stock disponible : {selected.stock}</p>
              )}
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-xl font-bold text-gradient-primary">{total.toFixed(2)} €</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={submitting}>
              Annuler
            </Button>
            <Button onClick={confirmBuy} disabled={submitting || quantity < 1}>
              {submitting ? "Redirection…" : "Payer avec Stripe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Products;

