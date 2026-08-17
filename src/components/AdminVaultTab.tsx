import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Copy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { formatCardNumber, maskCard, type VaultAccount, type VaultCard } from "@/lib/vault";

interface Props {
  users: { id: string; display_name: string | null }[];
}

export const AdminVaultTab = ({ users }: Props) => {
  const [accounts, setAccounts] = useState<VaultAccount[]>([]);
  const [cards, setCards] = useState<VaultCard[]>([]);
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const nameOf = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => { map[u.id] = u.display_name ?? u.id.slice(0, 8); });
    return map;
  }, [users]);

  useEffect(() => {
    (async () => {
      const [a, c] = await Promise.all([
        supabase.from("vault_accounts").select("*").order("created_at", { ascending: false }),
        supabase.from("vault_cards").select("*").order("created_at", { ascending: false }),
      ]);
      if (a.error || c.error) setError(a.error?.message ?? c.error?.message ?? null);
      setAccounts((a.data ?? []) as VaultAccount[]);
      setCards((c.data ?? []) as VaultCard[]);
    })();
  }, []);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("Copié");
  };

  const q = search.trim().toLowerCase();
  const matches = (userId: string, extra: string) =>
    !q || (nameOf[userId] ?? "").toLowerCase().includes(q) || extra.toLowerCase().includes(q);

  const toggle = (id: string) => setRevealed((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm">
          Coffre indisponible : {error} (exécute <code>sql/vault.sql</code>)
        </Card>
      )}

      <Input
        placeholder="Rechercher un membre, une plateforme, une banque…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Comptes billetterie</h3>
        <div className="space-y-2">
          {accounts.filter((a) => matches(a.user_id, `${a.platform} ${a.email}`)).map((a) => (
            <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{a.platform}</Badge>
                  <span className="text-sm font-medium">{nameOf[a.user_id] ?? "—"}</span>
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
          {accounts.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">Aucun compte enregistré.</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Cartes bancaires</h3>
        <div className="space-y-2">
          {cards.filter((c) => matches(c.user_id, `${c.bank_name} ${c.cardholder}`)).map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{c.bank_name}</Badge>
                  <span className="text-sm font-medium">{nameOf[c.user_id] ?? "—"}</span>
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
          {cards.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">Aucune carte enregistrée.</p>
          )}
        </div>
      </div>
    </div>
  );
};
