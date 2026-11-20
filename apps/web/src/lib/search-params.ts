import { z } from "zod";

/** A search filter that is on or absent: only `true` filters, and anything else is dropped. */
export const trueOnlyFlag = z
  .boolean()
  .optional()
  .catch(undefined)
  .transform((value: boolean | undefined): true | undefined => value || undefined);
