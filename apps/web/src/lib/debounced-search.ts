import { useEffect, useEffectEvent, useState } from "react";

const SEARCH_DELAY_MS = 250;

/** Keep the input responsive while committing the search only after typing pauses. */
export function useDebouncedSearch(search: string, commit: (value: string) => void) {
  const [draft, setDraft] = useState(search);
  const commitSearch = useEffectEvent(commit);

  useEffect(() => setDraft(search), [search]);
  useEffect(() => {
    if (draft === search) return;
    const timer = setTimeout(() => commitSearch(draft), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, search]);

  return [draft, setDraft] as const;
}
