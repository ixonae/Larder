import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDiskStorage, type ImageStorage } from "./storage.ts";

const fresh = (): { root: string; storage: ImageStorage } => {
  const root = mkdtempSync(join(tmpdir(), "larder-storage-"));
  return { root, storage: createDiskStorage(root) };
};

describe("createDiskStorage", () => {
  it("puts, gets and deletes files in sub-directories", async () => {
    const { root, storage } = fresh();
    await storage.put("bar/a.webp", new Uint8Array([1, 2, 3]));
    expect(existsSync(join(root, "bar/a.webp"))).toBe(true);
    expect([...((await storage.get("bar/a.webp")) ?? [])]).toEqual([1, 2, 3]);
    await storage.delete("bar/a.webp");
    expect(await storage.get("bar/a.webp")).toBeNull();
    await expect(storage.delete("bar/a.webp")).resolves.toBeUndefined();
  });

  it("refuses keys outside its root", async () => {
    const { storage } = fresh();
    await expect(storage.put("../x", new Uint8Array())).rejects.toThrow(/Invalid storage key/);
    await expect(storage.get("/etc/passwd")).rejects.toThrow(/Invalid storage key/);
  });

  it("reports read errors other than a missing file", async () => {
    const { root, storage } = fresh();
    mkdirSync(join(root, "dir"));
    await expect(storage.get("dir")).rejects.toThrow(/EISDIR/);
  });
});
