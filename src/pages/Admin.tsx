import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Users, Wallet, ShoppingCart, Plus } from "lucide-react";
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

const Admin = () => {
  const [users, setUsers] = useState<AdminProfile[]>([]);
  const [credits, setCredits] = useState<CreditReq[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [creditAmount, setCreditAmount] = useState<Record<string, number>>({});

  const load = async () => {
    const [u, c, p, pu] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("credit_requests").select("*, profiles(display_name)").order("created_at", { ascending: false }),
      supabase.from("payments").select("*, profiles(display_name)").order("created_at", { ascending: false }).limit(50),
      supabase.from("purchases").select("*, profiles(display_name)").order("created_at", { ascending: false }).limit(50),
    ]);
    setUsers((u.data ?? []) as AdminProfile[]);
    setCredits((c.data ?? []) as CreditReq[]);
    setPayments((p.data ?? []) as PaymentRow[]);
    setPurchases((pu.data ?? []) as PurchaseRow[]);
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(`Compte ${status === "approved" ? "approuvé" : "refusé"}`); load(); }
  };

  const manualCredit = async (userId: string) => {
    const amount = creditAmount[userId];
    if (!amount || amount <= 0) return toast.error("Montant invalide");
    const { error } = await supabase.functions.invoke("admin-credit", {
      body: { user_id: userId, amount, note: "Crédit manuel admin" },
    });
    if (error) toast.error(error.message);
    else { toast.success(`+${amount} € crédité`); setCreditAmount((s) => ({ ...s, [userId]: 0 })); load(); }
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
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
          <TabsTrigger value="approvals">Approbations ({pending.length})</TabsTrigger>
          <TabsTrigger value="users"><Users className="mr-1 h-4 w-4" />Utilisateurs</TabsTrigger>
          <TabsTrigger value="credits"><Wallet className="mr-1 h-4 w-4" />Crédits</TabsTrigger>
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
                <div className="flex items-center gap-2">
                  <Badge variant={u.status === "approved" ? "default" : u.status === "pending" ? "secondary" : "destructive"}>{u.status}</Badge>
                  <Input
                    type="number"
                    placeholder="€"
                    value={creditAmount[u.id] ?? ""}
                    onChange={(e) => setCreditAmount((s) => ({ ...s, [u.id]: Number(e.target.value) }))}
                    className="w-24"
                  />
                  <Button size="sm" variant="outline" onClick={() => manualCredit(u.id)}>
                    <Plus className="mr-1 h-4 w-4" />Créditer
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
