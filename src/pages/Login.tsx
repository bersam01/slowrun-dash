import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { goToDashboard, isOnSiteHost } from "@/lib/dashboardUrl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const DiscordIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.105 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.106c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .031-.055c.5-5.177-.838-9.674-3.548-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const Login = () => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  // Si on est sur slowrun.org/login, on bascule sur dashboard.slowrun.org/login
  // pour que la session Supabase soit posée sur le bon domaine.
  useEffect(() => {
    if (typeof window !== "undefined" && isOnSiteHost()) {
      window.location.replace("https://dashboard.slowrun.org/login");
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (user && profile?.status === "approved") goToDashboard(navigate);
    else if (user) navigate("/pending");
  }, [user, profile, loading, navigate]);

  const handleDiscordLogin = async () => {
    if (!isSupabaseConfigured) {
      toast.error("Connecte d'abord ton projet Supabase via le bouton en haut à droite.");
      return;
    }

    try {
      const redirectTo = "https://dashboard.slowrun.org/";
      const params = new URLSearchParams({
        provider: "discord",
        redirect_to: redirectTo,
      });

      window.location.href = `https://jisiahjqkxuctzmrsqzd.supabase.co/auth/v1/authorize?${params.toString()}`;
    } catch {
      toast.error("Impossible de lancer la connexion Discord.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="glass-card relative w-full max-w-md overflow-hidden p-8 animate-scale-in">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />

        <div className="relative">
          <div className="flex justify-center"><Logo size={64} showText={false} /></div>
          <h1 className="mt-6 text-center text-3xl font-bold tracking-tight">
            Bienvenue sur <span className="text-gradient-primary">SlowRun</span>
          </h1>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Connecte-toi avec Discord pour accéder à ton dashboard de quotas.
            Les nouveaux comptes sont validés manuellement par un administrateur.
          </p>

          <Button
            onClick={handleDiscordLogin}
            size="lg"
            className="mt-8 w-full gap-2 bg-[#5865F2] text-white hover:bg-[#4752c4]"
          >
            <DiscordIcon className="h-5 w-5" />
            Se connecter avec Discord
          </Button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            En te connectant, tu acceptes que ton ID Discord soit lié à ton compte SlowRun.
          </p>
        </div>
      </Card>
    </main>
  );
};

export default Login;
