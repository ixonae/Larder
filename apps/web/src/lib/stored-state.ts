import { useState } from "react";

/**
 * A per-viewer UI preference kept in localStorage. Falls back to `initial` when storage is empty,
 * holds an unknown value, or is unavailable (private mode, blocked site data).
 */
export function useStoredState<T extends string>(key: string, allowed: readonly T[], initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return allowed.find((option) => option === stored) ?? initial;
    } catch {
      return initial;
    }
  });
  const update = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // Not remembering the choice is fine; it still applies for this visit.
    }
  };
  return [value, update] as const;
}
