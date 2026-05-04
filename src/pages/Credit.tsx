import { useEffect, useState } from "react";
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

   useEffect(() => {
    const verifyStripeReturn = async () => {
      const params = new URLSearchParams(window.location.search);
      const status = params.get("status");
      const sessionId = params.get("session_id");

      if (status !== "success" || !sessionId || !profile?.id) return;

      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) throw new Error("Session expirée");

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL ?? "https://jisiahjqkxuctzmrsqzd.supabase.co"}/functions/v1/stripe-checkout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_0dgR1Ed5bYz8mx6cGapjqw_le7V33t2",
          },
          body: JSON.stringify({ session_id: sessionId }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error ?? `Erreur ${response.status}`);

        if (payload?.credited) {
          toast.success("✅ Paiement réussi !", {
            description: `Vous avez été crédité de ${Number(payload.amount).toFixed(2)} €. Nouveau solde : ${Number(payload.new_balance ?? 0).toFixed(2)} €.`,
            duration: 6000,
          });
        } else if (payload?.duplicate) {
          toast.success("Paiement déjà pris en compte.");
        }

        const cleanUrl = `${window.location.pathname}`;
        window.history.replaceState({}, "", cleanUrl);
      } catch (err) {
        toast.error((err as Error).message ?? "Impossible de confirmer le paiement.");
      } finally {
        setLoading(false);
      }
    };

    void verifyStripeReturn();
  }, [profile?.id]);

  const handleCheckout = async () => {
    if (!profile) return;
    if (amount < 5) {
      toast.error("Le montant minimum est de 5 €.");
      return;
    }
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        toast.error("Ta session a expiré, reconnecte-toi.");
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL ?? "https://jisiahjqkxuctzmrsqzd.supabase.co"}/functions/v1/stripe-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_0dgR1Ed5bYz8mx6cGapjqw_le7V33t2",
        },
        body: JSON.stringify({ amount }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error ?? `Erreur ${response.status}`);
      }

      if (payload?.url) {
        window.location.href = payload.url;
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
        <p className="mt-1 text-muted-foreground">Choisis un montant et règle par carte. Ton solde est en euros.</p>
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
              <span className="text-sm text-muted-foreground">Tu vas être crédité de</span>
              <span className="text-2xl font-bold text-gradient-primary">{amount.toFixed(2)} €</span>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={handleCheckout} disabled={loading} size="lg" className="flex-1 gap-2 h-14 text-base sm:h-11 sm:text-sm shadow-[var(--shadow-glow)]">
              <CreditCard className="h-5 w-5" /> Payer par carte (Stripe)
            </Button>
            <Button onClick={handleManualRequest} disabled={loading} variant="outline" size="lg" className="flex-1 gap-2 h-14 text-base sm:h-11 sm:text-sm">
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
            <li>• Ton solde en € est utilisable pour acheter des produits ou via le bot Discord.</li>
          </ul>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Credit;
