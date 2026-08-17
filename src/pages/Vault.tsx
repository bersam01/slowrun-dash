import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Eye, EyeOff, KeyRound, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatCardNumber, maskCard, VAULT_PLATFORMS, type VaultAccount, type VaultCard, type VaultPlatform } from "@/lib/vault";

const emptyAccount = { platform: VAULT_PLATFORMS[0] as string, label: "", email: "", password: "", phone: "", notes: "" };
const emptyCard = {
  bank_name: "",
  cardholder: "",
  card_number: "",
  exp_month: "",
  exp_year: "",
  cvv: "",
  billing_address: "",
  notes: "",
};

const Vault = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<VaultAccount[]>([]);
  const [cards, setCards] = useState<VaultCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [cardForm, setCardForm] = useState(emptyCard);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [missingTables, setMissingTables] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>([...VAULT_PLATFORMS]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [a, c] = await Promise.all([
      supabase.from("vault_accounts").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("vault_cards").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    if (a.error || c.error) {
      const msg = a.error?.message ?? c.error?.message ?? "";
      if (/does not exist|schema cache/i.test(msg)) setMissingTables(true);
    } else {
      setMissingTables(false);
    }
    setAccounts((a.data ?? []) as VaultAccount[]);
    setCards((c.data ?? []) as VaultCard[]);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("vault_platforms")
        .select("*")
        .order("sort_order", { ascending: true });
      if (!error && (data ?? []).length) {
        setPlatforms(((data ?? []) as VaultPlatform[]).map((p) => p.name));
      }
    })();
  }, []);

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const saveAccount = async () => {
    if (!user) return;
    if (!accountForm.email.trim() || !accountForm.password.trim()) {
      return toast.error("Email et mot de passe requis");
    }
    setSaving(true);
    const { error } = await supabase.from("vault_accounts").insert({
      user_id: user.id,
      platform: accountForm.platform,
      label: accountForm.label.trim() || null,
      email: accountForm.email.trim(),
      password: accountForm.password,
      phone: accountForm.phone.trim() || null,
      notes: accountForm.notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Compte enregistré");
    setAccountForm(emptyAccount);
    setAccountOpen(false);
    load();
  };

  const saveCard = async () => {
    if (!user) return;
    const digits = cardForm.card_number.replace(/\D/g, "");
    if (!cardForm.bank_name.trim() || !cardForm.cardholder.trim() || digits.length < 12) {
      return toast.error("Banque, titulaire et numéro de carte valides requis");
    }
    if (!cardForm.exp_month.trim() || !cardForm.exp_year.trim() || !cardForm.cvv.trim()) {
      return toast.error("Expiration et CVV requis");
    }
    setSaving(true);
    const { error } = await supabase.from("vault_cards").insert({
      user_id: user.id,
      bank_name: cardForm.bank_name.trim(),
      cardholder: cardForm.cardholder.trim(),
      card_number: digits,
      exp_month: cardForm.exp_month.trim().padStart(2, "0"),
      exp_year: cardForm.exp_year.trim(),
      cvv: cardForm.cvv.trim(),
      billing_address: cardForm.billing_address.trim() || null,
      notes: cardForm.notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Carte enregistrée");
    setCardForm(emptyCard);
    setCardOpen(false);
    load();
  };

  const removeAccount = async (id: string) => {
    if (!confirm("Supprimer ce compte ?")) return;
    const { error } = await supabase.from("vault_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  const removeCard = async (id: string) => {
    if (!confirm("Supprimer cette carte ?")) return;
    const { error } = await supabase.from("vault_cards").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  const toggleReveal = (id: string) => setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Lock className="h-6 w-6 text-primary" />
            Sécurité
          </h1>
          <p className="text-sm text-muted-foreground">
            Tes comptes billetterie et tes cartes, utilisés lors de la réservation de tes paniers.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          Accès restreint à toi et au staff SlowRun
        </Badge>
      </div>

      {missingTables && (
        <Card className="mb-6 border-destructive/40 bg-destructive/10 p-4 text-sm">
          L'espace sécurité n'est pas encore initialisé côté base de données (script <code>sql/vault.sql</code> à exécuter).
        </Card>
      )}

      <Tabs defaultValue="accounts">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-grid">
          <TabsTrigger value="accounts">
            <KeyRound className="mr-1 h-4 w-4" />
            Comptes ({accounts.length})
          </TabsTrigger>
          <TabsTrigger value="cards">
            <CreditCard className="mr-1 h-4 w-4" />
            Cartes ({cards.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4 space-y-3">
          <Button onClick={() => setAccountOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Ajouter un compte
          </Button>

          {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {!loading && accounts.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Aucun compte enregistré.</Card>
          )}

          {accounts.map((account) => (
            <Card key={account.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{account.platform}</Badge>
                  {account.label && <span className="text-sm font-medium">{account.label}</span>}
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{account.email}</p>
                <p className="font-mono text-sm">
                  {revealed[account.id] ? account.password : "••••••••••"}
                </p>
                {account.phone && <p className="text-xs text-muted-foreground">Tél. {account.phone}</p>}
                {account.notes && <p className="text-xs text-muted-foreground">{account.notes}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => toggleReveal(account.id)}>
                  {revealed[account.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => removeAccount(account.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="cards" className="mt-4 space-y-3">
          <Button onClick={() => setCardOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Ajouter une carte
          </Button>

          {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {!loading && cards.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">Aucune carte enregistrée.</Card>
          )}

          {cards.map((card) => (
            <Card key={card.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{card.bank_name}</Badge>
                  <span className="text-sm font-medium">{card.cardholder}</span>
                </div>
                <p className="mt-1 font-mono text-sm">
                  {revealed[card.id] ? formatCardNumber(card.card_number) : maskCard(card.card_number)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Exp. {card.exp_month}/{card.exp_year} · CVV {revealed[card.id] ? card.cvv : "•••"}
                </p>
                {card.billing_address && (
                  <p className="text-xs text-muted-foreground">{card.billing_address}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => toggleReveal(card.id)}>
                  {revealed[card.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => removeCard(card.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un compte</DialogTitle>
            <DialogDescription>Ces identifiants servent uniquement à réserver tes paniers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Plateforme</Label>
              <Select
                value={accountForm.platform}
                onValueChange={(v) => setAccountForm((f) => ({ ...f, platform: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Libellé (optionnel)</Label>
              <Input
                value={accountForm.label}
                maxLength={60}
                onChange={(e) => setAccountForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Compte principal"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={accountForm.email}
                maxLength={255}
                onChange={(e) => setAccountForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <Label>Mot de passe</Label>
              <Input
                type="text"
                value={accountForm.password}
                maxLength={255}
                onChange={(e) => setAccountForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
            <div>
              <Label>Téléphone (optionnel)</Label>
              <Input
                value={accountForm.phone}
                maxLength={30}
                onChange={(e) => setAccountForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label>Notes (optionnel)</Label>
              <Textarea
                value={accountForm.notes}
                maxLength={500}
                onChange={(e) => setAccountForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveAccount} disabled={saving}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cardOpen} onOpenChange={setCardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une carte</DialogTitle>
            <DialogDescription>Utilisée uniquement pour finaliser tes réservations.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Banque</Label>
              <Input
                value={cardForm.bank_name}
                maxLength={60}
                onChange={(e) => setCardForm((f) => ({ ...f, bank_name: e.target.value }))}
                placeholder="Revolut, BNP…"
              />
            </div>
            <div>
              <Label>Titulaire</Label>
              <Input
                value={cardForm.cardholder}
                maxLength={80}
                onChange={(e) => setCardForm((f) => ({ ...f, cardholder: e.target.value }))}
              />
            </div>
            <div>
              <Label>Numéro</Label>
              <Input
                inputMode="numeric"
                value={formatCardNumber(cardForm.card_number)}
                onChange={(e) => setCardForm((f) => ({ ...f, card_number: e.target.value }))}
                placeholder="4242 4242 4242 4242"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Mois</Label>
                <Input
                  inputMode="numeric"
                  maxLength={2}
                  value={cardForm.exp_month}
                  onChange={(e) => setCardForm((f) => ({ ...f, exp_month: e.target.value.replace(/\D/g, "") }))}
                  placeholder="08"
                />
              </div>
              <div>
                <Label>Année</Label>
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={cardForm.exp_year}
                  onChange={(e) => setCardForm((f) => ({ ...f, exp_year: e.target.value.replace(/\D/g, "") }))}
                  placeholder="2028"
                />
              </div>
              <div>
                <Label>CVV</Label>
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={cardForm.cvv}
                  onChange={(e) => setCardForm((f) => ({ ...f, cvv: e.target.value.replace(/\D/g, "") }))}
                  placeholder="123"
                />
              </div>
            </div>
            <div>
              <Label>Adresse de facturation (optionnel)</Label>
              <Textarea
                value={cardForm.billing_address}
                maxLength={300}
                onChange={(e) => setCardForm((f) => ({ ...f, billing_address: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveCard} disabled={saving}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Vault;
