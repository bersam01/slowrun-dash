import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ChevronRight, Copy, Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  formatCardNumber,
  maskCard,
  VAULT_PLATFORMS,
  type VaultAccount,
  type VaultCard,
  type VaultPlatform,
} from "@/lib/vault";

interface Props {
  users: { id: string; display_name: string | null }[];
}

export const AdminVaultTab = ({ users }: Props) => {
  const [accounts, setAccounts] = useState<VaultAccount[]>([]);
  const [cards, setCards] = useState<VaultCard[]>([]);
  const [platforms, setPlatforms] = useState<VaultPlatform[]>([]);
  const [platformsMissing, setPlatformsMissing] = useState(false);
  const [newPlatform, setNewPlatform] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const nameOf = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => {
      map[u.id] = u.display_name ?? u.id.slice(0, 8);
    });
    return map;
  }, [users]);

  const loadPlatforms = async () => {
    const { data, error: err } = await supabase
      .from("vault_platforms")
      .select("*")
      .order("sort_order", { ascending: true });
    if (err) {
      setPlatformsMissing(true);
      setPlatforms(VAULT_PLATFORMS.map((name, i) => ({ id: name, name, sort_order: i })));
      return;
    }
    setPlatformsMissing(false);
    setPlatforms((data ?? []) as VaultPlatform[]);
  };

  useEffect(() => {
    (async () => {
      const [a, c] = await Promise.all([
        supabase.from("vault_accounts").select("*").order("created_at", { ascending: false }),
        supabase.from("vault_cards").select("*").order("created_at", { ascending: false }),
      ]);
      if (a.error || c.error) setError(a.error?.message ?? c.error?.message ?? null);
      setAccounts((a.data ?? []) as VaultAccount[]);
      setCards((c.data ?? []) as VaultCard[]);
      loadPlatforms();
    })();
  }, []);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("Copié");
  };

  const toggle = (id: string) => setRevealed((p) => ({ ...p, [id]: !p[id] }));

  const addPlatform = async () => {
    const name = newPlatform.trim();
    if (!name) return;
    const { error: err } = await supabase
      .from("vault_platforms")
      .insert({ name, sort_order: platforms.length + 1 });
    if (err) return toast.error(err.message);
    setNewPlatform("");
    toast.success("Plateforme ajoutée");
    loadPlatforms();
  };

  const removePlatform = async (p: VaultPlatform) => {
    if (!confirm(`Supprimer la plateforme « ${p.name} » ?`)) return;
    const { error: err } = await supabase.from("vault_platforms").delete().eq("id", p.id);
    if (err) return toast.error(err.message);
    toast.success("Plateforme supprimée");
    loadPlatforms();
  };

  const renamePlatform = async (p: VaultPlatform, name: string) => {
    const next = name.trim();
    if (!next || next === p.name) return;
    const { error: err } = await supabase.from("vault_platforms").update({ name: next }).eq("id", p.id);
    if (err) return toast.error(err.message);
    await supabase.from("vault_accounts").update({ platform: next }).eq("platform", p.name);
    toast.success("Plateforme renommée");
    loadPlatforms();
  };

  const q = search.trim().toLowerCase();
  const listedUsers = users.filter((u) => !q || (u.display_name ?? u.id).toLowerCase().includes(q));

  const countAccounts = (id: string) => accounts.filter((a) => a.user_id === id).length;
  const countCards = (id: string) => cards.filter((c) => c.user_id === id).length;

  if (selectedUser) {
    const userAccounts = accounts.filter((a) => a.user_id === selectedUser);
    const userCards = cards.filter((c) => c.user_id === selectedUser);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => setSelectedUser(null)}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Retour
          </Button>
          <h3 className="text-lg font-semibold">{nameOf[selectedUser] ?? "Membre"}</h3>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
            Comptes billetterie ({userAccounts.length})
          </h4>
          <div className="space-y-2">
            {userAccounts.map((a) => (
              <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{a.platform}</Badge>
                    {a.label && <span className="text-xs text-muted-foreground">{a.label}</span>}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{a.email}</p>
                  <p className="font-mono text-sm">{revealed[a.id] ? a.password : "••••••••••"}</p>
                  {a.phone && <p className="text-xs text-muted-foreground">Tél. {a.phone}</p>}
                  {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => toggle(a.id)}>
                    {revealed[a.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => copy(`${a.email}:${a.password}`)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
            {userAccounts.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun compte enregistré.</p>
            )}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
            Cartes bancaires ({userCards.length})
          </h4>
          <div className="space-y-2">
            {userCards.map((c) => (
              <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{c.bank_name}</Badge>
                    <span className="text-xs text-muted-foreground">{c.cardholder}</span>
                  </div>
                  <p className="font-mono text-sm">
                    {revealed[c.id] ? formatCardNumber(c.card_number) : maskCard(c.card_number)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Exp. {c.exp_month}/{c.exp_year} · CVV {revealed[c.id] ? c.cvv : "•••"}
                  </p>
                  {c.billing_address && <p className="text-xs text-muted-foreground">{c.billing_address}</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => toggle(c.id)}>
                    {revealed[c.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => copy(c.card_number)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
            {userCards.length === 0 && <p className="text-sm text-muted-foreground">Aucune carte enregistrée.</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm">
          Espace sécurité indisponible : {error} (exécute <code>sql/vault.sql</code>)
        </Card>
      )}

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Membres ({users.length})</TabsTrigger>
          <TabsTrigger value="platforms">
            <KeyRound className="mr-1 h-4 w-4" />
            Plateformes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4 space-y-3">
          <Input
            placeholder="Rechercher un membre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="space-y-2">
            {listedUsers.map((u) => (
              <Card
                key={u.id}
                onClick={() => setSelectedUser(u.id)}
                className="flex cursor-pointer items-center justify-between gap-3 p-3 transition hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.display_name ?? u.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {countAccounts(u.id)} compte(s) · {countCards(u.id)} carte(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {countAccounts(u.id) + countCards(u.id) === 0 ? (
                    <Badge variant="outline">Rien enregistré</Badge>
                  ) : (
                    <Badge variant="secondary">Données</Badge>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            ))}
            {listedUsers.length === 0 && <p className="text-sm text-muted-foreground">Aucun membre.</p>}
          </div>
        </TabsContent>

        <TabsContent value="platforms" className="mt-4 space-y-3">
          {platformsMissing && (
            <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm">
              Table des plateformes absente — exécute <code>sql/vault_platforms.sql</code> pour pouvoir les gérer.
            </Card>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Nouvelle plateforme"
              value={newPlatform}
              maxLength={60}
              onChange={(e) => setNewPlatform(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlatform()}
            />
            <Button onClick={addPlatform} disabled={platformsMissing}>
              <Plus className="mr-1 h-4 w-4" />
              Ajouter
            </Button>
          </div>
          <div className="space-y-2">
            {platforms.map((p) => (
              <Card key={p.id} className="flex items-center gap-2 p-3">
                <Input
                  defaultValue={p.name}
                  disabled={platformsMissing}
                  onBlur={(e) => renamePlatform(p, e.target.value)}
                />
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={platformsMissing}
                  onClick={() => removePlatform(p)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
