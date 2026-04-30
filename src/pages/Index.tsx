import { Navigate } from "react-router-dom";
import { isOnDashboardHost } from "@/lib/dashboardUrl";
import Dashboard from "./Dashboard";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const Index = () => {
  // Sur dashboard.slowrun.org, "/" sert directement le dashboard (protégé)
  if (isOnDashboardHost()) {
    return (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    );
  }
  // Sur slowrun.org / preview / localhost, "/" envoie vers /login
  return <Navigate to="/login" replace />;
};

export default Index;
