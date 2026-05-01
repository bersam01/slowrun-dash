import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, ShieldCheck, Package, LogOut, Wallet, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { profile, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/credit", label: "Créditer", icon: Wallet },
    { to: "/products", label: "Produits", icon: Package },
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/95">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link to="/dashboard"><Logo /></Link>

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

          <div className="flex items-center gap-3">
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
            <Button variant="destructive" size="sm" onClick={handleLogout}>
              <LogOut className="mr-1 h-4 w-4" /> Log Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 animate-fade-in">{children}</main>

      <footer className="border-t border-border/50 py-6">
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
