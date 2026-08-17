import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Sparkles, Info, Bitcoin, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SUPABASE_ANON_KEY, SUPABASE_FUNCTIONS_URL, supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

const PRESETS = [10, 25, 50, 100, 250, 500];
const STRIPE_SYNC_MAX_ATTEMPTS = 10;
const STRIPE_SYNC_RETRY_MS = 2000;
const CRYPTO_POLL_MS = 15000;

type CryptoPayment = {
  id: string;
  amount_eur: number;
  amount_usdt: number;
  address: string;
  network: string;
  status: string;
  expires_at: string;
  token_symbol?: string;
  label?: string;
  decimals?: number;
};

type CryptoNetwork = {
  id: string;
  label: string;
  token_symbol: string;
  rate_eur: number;
  decimals?: number;
};


const Credit = () => {
  const { profile } = useAuth();
  const [amount, setAmount] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [cryptoPayment, setCryptoPayment] = useState<CryptoPayment | null>(null);
  const [networks, setNetworks] = useState<CryptoNetwork[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");
  const cryptoPaymentRef = useRef<CryptoPayment | null>(null);
  cryptoPaymentRef.current = cryptoPayment;


  const callCrypto = useCallback(async (body: Record<string, unknown>) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Ta session a expiré, reconnecte-toi.");

    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/crypto-topup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error ?? `Erreur ${response.status}`);
    return payload;
  }, []);

  const activeNetwork = networks.find((n) => n.id === selectedNetwork) ?? networks[0] ?? null;

  const handleCryptoCreate = async () => {
    if (amount < 1) {
      toast.error("Le montant minimum est de 1 €.");
      return;
    }
    if (!activeNetwork) {
      toast.error("Aucune devise crypto disponible.");
      return;
    }
    setCryptoLoading(true);
    try {
      const payload = await callCrypto({ action: "create", amount, network: activeNetwork.id });
      setCryptoPayment(payload.payment as CryptoPayment);
      toast.success("Adresse de paiement générée", {
        description: `Envoie le montant EXACT en ${activeNetwork.token_symbol} (${activeNetwork.label}).`,
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCryptoLoading(false);
    }
  };

  const handleCryptoCancel = async () => {
    const current = cryptoPaymentRef.current;
    if (!current) return;
    try {
      await callCrypto({ action: "cancel", id: current.id });
    } catch {
      // best effort
    }
    setCryptoPayment(null);
  };

  // Charge les devises crypto activées par l'admin
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const payload = await callCrypto({ action: "networks" });
        if (cancelled) return;
        const list = (payload?.networks ?? []) as CryptoNetwork[];
        setNetworks(list);
        setSelectedNetwork((prev) => (list.some((n) => n.id === prev) ? prev : list[0]?.id ?? ""));
      } catch {
        // silencieux
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id, callCrypto]);

  // Polling automatique: détecte le virement crypto et crédite le solde
  useEffect(() => {
    if (!profile?.id) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const payload = await callCrypto({ action: "check" });
        if (cancelled) return;

        if (Array.isArray(payload?.networks)) setNetworks(payload.networks as CryptoNetwork[]);

        const pending = (payload?.pending ?? null) as CryptoPayment | null;
        const current = cryptoPaymentRef.current;

        if (current && !pending) {
          setCryptoPayment(null);
          const lastPaid = payload?.last_paid;
          if (lastPaid) {
            toast.success("🪙 Paiement crypto reçu !", {
              description: `${Number(lastPaid.amount_eur ?? 0).toFixed(2)} € ont été ajoutés à ton solde.`,
              duration: 8000,
            });
          }
        } else if (!current && pending) {
          setCryptoPayment(pending);
        }
      } catch {
        // silencieux
      }
    };



    void tick();
    const interval = window.setInterval(tick, CRYPTO_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [profile?.id, callCrypto]);

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copié`);
    } catch {
      toast.error("Impossible de copier");
    }
  };


   useEffect(() => {
    let cancelled = false;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const reconcileRecentPaidSessions = async () => {
      if (!profile?.id) return;

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) return;

        const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/stripe-checkout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ reconcile: true }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return;

        if (Number(payload?.repaired_count ?? 0) > 0) {
          const totalAmount = (payload.repaired_sessions ?? []).reduce(
            (sum: number, session: { amount?: number }) => sum + Number(session.amount ?? 0),
            0,
          );

          toast.success("Paiement Stripe régularisé", {
            description: `${Number(totalAmount).toFixed(2)} € ont été ajoutés à votre solde.`,
            duration: 7000,
          });
        }
      } catch {
        // best effort uniquement
      }
    };

    const verifyStripeReturn = async () => {
      const params = new URLSearchParams(window.location.search);
      const status = params.get("status");
      const sessionId = params.get("session_id");

      if (status !== "success" || !sessionId || !profile?.id) {
        void reconcileRecentPaidSessions();
        return;
      }

      setLoading(true);
      try {
        let lastError = "Impossible de confirmer le paiement.";

        for (let attempt = 1; attempt <= STRIPE_SYNC_MAX_ATTEMPTS; attempt += 1) {
          if (cancelled) return;

          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;

          if (!accessToken) {
            lastError = "Session expirée";
          } else {
            const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/stripe-checkout`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
                apikey: SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({ session_id: sessionId }),
            });

            const payload = await response.json().catch(() => ({}));

            if (response.ok) {
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
              return;
            }

            lastError = payload?.error ?? `Erreur ${response.status}`;

            if (response.status !== 409 && response.status < 500) {
              throw new Error(lastError);
            }
        }

          if (attempt < STRIPE_SYNC_MAX_ATTEMPTS) {
            await wait(STRIPE_SYNC_RETRY_MS);
          }
        }

        throw new Error(lastError || "La synchronisation du paiement prend trop de temps.");
      } catch (err) {
        toast.error((err as Error).message ?? "Impossible de confirmer le paiement.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void verifyStripeReturn();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const handleCheckout = async () => {
    if (!profile) return;
    if (amount < 1) {
      toast.error("Le montant minimum est de 1 €.");
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

      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/stripe-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ amount }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error ?? `Erreur ${response.status}`);
      }

      if (payload?.url) {
        toast.success(`Redirection vers le paiement (${amount.toFixed(2)} €)...`, {
          description: "Vous serez crédité automatiquement après paiement.",
        });
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
              min={1}
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

          {(networks.length > 0 || cryptoPayment) && (
          <div className="mt-6 rounded-xl border border-border bg-secondary/20 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bitcoin className="h-4 w-4 text-primary" /> Payer en crypto
              {activeNetwork && !cryptoPayment ? ` (${activeNetwork.label})` : ""}
            </div>

            {!cryptoPayment ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Stable, frais quasi nuls. On génère un montant unique pour identifier ton paiement, le crédit est ajouté automatiquement.
                </p>

                {networks.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {networks.map((n) => (
                      <Button
                        key={n.id}
                        type="button"
                        size="sm"
                        variant={activeNetwork?.id === n.id ? "default" : "outline"}
                        onClick={() => setSelectedNetwork(n.id)}
                      >
                        {n.label}
                      </Button>
                    ))}
                  </div>
                )}

                <Button
                  onClick={handleCryptoCreate}
                  disabled={cryptoLoading || !activeNetwork}
                  variant="outline"
                  size="lg"
                  className="mt-4 w-full gap-2 h-14 text-base sm:h-11 sm:text-sm"
                >
                  {cryptoLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bitcoin className="h-5 w-5" />}
                  Générer une adresse {activeNetwork?.token_symbol ?? "crypto"} ({amount.toFixed(2)} €)
                </Button>
              </>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Montant EXACT à envoyer</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-lg font-bold text-primary">
                      {Number(cryptoPayment.amount_usdt).toFixed(2)} {cryptoPayment.token_symbol ?? "USDT"}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(Number(cryptoPayment.amount_usdt).toFixed(2), "Montant")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Adresse ({cryptoPayment.label ?? cryptoPayment.network})
                  </Label>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
                      {cryptoPayment.address}
                    </code>
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(cryptoPayment.address, "Adresse")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Réseau {cryptoPayment.label ?? cryptoPayment.network} uniquement. Envoie le montant exact au centime près — sinon le paiement ne sera
                  pas reconnu automatiquement. Tu seras crédité de {Number(cryptoPayment.amount_eur).toFixed(2)} € dès
                  confirmation (~1 min). Expire à {new Date(cryptoPayment.expires_at).toLocaleTimeString("fr-FR")}.
                </p>


                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> En attente du paiement...
                  <button onClick={handleCryptoCancel} className="ml-auto underline hover:text-foreground">
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
          )}

        </Card>


        <Card className="glass-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Info className="h-5 w-5 text-primary" /> Comment ça marche ?
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>• Choisis un montant en euros (min 1 €).</li>
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
