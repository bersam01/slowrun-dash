// Centralise la redirection vers le dashboard.
// Sur le site (slowrun.org), on envoie sur dashboard.slowrun.org/ après login.
// Sur le sous-domaine dashboard, le dashboard est servi sur "/".

const DASHBOARD_HOST = "dashboard.slowrun.org";
const SITE_HOSTS = new Set(["slowrun.org", "www.slowrun.org"]);

export const isOnDashboardHost = () => {
  if (typeof window === "undefined") return false;
  return window.location.hostname === DASHBOARD_HOST;
};

export const isOnSiteHost = () => {
  if (typeof window === "undefined") return false;
  return SITE_HOSTS.has(window.location.hostname);
};

export const shouldUseDashboardDomain = () => isOnSiteHost();

export const getDashboardUrl = (path: string = "/") =>
  `https://${DASHBOARD_HOST}${path}`;

export const goToDashboard = (
  navigate: (path: string) => void,
  path: string = "/",
) => {
  if (typeof window === "undefined") {
    navigate(path);
    return;
  }

  if (isOnSiteHost()) {
    window.location.href = getDashboardUrl(path);
    return;
  }

  // Sur dashboard.slowrun.org ou preview/localhost : navigation interne
  navigate(path);
};
