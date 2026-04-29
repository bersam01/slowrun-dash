import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

const PRESETS = [10, 25, 50, 100, 250, 500];

const Credit = () => {
  const { profile } = useAuth();
  const [amount, setAmount] = useState<number>(50);
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (!profile) return;
    if (amount < 5) {
      toast.error("Le montant minimum est de 5 €.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { amount },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Impossible de créer la session de paiement.");
      }
    } catch (err) {
      toast.error((err as Error).message ?? "Erreur lors du paiement.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualRequest = async () => {
    if (!profile) return;
    setLoading(true);
    const { error } = await supabase.from("credit_requests").insert({
      user_id: profile.id,
      amount,
      status: "pending",
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Demande envoyée à l'admin pour validation.");
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Créditer <span className="text-gradient-primary">mon solde</span>
        </h1>
        <p className="mt-1 text-muted-foreground">1 quota = 1 €. Choisis un montant et règle par carte.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="glass-card lg:col-span-2 p-6">
          <h2 className="text-lg font-semibold">Montant à créditer</h2>

          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {PRESETS.map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className={`rounded-xl border-2 px-4 py-3 font-semibold transition-all ${
                  amount === v
                    ? "border-primary bg-primary/15 text-primary shadow-[var(--shadow-glow)]"
                    : "border-border bg-secondary/30 text-foreground hover:border-primary/50"
                }`}
              >
                {v} €
              </button>
            ))}
          </div>

          <div className="mt-6">
            <Label htmlFor="custom">Montant personnalisé (€)</Label>
            <Input
              id="custom"
              type="number"
              min={5}
              max={5000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-2 text-lg"
            />
          </div>

          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tu vas recevoir</span>
              <span className="text-2xl font-bold text-gradient-primary">{amount.toFixed(2)} q</span>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={handleCheckout} disabled={loading} size="lg" className="flex-1 gap-2 shadow-[var(--shadow-glow)]">
              <CreditCard className="h-5 w-5" /> Payer par carte (Stripe)
            </Button>
            <Button onClick={handleManualRequest} disabled={loading} variant="outline" size="lg" className="flex-1 gap-2">
              <Sparkles className="h-5 w-5" /> Demande manuelle (admin)
            </Button>
          </div>
        </Card>

        <Card className="glass-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Info className="h-5 w-5 text-primary" /> Comment ça marche ?
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>• Choisis un montant en euros (min 5 €).</li>
            <li>• Paye par carte via Stripe — le crédit est ajouté automatiquement.</li>
            <li>• Ou demande un crédit manuel et l'admin validera ton paiement (virement, etc.).</li>
            <li>• Tes quotas sont utilisables via le bot Discord pour acheter des paniers.</li>
          </ul>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Credit;
