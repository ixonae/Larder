import { describe, expect, it } from "vitest";
import {
  ancestors,
  buildTree,
  descendants,
  flattenTree,
  subtreeIds,
  type TreeItem,
} from "./tree.ts";

const item = (id: string, parent_id: string | null = null): TreeItem => ({ id, parent_id });

// spirit › whisky › scotch › islay, spirit › gin, juice
const items = [
  item("gin", "spirit"),
  item("islay", "scotch"),
  item("juice"),
  item("scotch", "whisky"),
  item("spirit"),
  item("whisky", "spirit"),
];

describe("buildTree", () => {
  it("nests children under their parent, keeping input order", () => {
    expect(buildTree(items)).toEqual([
      { ...item("juice"), children: [] },
      {
        ...item("spirit"),
        children: [
          { ...item("gin", "spirit"), children: [] },
          {
            ...item("whisky", "spirit"),
            children: [
              {
                ...item("scotch", "whisky"),
                children: [{ ...item("islay", "scotch"), children: [] }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("returns an empty list for no items", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("makes an item whose parent is missing a root", () => {
    expect(buildTree([item("a", "gone")])).toEqual([{ ...item("a", "gone"), children: [] }]);
  });

  it("leaves out items caught in a cycle", () => {
    expect(buildTree([item("a", "b"), item("b", "a"), item("c")])).toEqual([
      { ...item("c"), children: [] },
    ]);
  });

  it("keeps extra fields and does not change the input", () => {
    const input = [{ ...item("a"), name: "A" }];
    expect(buildTree(input)[0]?.name).toBe("A");
    expect(input[0]).not.toHaveProperty("children");
  });
});

describe("ancestors", () => {
  it("lists the chain up to the root, nearest first", () => {
    expect(ancestors(items, "islay").map((i) => i.id)).toEqual(["scotch", "whisky", "spirit"]);
  });

  it("is empty for a root", () => {
    expect(ancestors(items, "spirit")).toEqual([]);
  });

  it("is empty for an unknown id", () => {
    expect(ancestors(items, "nope")).toEqual([]);
  });

  it("stops at a missing parent", () => {
    expect(ancestors([item("a", "b"), item("b", "gone")], "a").map((i) => i.id)).toEqual(["b"]);
  });

  it("stops on a cycle", () => {
    const cycle = [item("a", "b"), item("b", "c"), item("c", "a")];
    expect(ancestors(cycle, "a").map((i) => i.id)).toEqual(["b", "c"]);
  });
});

describe("descendants", () => {
  it("lists everything below, breadth first", () => {
    expect(descendants(items, "spirit").map((i) => i.id)).toEqual([
      "gin",
      "whisky",
      "scotch",
      "islay",
    ]);
  });

  it("is empty for a leaf or an unknown id", () => {
    expect(descendants(items, "islay")).toEqual([]);
    expect(descendants(items, "nope")).toEqual([]);
  });

  it("is safe on cycles", () => {
    const cycle = [item("a", "b"), item("b", "a")];
    expect(descendants(cycle, "a").map((i) => i.id)).toEqual(["b"]);
  });
});

describe("subtreeIds", () => {
  it("holds the item and everything below it", () => {
    expect(subtreeIds(items, "whisky")).toEqual(new Set(["whisky", "scotch", "islay"]));
    expect(subtreeIds(items, "juice")).toEqual(new Set(["juice"]));
  });
});

describe("flattenTree", () => {
  it("lists nodes in display order with their depth, without children", () => {
    expect(flattenTree(buildTree(items)).map(({ item, depth }) => [item.id, depth])).toEqual([
      ["juice", 0],
      ["spirit", 0],
      ["gin", 1],
      ["whisky", 1],
      ["scotch", 2],
      ["islay", 3],
    ]);
    expect(flattenTree(buildTree(items))[0]?.item).not.toHaveProperty("children");
  });
});
