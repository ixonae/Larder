import { z } from "zod";
import { DESCRIPTION_MAX } from "./categories.ts";
import { currencySchema } from "./currency.ts";
import { idSchema } from "./id.ts";
import { PRODUCT_TEXT_MAX } from "./products.ts";
import { optionalText } from "./text.ts";
import { isoDateSchema } from "./time.ts";

/** Most identical bottles one purchase request records. */
export const MAX_PURCHASE_COUNT = 24;

/** One physical bottle bought, and when it ran out (`finished_on`). */
export const purchaseSchema = z.object({
  id: idSchema,
  product_id: idSchema,
  bought_on: isoDateSchema,
  /** Price of this one bottle in minor units of `currency` (`formatMoney`). */
  price_minor: z.number().int().nullable(),
  /** Set exactly when `price_minor` is. */
  currency: currencySchema.nullable(),
  store: z.string().nullable(),
  notes: z.string().nullable(),
  /** The day the bottle ran out; null while it is open. */
  finished_on: isoDateSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Purchase = z.infer<typeof purchaseSchema>;

/** `GET /products/:id/purchases` (newest first) and the rows `POST` created. */
export const purchaseListSchema = z.object({ items: z.array(purchaseSchema) });
export type PurchaseList = z.infer<typeof purchaseListSchema>;

const fields = z.object({
  bought_on: isoDateSchema,
  price_minor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  /** Defaults to the bar's currency when a price is set. */
  currency: currencySchema,
  store: optionalText(PRODUCT_TEXT_MAX),
  notes: optionalText(DESCRIPTION_MAX),
});

/** `POST /products/:id/purchases`: `count` identical bottles (price per bottle). */
export const createPurchaseSchema = fields
  .partial()
  .required({ bought_on: true })
  .extend({ count: z.number().int().min(1).max(MAX_PURCHASE_COUNT).default(1) });
export type CreatePurchase = z.infer<typeof createPurchaseSchema>;

/** `PATCH /products/:id/purchases/:purchaseId`: a null `finished_on` reopens the bottle. */
export const updatePurchaseSchema = fields
  .extend({ finished_on: isoDateSchema.nullable() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Send at least one field to change");
export type UpdatePurchase = z.infer<typeof updatePurchaseSchema>;

/** `POST /products/:id/finish`: the oldest open bottle ran out, today unless `finished_on` says. */
export const finishProductSchema = z.object({ finished_on: isoDateSchema.optional() });
export type FinishProduct = z.infer<typeof finishProductSchema>;
