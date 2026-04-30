// Centralise la redirection vers le dashboard.
// Si on est sur le domaine "site" (slowrun.org / www.slowrun.org),
// on envoie l'utilisateur sur le sous-domaine dashboard.slowrun.org.
// Partout ailleurs (dashboard.slowrun.org, preview Lovable, localhost),
// on reste sur le même domaine et on navigue en interne.

const DASHBOARD_HOST = "dashboard.slowrun.org";
const SITE_HOSTS = new Set(["slowrun.org", "www.slowrun.org"]);

export const shouldUseDashboardDomain = () => {
  if (typeof window === "undefined") return false;
  return SITE_HOSTS.has(window.location.hostname);
};

export const getDashboardUrl = (path: string = "/dashboard") =>
  `https://${DASHBOARD_HOST}${path}`;

export const goToDashboard = (
  navigate: (path: string) => void,
  path: string = "/dashboard",
) => {
  if (typeof window === "undefined") {
    navigate(path);
    return;
  }

  if (shouldUseDashboardDomain()) {
    window.location.href = getDashboardUrl(path);
    return;
  }

  navigate(path);
};
