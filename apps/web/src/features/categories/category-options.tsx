import type { Category } from "@larder/shared";

/** `<option>`s for a category picker, indented by depth as `flattenTree` returns them. */
export function CategoryOptions({ items }: { items: { item: Category; depth: number }[] }) {
  return items.map(({ item, depth }) => (
    <option key={item.id} value={item.id}>
      {"  ".repeat(depth)}
      {item.name}
    </option>
  ));
}
