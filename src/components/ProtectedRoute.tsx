import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNavVisibility } from "@/hooks/useNavVisibility";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  navKey?: string;
}

export const ProtectedRoute = ({ children, requireAdmin = false, navKey }: ProtectedRouteProps) => {
  const { loading, user, profile, isAdmin } = useAuth();
  const { isHidden, loaded } = useNavVisibility();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    const redirect = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }
  if (!profile) return <Navigate to="/pending" replace />;
  if (profile.status !== "approved") return <Navigate to="/pending" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/dashboard" replace />;
  if (navKey && !isAdmin && loaded && isHidden(navKey) && navKey !== "dashboard") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
