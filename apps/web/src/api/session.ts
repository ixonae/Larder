import type { Me } from "@larder/shared";
import type { QueryClient } from "@tanstack/react-query";
import { meQuery } from "./queries.ts";

const SESSION_CHANGE = "larder.session-changed";

/** The cookie is shared by tabs. Signal its replacement without putting session data in storage. */
export function notifySessionChange(): void {
  try {
    localStorage.setItem(SESSION_CHANGE, crypto.getRandomValues(new Uint32Array(4)).join("-"));
  } catch {
    // Browsers that disable storage still discover the new viewer when /me refetches on focus.
  }
}

export async function signedIn(client: QueryClient): Promise<void> {
  notifySessionChange();
  await client.invalidateQueries({ queryKey: meQuery.queryKey });
}

/** Discard the open document when its authenticated viewer changes, including a passive /me refresh. */
export function watchSession(client: QueryClient, onSessionEnd: () => void): () => void {
  let previous = client.getQueryData(meQuery.queryKey);
  const reset = (): void => {
    stop();
    client.clear();
    onSessionEnd();
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (
      event.type !== "updated" ||
      event.action.type !== "success" ||
      event.query.queryKey[0] !== meQuery.queryKey[0]
    )
      return;
    const me = event.action.data as Me | null;
    if (previous && previous.user.id !== me?.user.id) reset();
    previous = me;
  });
  const onStorage = (event: StorageEvent): void => {
    if (event.key === SESSION_CHANGE) reset();
  };
  window.addEventListener("storage", onStorage);
  function stop(): void {
    unsubscribe();
    window.removeEventListener("storage", onStorage);
  }
  return stop;
}
