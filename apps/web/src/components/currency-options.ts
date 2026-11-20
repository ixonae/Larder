import { CURRENCY_CODES, type CurrencyCode, currencyName } from "@larder/shared";
import type { ComboboxOption } from "@/components/combobox.tsx";

/** "JPY — Japanese yen": how a currency reads in lists and pickers. */
export const currencyLabel = (code: CurrencyCode) => `${code} — ${currencyName(code)}`;

/** Combobox props for picking any supported ISO 4217 currency; the value is the code. */
export const currencyPicker = {
  options: CURRENCY_CODES.map(
    (code): ComboboxOption => ({ value: code, label: currencyLabel(code) }),
  ),
  searchPlaceholder: "Search currencies",
};
