export const VAULT_PLATFORMS = [
  "Ticketmaster",
  "Plénitude Arena",
  "Paris La Défense Arena",
  "Fnac Spectacles",
  "France Billet",
  "Live Nation",
  "Dice",
  "Weezevent",
  "Autre",
] as const;

export interface VaultAccount {
  id: string;
  user_id: string;
  platform: string;
  label: string | null;
  email: string;
  password: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface VaultCard {
  id: string;
  user_id: string;
  bank_name: string;
  cardholder: string;
  card_number: string;
  exp_month: string;
  exp_year: string;
  cvv: string;
  billing_address: string | null;
  notes: string | null;
  created_at: string;
}

export const maskCard = (number: string) => {
  const digits = (number ?? "").replace(/\s+/g, "");
  if (digits.length < 4) return "••••";
  return `•••• •••• •••• ${digits.slice(-4)}`;
};

export const formatCardNumber = (value: string) =>
  value
    .replace(/\D/g, "")
    .slice(0, 19)
    .replace(/(.{4})/g, "$1 ")
    .trim();

export interface VaultPlatform {
  id: string;
  name: string;
  sort_order: number;
}

export const VAULT_SECTION_LABEL = "Sécurité";
