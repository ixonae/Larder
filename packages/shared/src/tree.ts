/** Anything stored as a flat list with a parent pointer (categories). */
export interface TreeItem {
  id: string;
  parent_id: string | null;
}

export type TreeNode<T> = T & { children: TreeNode<T>[] };

/**
 * Nests a flat list. Siblings keep their order from `items`; an item whose parent is not in the list
 * becomes a root. Items caught in a parent cycle have no root to hang from and are left out.
 */
export function buildTree<T extends TreeItem>(items: readonly T[]): TreeNode<T>[] {
  const nodes = new Map<string, TreeNode<T>>();
  for (const item of items) nodes.set(item.id, { ...item, children: [] });
  const roots: TreeNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id === null ? undefined : nodes.get(node.parent_id);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** The chain above `id`, nearest first (parent, grandparent… root). Stops at a missing parent or a cycle. */
export function ancestors<T extends TreeItem>(items: readonly T[], id: string): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set([id]);
  const result: T[] = [];
  let parentId = byId.get(id)?.parent_id ?? null;
  while (parentId !== null && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    result.push(parent);
    seen.add(parentId);
    parentId = parent.parent_id;
  }
  return result;
}

/** `id` and every id below it: the categories `id` cannot be moved under. */
export function subtreeIds<T extends TreeItem>(items: readonly T[], id: string): Set<string> {
  return new Set([id, ...descendants(items, id).map((item) => item.id)]);
}

/** Flattens a nested tree back into a list in display order, with each item's depth (roots are 0). */
export function flattenTree<T extends TreeItem>(
  nodes: readonly TreeNode<T>[],
  depth = 0,
): { item: T; depth: number }[] {
  return nodes.flatMap(({ children, ...item }) => [
    { item: item as unknown as T, depth },
    ...flattenTree(children, depth + 1),
  ]);
}

/** Every item below `id`, breadth first (children, then grandchildren…). Safe on cycles. */
export function descendants<T extends TreeItem>(items: readonly T[], id: string): T[] {
  const children = new Map<string, T[]>();
  for (const item of items) {
    if (item.parent_id === null) continue;
    const siblings = children.get(item.parent_id);
    if (siblings) siblings.push(item);
    else children.set(item.parent_id, [item]);
  }
  const seen = new Set([id]);
  const queue = [id];
  const result: T[] = [];
  for (const current of queue) {
    for (const child of children.get(current) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      result.push(child);
      queue.push(child.id);
    }
  }
  return result;
}
