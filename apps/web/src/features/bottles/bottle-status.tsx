import { PRODUCT_STATUSES, type ProductStatus } from "@larder/shared";
import type { JSX } from "react";
import { badge } from "@/components/badge.ts";

const STATUS_LABEL: Record<ProductStatus, string> = {
  owned: "Owned",
  finished: "Finished",
  want_to_buy: "Want to buy",
  want_to_try: "Want to try",
  tasted: "Tasted",
};

/** The label of a bottle without a status, in pickers and filters. */
export const NO_STATUS_LABEL = "No status";

/** "Owned", or "No status" for a bottle without one. */
export const statusLabel = (status: ProductStatus | null): string =>
  status === null ? NO_STATUS_LABEL : STATUS_LABEL[status];

/** Combobox options for every status, in their usual order. */
export const statusOptions = PRODUCT_STATUSES.map((value) => ({
  value,
  label: STATUS_LABEL[value],
}));

const TONE: Record<ProductStatus, "brand" | "secondary" | "muted"> = {
  owned: "brand",
  finished: "muted",
  want_to_buy: "secondary",
  want_to_try: "secondary",
  tasted: "muted",
};

/** Nothing for a bottle without a status (one only in the catalogue). */
export function StatusBadge({
  status,
}: Readonly<{ status: ProductStatus | null }>): JSX.Element | null {
  if (status === null) return null;
  return <span className={badge({ tone: TONE[status] })}>{statusLabel(status)}</span>;
}
