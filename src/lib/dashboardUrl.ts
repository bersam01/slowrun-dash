// Domaine public canonique de SlowRun.
// On tolère encore l'ancien sous-domaine dashboard.slowrun.app
// mais toutes les redirections prod doivent maintenant pointer vers slowrun.app.

const LEGACY_DASHBOARD_HOST = "dashboard.slowrun.app";
const SITE_HOST = "slowrun.app";

const getHost = () =>
  typeof window !== "undefined" ? window.location.hostname : "";

export const isOnDashboardHost = () => getHost() === DASHBOARD_HOST;
export const isOnSiteHost = () =>
  getHost() === SITE_HOST || getHost() === `www.${SITE_HOST}`;

const usesProdDomains = () => getHost() === LEGACY_DASHBOARD_HOST || isOnSiteHost();

export const getDashboardUrl = (path: string = "/dashboard") => {
  if (usesProdDomains()) {
    return `https://${SITE_HOST}${path === "/dashboard" ? "/dashboard" : path}`;
  }
  return path;
};

export const getSiteUrl = (path: string = "/login") => {
  if (usesProdDomains()) {
    return `https://${SITE_HOST}${path}`;
  }
  return path;
};

export const goToDashboard = (
  navigate: (path: string) => void,
  path: string = "/dashboard",
) => {
  if (usesProdDomains()) {
    window.location.href = getDashboardUrl(path);
    return;
  }
  navigate(path);
};

export const goToSite = (
  navigate: (path: string) => void,
  path: string = "/login",
) => {
  if (usesProdDomains()) {
    window.location.href = getSiteUrl(path);
    return;
  }
  navigate(path);
};
