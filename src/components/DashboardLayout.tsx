import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, ShieldCheck, Package, LogOut, Wallet, Sparkles, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { loading, profile, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isPartner, setIsPartner] = useState(false);
  const [partnerCheckDone, setPartnerCheckDone] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      setIsPartner(false);
      setPartnerCheckDone(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("partner-shared-data");
        if (cancelled) return;
        if (error) {
          console.debug("[collab] not partner:", error.message);
          setIsPartner(false);
          setPartnerCheckDone(true);
          return;
        }
        const partner = Boolean((data as { isPartner?: boolean } | null)?.isPartner);
        setIsPartner(partner);
        setPartnerCheckDone(true);
        if (!partner) console.debug("[collab] not partner: no matching partner config");
      } catch (e) {
        console.debug("[collab] invoke failed:", e);
        if (!cancelled) {
          setIsPartner(false);
          setPartnerCheckDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, profile]);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/credit", label: "Créditer", icon: Wallet },
    { to: "/products", label: "Produits", icon: Package },
    ...(partnerCheckDone && isPartner && !isAdmin ? [{ to: "/collab", label: "Collab", icon: Share2 }] : []),
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-2">
          <Link to="/dashboard" className="shrink-0"><Logo /></Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {profile && (
              <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-secondary/40 py-1 pl-1 pr-3 sm:flex">
                {profile.avatar_url && (
                  <img src={profile.avatar_url} alt="" className="h-7 w-7 rounded-full" />
                )}
                <span className="text-sm font-medium">{profile.display_name ?? "User"}</span>
                {profile.member_tag && (
                  <Badge
                    variant="default"
                    className="ml-1 gap-1 bg-gradient-to-r from-primary to-accent px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary-foreground"
                  >
                    <Sparkles className="h-3 w-3" />
                    {profile.member_tag}
                  </Badge>
                )}
              </div>
            )}
            {/* Mobile compact avatar */}
            {profile?.avatar_url && (
              <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full sm:hidden" />
            )}
            <Button variant="destructive" size="sm" onClick={handleLogout} className="px-2 sm:px-3">
              <LogOut className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Log Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 md:py-8 animate-fade-in">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur md:hidden">
        <div className="grid h-16 grid-cols-4 px-1 pb-[env(safe-area-inset-bottom)]">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "scale-110 transition-transform")} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <footer className="hidden border-t border-border/50 py-6 md:block">
        <div className="container flex items-center justify-center">
          <Link
            to="/legal"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Mentions légales
          </Link>
        </div>
      </footer>
    </div>
  );
};
