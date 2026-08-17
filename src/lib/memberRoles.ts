import type { CSSProperties } from "react";

export interface MemberRole {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export const NO_ROLE_VALUE = "__none__";

/** Dégradé d'origine du badge VIP (primary → accent). */
export const DEFAULT_ROLE_COLOR = "linear-gradient(135deg,#3b82f6,#f97316)";

export const ROLE_COLOR_PALETTE = [
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#84cc16",
  "#f97316",
  "#64748b",
];

/** Dégradés prêts à l'emploi pour les rôles. */
export const ROLE_GRADIENT_PALETTE = [
  { label: "SlowRun", value: "linear-gradient(135deg,#3b82f6,#f97316)" },
  { label: "Océan", value: "linear-gradient(135deg,#06b6d4,#3b82f6)" },
  { label: "Violet", value: "linear-gradient(135deg,#8b5cf6,#ec4899)" },
  { label: "Coucher", value: "linear-gradient(135deg,#f97316,#ef4444)" },
  { label: "Or", value: "linear-gradient(135deg,#fbbf24,#f59e0b)" },
  { label: "Émeraude", value: "linear-gradient(135deg,#10b981,#84cc16)" },
  { label: "Néon", value: "linear-gradient(135deg,#a855f7,#22d3ee)" },
  { label: "Acier", value: "linear-gradient(135deg,#64748b,#0f172a)" },
];

export const isGradientColor = (color: string) => color?.startsWith("linear-gradient");

/** Style CSS d'un badge de rôle (supporte couleur unie ou dégradé). */
export const roleBadgeStyle = (color?: string | null): CSSProperties => ({
  background: color || DEFAULT_ROLE_COLOR,
  color: "#fff",
});
