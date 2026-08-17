export interface NavTabDef {
  key: string;
  label: string;
  path: string;
}

/** Onglets du dashboard qui peuvent être masqués aux membres (les admins voient toujours tout). */
export const HIDEABLE_NAV_TABS: NavTabDef[] = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard" },
  { key: "credit", label: "Créditer", path: "/credit" },
  { key: "transactions", label: "Historique", path: "/transactions" },
  { key: "products", label: "Produits", path: "/products" },
  { key: "securite", label: "Sécurité", path: "/securite" },
];
