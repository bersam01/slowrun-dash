// Le site marketing/login vit sur slowrun.org.
// Une fois connecté, l'utilisateur est envoyé sur dashboard.slowrun.org.
// En dev/preview (lovable.app, localhost…), tout reste sur le même origin.

const DASHBOARD_HOST = "dashboard.slowrun.app";
const SITE_HOST = "slowrun.app";

const getHost = () =>
  typeof window !== "undefined" ? window.location.hostname : "";

export const isOnDashboardHost = () => getHost() === DASHBOARD_HOST;
export const isOnSiteHost = () =>
  getHost() === SITE_HOST || getHost() === `www.${SITE_HOST}`;

const usesProdDomains = () => isOnDashboardHost() || isOnSiteHost();

export const getDashboardUrl = (path: string = "/dashboard") => {
  if (usesProdDomains()) {
    return `https://${DASHBOARD_HOST}${path === "/dashboard" ? "/" : path}`;
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
