import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { LayoutDashboard, ShieldCheck, KeyRound, LogOut, Wallet } from "lucide-react";
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
    { to: "/api-keys", label: "API Keys", icon: KeyRound },
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl">
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
              </div>
            )}
            <Button variant="destructive" size="sm" onClick={handleLogout}>
              <LogOut className="mr-1 h-4 w-4" /> Log Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 animate-fade-in">{children}</main>
    </div>
  );
};
