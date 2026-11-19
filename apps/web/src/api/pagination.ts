import { MAX_PAGE_LIMIT, type Page } from "@larder/shared";

export async function collectPages<T>(
  fetchPage: (query: { limit: string; cursor?: string | undefined }) => Promise<Page<T>>,
) {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const page = await fetchPage({ limit: String(MAX_PAGE_LIMIT), cursor: cursor ?? undefined });
    items.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor !== null);
  return items;
}
