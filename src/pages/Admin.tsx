import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Users, Wallet, ShoppingCart, Plus, Minus, Package, Trash2, Calculator } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface AdminProfile {
  id: string;
  display_name: string | null;
  discord_id: string | null;
  avatar_url: string | null;
  status: string;
  is_admin: boolean;
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
  profiles?: { display_name: string | null };
}

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  price_eur: number;
  image_url: string | null;
  active: boolean;
  stock: number | null;
}

interface WalletRow {
  user_id: string;
  balance: number;
  total_credited: number;
  total_spent: number;
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

const Admin = () => {
  const [users, setUsers] = useState<AdminProfile[]>([]);
  const [credits, setCredits] = useState<CreditReq[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [wallets, setWallets] = useState<Record<string, WalletRow>>({});
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [creditAmount, setCreditAmount] = useState<Record<string, number>>({});
  const [newProd, setNewProd] = useState({ name: "", description: "", price_eur: 0, image_url: "", stock: "" });
  const [refundForm, setRefundForm] = useState({ user_id: "", amount: "", note: "" });

  const load = async () => {
    const [u, c, p, pu, pr, w, rf] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("credit_requests").select("*, profiles(display_name)").order("created_at", { ascending: false }),
      supabase.from("payments").select("*, profiles(display_name)").order("created_at", { ascending: false }).limit(50),
      supabase.from("purchases").select("*, profiles(display_name)").order("created_at", { ascending: false }).limit(50),
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("wallets").select("user_id, balance, total_credited, total_spent"),
      supabase.from("refunds").select("*").order("created_at", { ascending: false }).limit(100),
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
  };

  useEffect(() => {
    load();
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
      active: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Produit créé");
    setNewProd({ name: "", description: "", price_eur: 0, image_url: "", stock: "" });
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
    if (error) toast.error(error.message);
    else { toast.success(`Compte ${status === "approved" ? "approuvé" : "refusé"}`); load(); }
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
    setCreditAmount((s) => ({ ...s, [userId]: 0 }));
    load();
  };

  const handleCreditReq = async (id: string, approve: boolean) => {
    const { error } = await supabase.functions.invoke("admin-process-credit", {
      body: { request_id: id, approve },
    });
    if (error) toast.error(error.message);
    else { toast.success(approve ? "Crédit ajouté" : "Demande refusée"); load(); }
  };

  const pending = users.filter((u) => u.status === "pending");

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
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-6">
          <TabsTrigger value="approvals">Approbations ({pending.length})</TabsTrigger>
          <TabsTrigger value="users"><Users className="mr-1 h-4 w-4" />Utilisateurs</TabsTrigger>
          <TabsTrigger value="credits"><Wallet className="mr-1 h-4 w-4" />Crédits</TabsTrigger>
          <TabsTrigger value="products"><Package className="mr-1 h-4 w-4" />Produits</TabsTrigger>
          <TabsTrigger value="payments">Paiements</TabsTrigger>
          <TabsTrigger value="purchases"><ShoppingCart className="mr-1 h-4 w-4" />Achats</TabsTrigger>
        </TabsList>

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
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 py-3 last:border-0">
                <div className="flex items-center gap-3">
                  {u.avatar_url && <img src={u.avatar_url} className="h-10 w-10 rounded-full" alt="" />}
                  <div>
                    <div className="font-medium">{u.display_name ?? "—"} {u.is_admin && <Badge className="ml-1 bg-accent text-accent-foreground">Admin</Badge>}</div>
                    <div className="text-xs text-muted-foreground">Discord: {u.discord_id ?? "—"}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={u.status === "approved" ? "default" : u.status === "pending" ? "secondary" : "destructive"}>{u.status}</Badge>
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
                </div>
              </div>
            ))}
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
                    <div className="font-medium">{p.name} — {Number(p.price_eur).toFixed(2)} €</div>
                    <div className="text-xs text-muted-foreground">{p.description ?? "—"} • Stock: {p.stock ?? "∞"}</div>
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
                </div>
                <div className="text-right">
                  <div className="font-semibold">{Number(p.price_quota).toFixed(2)} €</div>
                  <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("fr-FR")}</div>
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default Admin;
