import { COUNTRY_CODES, countryName } from "@larder/shared";
import { Combobox, type ComboboxOption, type ComboboxProps } from "@/components/combobox.tsx";

const byName = new Intl.Collator("en");

/** Combobox props for picking a country by English name; the value is the ISO 3166-1 alpha-2 code. */
export const countryPicker = {
  options: COUNTRY_CODES.map(
    (code): ComboboxOption => ({ value: code, label: countryName(code) }),
  ).sort((a, b) => byName.compare(a.label, b.label)),
  searchPlaceholder: "Search countries",
};

/** A searchable country dropdown ("jap" finds Japan, "reunion" finds Réunion). */
export function CountryPicker(props: Omit<ComboboxProps, "options">) {
  return <Combobox {...countryPicker} {...props} />;
}
