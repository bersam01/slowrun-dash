import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { goToDashboard } from "@/lib/dashboardUrl";
import { Clock, XCircle, Loader2, LogOut } from "lucide-react";

const Pending = () => {
  const { loading, user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/login");
    else if (profile?.status === "approved") goToDashboard(navigate);
  }, [loading, user, profile, navigate]);

  useEffect(() => {
    if (!user || profile?.status === "approved") return;

    const interval = window.setInterval(() => {
      void refreshProfile();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [user, profile?.status, refreshProfile]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const rejected = profile?.status === "rejected";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="glass-card w-full max-w-lg p-8 animate-scale-in">
        <div className="flex justify-center"><Logo size={56} showText={false} /></div>

        <div className="mt-6 flex justify-center">
          {rejected ? (
            <div className="rounded-full bg-destructive/15 p-4">
              <XCircle className="h-10 w-10 text-destructive" />
            </div>
          ) : (
            <div className="rounded-full bg-primary/15 p-4 animate-pulse-glow">
              <Clock className="h-10 w-10 text-primary" />
            </div>
          )}
        </div>

        <h1 className="mt-6 text-center text-2xl font-bold">
          {rejected ? "Accès refusé" : "Compte en attente d'approbation"}
        </h1>

        <p className="mt-3 text-center text-muted-foreground">
          {rejected
            ? "Ton compte a été refusé par un administrateur. Si tu penses qu'il s'agit d'une erreur, contacte le support sur Discord."
            : "Ton compte a bien été créé. Un administrateur va l'examiner sous peu. Tu recevras l'accès dès qu'il sera validé."}
        </p>

        {!rejected && (
          <Button variant="secondary" className="mt-6 w-full" onClick={() => void refreshProfile()}>
            Actualiser le statut
          </Button>
        )}

        {profile && (
          <div className="mt-6 rounded-xl border border-border/60 bg-secondary/30 p-4">
            <div className="flex items-center gap-3">
              {profile.avatar_url && (
                <img src={profile.avatar_url} alt="" className="h-10 w-10 rounded-full" />
              )}
              <div>
                <div className="font-medium">{profile.display_name ?? "Utilisateur"}</div>
                <div className="text-xs text-muted-foreground">Discord ID: {profile.discord_id ?? "—"}</div>
              </div>
            </div>
          </div>
        )}

        <Button variant="outline" className="mt-6 w-full" onClick={async () => { await signOut(); navigate("/login"); }}>
          <LogOut className="mr-2 h-4 w-4" /> Se déconnecter
        </Button>
      </Card>
    </main>
  );
};

export default Pending;
