import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
  const [balance, setBalance] = useState(0);
  const [buying, setBuying] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [pRes, wRes] = await Promise.all([
      supabase.from("products").select("*").eq("active", true).order("created_at", { ascending: false }),
      profile ? supabase.from("wallets").select("balance").eq("user_id", profile.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setProducts((pRes.data ?? []) as Product[]);
    if (wRes.data) setBalance(Number(wRes.data.balance ?? 0));
    setLoading(false);
  };

  useEffect(() => { if (profile) load(); }, [profile]);

  const buy = async (id: string) => {
    setBuying(id);
    const { data, error } = await supabase.functions.invoke("buy-product", {
      body: { product_id: id, quantity: 1 },
    });
    setBuying(null);
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    toast.success("Achat effectué !");
    load();
  };

  return (
    <DashboardLayout>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-gradient-primary">Produits</span>
          </h1>
          <p className="mt-1 text-muted-foreground">Achète directement avec ton solde.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 px-4 py-2">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="font-semibold">{balance.toFixed(2)} €</span>
        </div>
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
            const canBuy = balance >= Number(p.price_eur) && (p.stock === null || p.stock > 0);
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
                    <Button disabled={!canBuy || buying === p.id} onClick={() => buy(p.id)}>
                      {buying === p.id ? "..." : canBuy ? "Acheter" : (p.stock === 0 ? "Rupture" : "Solde insuffisant")}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
};

export default Products;
