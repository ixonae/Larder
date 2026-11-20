import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Category, Image, Product, Utensil } from "@larder/shared";
import { and, count, eq } from "drizzle-orm";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { barMembers, categories, images, products } from "../../db/schema/index.ts";
import { createTestApp, errorOf, readJson as json, jsonRequest } from "../../test/app.ts";

const UNKNOWN = "01a1f326-d941-7d74-8a40-504a488cd388";
const png = (width = 2000, height = 1000) =>
  sharp({ create: { width, height, channels: 3, background: "#36c" } })
    .png()
    .toBuffer();

function setup(options: Parameters<typeof createTestApp>[0] = {}) {
  const t = createTestApp(options);
  const bar = `/api/bars/${t.alice.barId}`;
  const cat = (name: string, barId = t.alice.barId) =>
    t.db
      .select()
      .from(categories)
      .where(and(eq(categories.bar_id, barId), eq(categories.name, name)))
      .get() as { id: string };
  const post = async <T>(path: string, body: unknown) =>
    json<T>(await t.app.request(`${bar}${path}`, jsonRequest("POST", body)));
  const upload = async (path: string, data: Uint8Array | string, type = "image/png") => {
    const form = new FormData();
    form.append(
      "file",
      new File([typeof data === "string" ? data : new Uint8Array(data)], "photo", { type }),
    );
    return t.app.request(`${bar}${path}/image`, { method: "PUT", body: form });
  };
  const files = () => readdirSync(join(t.uploads, t.alice.barId)).sort();
  const imageCount = () => t.db.select({ n: count() }).from(images).get()?.n ?? 0;
  const product = () =>
    post<Product>("/products", { name: "Talisker", category_id: cat("Scotch").id });
  return { ...t, bar, cat, post, upload, files, imageCount, product };
}

describe("PUT /:entity/:id/image", () => {
  it("stores a WebP picture and its thumbnail, served with cache headers", async () => {
    const t = setup();
    const bottle = await t.product();
    const res = await t.upload(`/products/${bottle.id}`, await png());
    expect(res.status).toBe(200);
    const image = await json<Image>(res);
    expect(image).toMatchObject({ mime: "image/webp", width: 1600, height: 800 });
    const saved = await json<Product>(await t.app.request(`${t.bar}/products/${bottle.id}`));
    expect(saved.image_id).toBe(image.id);
    expect(t.files()).toEqual([`${image.id}-thumb.webp`, `${image.id}.webp`]);

    const full = await t.app.request(`/api/images/${image.id}`);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("image/webp");
    expect(full.headers.get("cache-control")).toBe("private, no-store");
    const bytes = Buffer.from(await full.arrayBuffer());
    expect(bytes.byteLength).toBe(image.size_bytes);
    const thumb = await t.app.request(`/api/images/${image.id}/thumb`);
    expect(await sharp(Buffer.from(await thumb.arrayBuffer())).metadata()).toMatchObject({
      width: 400,
      height: 200,
    });
  });

  it("replaces the previous picture and deletes it", async () => {
    const t = setup();
    const glass = await t.post<Utensil>("/utensils", { name: "Coupe", kind: "glass" });
    const first = await json<Image>(await t.upload(`/utensils/${glass.id}`, await png()));
    const second = await json<Image>(await t.upload(`/utensils/${glass.id}`, await png(300, 300)));
    expect(second.id).not.toBe(first.id);
    expect(t.imageCount()).toBe(1);
    expect(t.files()).toEqual([`${second.id}-thumb.webp`, `${second.id}.webp`]);
    expect((await t.app.request(`/api/images/${first.id}`)).status).toBe(404);
  });

  it("works for categories", async () => {
    const t = setup();
    const gin = t.cat("Gin");
    const image = await json<Image>(await t.upload(`/categories/${gin.id}`, await png()));
    const saved = await json<Category>(await t.app.request(`${t.bar}/categories/${gin.id}`));
    expect(saved.image_id).toBe(image.id);
  });

  it.each([
    ["a type that is not allowed", "text/plain", "Send a JPEG, PNG, WebP or HEIC picture"],
    ["bytes that are not a picture", "image/png", "Invalid form"],
  ])("refuses %s", async (_, type, message) => {
    const t = setup();
    const bottle = await t.product();
    const res = await t.upload(`/products/${bottle.id}`, "hello", type);
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error.code).toBe("VALIDATION");
    if (type === "text/plain") expect(JSON.stringify(error.details)).toContain(message);
    else expect(error.message).toBe("Could not read this picture");
    expect(t.imageCount()).toBe(0);
    expect(existsSync(join(t.uploads, t.alice.barId))).toBe(false);
  });

  it("refuses a form without a file", async () => {
    const t = setup();
    const bottle = await t.product();
    const form = new FormData();
    form.append("file", "text");
    const res = await t.app.request(`${t.bar}/products/${bottle.id}/image`, {
      method: "PUT",
      body: form,
    });
    expect(res.status).toBe(400);
  });

  it("refuses a picture larger than the upload limit", async () => {
    const t = setup({ maxBodyBytes: 2000 });
    const bottle = await t.product();
    const res = await t.upload(`/products/${bottle.id}`, await png());
    expect(res.status).toBe(413);
    expect((await errorOf(res)).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it.each([UNKNOWN, "nope"])("answers 404 for item %s", async (id) => {
    const t = setup();
    const res = await t.upload(`/products/${id}`, await png());
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toEqual({ code: "NOT_FOUND", message: "Product not found" });
  });

  it("answers 404 and keeps no file when the item is deleted while the picture is processed", async () => {
    const t = setup();
    const bottle = await t.product();
    const put = t.storage.put;
    t.storage.put = async (key, data) => {
      t.db.delete(products).where(eq(products.id, bottle.id)).run();
      return put(key, data);
    };
    const res = await t.upload(`/products/${bottle.id}`, await png());
    expect(res.status).toBe(404);
    expect(t.files()).toEqual([]);
    expect(t.imageCount()).toBe(0);
  });

  it("removes the file already written when the other one cannot be stored", async () => {
    const t = setup();
    const bottle = await t.product();
    const put = t.storage.put;
    t.storage.put = async (key, data) => {
      if (key.endsWith("-thumb.webp")) throw new Error("ENOSPC");
      return put(key, data);
    };
    const res = await t.upload(`/products/${bottle.id}`, await png());
    expect(res.status).toBe(500);
    expect(t.files()).toEqual([]);
    expect(t.imageCount()).toBe(0);
  });

  it("refuses a viewer", async () => {
    const t = setup();
    t.db
      .insert(barMembers)
      .values({ bar_id: t.bob.barId, user_id: t.alice.userId, role: "viewer" })
      .run();
    const form = new FormData();
    form.append("file", new File([await png()], "p", { type: "image/png" }));
    const url = `/api/bars/${t.bob.barId}/categories/${t.cat("Gin", t.bob.barId).id}/image`;
    expect((await t.app.request(url, { method: "PUT", body: form })).status).toBe(403);
    expect((await t.app.request(url, { method: "DELETE" })).status).toBe(403);
  });
});

describe("DELETE /:entity/:id/image", () => {
  it("removes the picture and its files; removing nothing is fine", async () => {
    const t = setup();
    const bottle = await t.product();
    const image = await json<Image>(await t.upload(`/products/${bottle.id}`, await png()));
    const url = `${t.bar}/products/${bottle.id}/image`;
    expect((await t.app.request(url, { method: "DELETE" })).status).toBe(204);
    const saved = await json<Product>(await t.app.request(`${t.bar}/products/${bottle.id}`));
    expect(saved.image_id).toBeNull();
    expect(t.files()).toEqual([]);
    expect((await t.app.request(`/api/images/${image.id}`)).status).toBe(404);
    expect((await t.app.request(url, { method: "DELETE" })).status).toBe(204);
    const missing = `${t.bar}/products/${UNKNOWN}/image`;
    expect((await t.app.request(missing, { method: "DELETE" })).status).toBe(404);
  });
});

describe("deleting an item", () => {
  it.each(["products", "utensils", "categories"] as const)(
    "deletes the picture of one of the %s",
    async (entity) => {
      const t = setup();
      const id =
        entity === "products"
          ? (await t.product()).id
          : entity === "utensils"
            ? (await t.post<Utensil>("/utensils", { name: "Jigger", kind: "tool" })).id
            : t.cat("Lime juice").id;
      await t.upload(`/${entity}/${id}`, await png());
      const res = await t.app.request(`${t.bar}/${entity}/${id}`, { method: "DELETE" });
      expect(res.status).toBe(204);
      expect(t.imageCount()).toBe(0);
      expect(t.files()).toEqual([]);
    },
  );
});

describe("GET /api/images/:id", () => {
  it("answers 404 for unknown ids and for a file missing on disk", async () => {
    const t = setup();
    expect((await t.app.request(`/api/images/${UNKNOWN}`)).status).toBe(404);
    expect((await t.app.request("/api/images/nope/thumb")).status).toBe(404);
    const bottle = await t.product();
    const image = await json<Image>(await t.upload(`/products/${bottle.id}`, await png()));
    await t.storage.delete(`${t.alice.barId}/${image.id}-thumb.webp`);
    expect((await t.app.request(`/api/images/${image.id}`)).status).toBe(200);
    const res = await t.app.request(`/api/images/${image.id}/thumb`);
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toEqual({ code: "NOT_FOUND", message: "Image not found" });
  });
});

describe("cross-bar isolation", () => {
  it("cannot attach to, remove, or read another bar's pictures", async () => {
    const t = setup();
    const bobs = t.cat("Gin", t.bob.barId);
    // Through Alice's bar, Bob's category does not exist.
    expect((await t.upload(`/categories/${bobs.id}`, await png())).status).toBe(404);
    const removal = `${t.bar}/categories/${bobs.id}/image`;
    expect((await t.app.request(removal, { method: "DELETE" })).status).toBe(404);
    // Bob's picture, stored for his bar, is invisible to Alice.
    const bobsImage = t.db
      .insert(images)
      .values({
        bar_id: t.bob.barId,
        created_by: t.bob.userId,
        storage_key: `${t.bob.barId}/x.webp`,
        thumb_key: `${t.bob.barId}/x-thumb.webp`,
        mime: "image/webp",
        width: 1,
        height: 1,
        size_bytes: 1,
      })
      .returning()
      .get();
    await t.storage.put(bobsImage.storage_key, new Uint8Array([1]));
    t.db.update(categories).set({ image_id: bobsImage.id }).where(eq(categories.id, bobs.id)).run();
    const res = await t.app.request(`/api/images/${bobsImage.id}`);
    expect(res.status).toBe(404);
    expect(t.db.select().from(categories).where(eq(categories.id, bobs.id)).get()?.image_id).toBe(
      bobsImage.id,
    );
  });
});

it("rate limits uploads across all entity routes before processing their contents", async () => {
  const t = setup();
  const id = t.cat("Gin").id;
  for (let attempt = 0; attempt < 20; attempt++) {
    expect((await t.upload(`/categories/${id}`, "invalid")).status).toBe(400);
  }
  const bottle = await t.product();
  expect((await t.upload(`/products/${bottle.id}`, await png(30, 30))).status).toBe(429);
  expect(t.imageCount()).toBe(0);
});
