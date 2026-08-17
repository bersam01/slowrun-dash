export interface MemberRole {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export const NO_ROLE_VALUE = "__none__";

export const DEFAULT_ROLE_COLOR = "#7c3aed";

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
