// Centralise la redirection vers le dashboard.
// Si on est sur le domaine "site" (slowrun.org / www.slowrun.org),
// on envoie l'utilisateur sur le sous-domaine dashboard.slowrun.org.
// Partout ailleurs (dashboard.slowrun.org, preview Lovable, localhost),
// on reste sur le même domaine et on navigue en interne.

const DASHBOARD_HOST = "dashboard.slowrun.org";
const SITE_HOSTS = new Set(["slowrun.org", "www.slowrun.org"]);

export const goToDashboard = (
  navigate: (path: string) => void,
  path: string = "/dashboard",
) => {
  if (typeof window === "undefined") {
    navigate(path);
    return;
  }

  const host = window.location.hostname;

  if (SITE_HOSTS.has(host)) {
    window.location.href = `https://${DASHBOARD_HOST}${path}`;
    return;
  }

  navigate(path);
};
