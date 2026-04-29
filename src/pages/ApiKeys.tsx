import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

const ApiKeys = () => {
  const { profile } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, created_at, last_used_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });
    setKeys((data ?? []) as ApiKey[]);
  };

  useEffect(() => { load(); }, [profile]);

  const create = async () => {
    if (!name.trim()) return toast.error("Donne un nom à ta clé.");
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      toast.error("Ta session a expiré, reconnecte-toi.");
      return;
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL ?? "https://jisiahjqkxuctzmrsqzd.supabase.co"}/functions/v1/create-api-key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_0dgR1Ed5bYz8mx6cGapjqw_le7V33t2",
      },
      body: JSON.stringify({ name }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return toast.error(payload?.error ?? `Erreur ${response.status}`);
    }

    setRevealed(payload.key);
    setName("");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer cette clé ? Le bot ne pourra plus s'authentifier.")) return;
    const { error } = await supabase.from("api_keys").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          API <span className="text-gradient-primary">Keys</span>
        </h1>
        <p className="mt-1 text-muted-foreground">
          Génère une clé pour configurer ton bot Discord (variable <code className="rounded bg-secondary/60 px-1.5 py-0.5 font-mono text-xs">SLOWRUN_API_KEY</code>).
        </p>
      </div>

      {revealed && (
        <Card className="glass-card mb-6 border-primary/40 p-5 animate-scale-in">
          <p className="text-sm font-medium text-primary">⚠️ Copie ta clé maintenant — elle ne sera plus affichée ensuite.</p>
          <div className="mt-3 flex gap-2">
            <Input readOnly value={revealed} className="font-mono" />
            <Button
              onClick={() => { navigator.clipboard.writeText(revealed); toast.success("Copié !"); }}
              variant="outline"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setRevealed(null)}>J'ai sauvegardé la clé</Button>
        </Card>
      )}

      <Card className="glass-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Plus className="h-5 w-5" /> Créer une nouvelle clé
        </h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="key-name">Nom (ex: bot-prod)</Label>
            <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bot Discord principal" />
          </div>
          <Button onClick={create}>Générer</Button>
        </div>
      </Card>

      <Card className="glass-card mt-6 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="h-5 w-5" /> Mes clés
        </h2>
        <div className="mt-4 space-y-3">
          {keys.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
              Aucune clé. Crée-en une pour relier ton bot.
            </div>
          )}
          {keys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/20 p-4">
              <div>
                <div className="font-medium">{k.name}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <code className="rounded bg-secondary/60 px-1.5 py-0.5 font-mono">{k.key_prefix}…</code>
                  <span>Créée {new Date(k.created_at).toLocaleDateString("fr-FR")}</span>
                  {k.last_used_at && (
                    <Badge variant="secondary">Dernier usage {new Date(k.last_used_at).toLocaleDateString("fr-FR")}</Badge>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(k.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </DashboardLayout>
  );
};

export default ApiKeys;
