// Une seule app déployée sur le primary domain (slowrun.org).
// Tout le flux (login, dashboard) se passe sur le même domaine pour éviter
// les pertes de session et les boucles de redirection liées aux sous-domaines.

export const isOnDashboardHost = () => false;
export const isOnSiteHost = () => false;
export const shouldUseDashboardDomain = () => false;

export const getDashboardUrl = (path: string = "/dashboard") => path;

export const goToDashboard = (
  navigate: (path: string) => void,
  path: string = "/dashboard",
) => {
  navigate(path);
};
