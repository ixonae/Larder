const cache = new Map<string, Intl.DisplayNames>();

/** The localized name of a region or currency code, with one `Intl.DisplayNames` per type and locale. */
export function displayName(type: "region" | "currency", code: string, locale: string): string {
  const key = `${type}/${locale}`;
  let display = cache.get(key);
  if (!display) {
    display = new Intl.DisplayNames([locale], { type });
    cache.set(key, display);
  }
  // Callers only pass codes from their hard-coded lists, which every Intl implementation names.
  return display.of(code) as string;
}
