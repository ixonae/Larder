import { describe, expect, it } from "vitest";
import { imageUrl, uploadImageSchema } from "./images.ts";

describe("imageUrl", () => {
  it("points at the picture or its thumbnail", () => {
    expect(imageUrl("abc")).toBe("/api/images/abc");
    expect(imageUrl("abc", "thumb")).toBe("/api/images/abc/thumb");
  });
});

describe("uploadImageSchema", () => {
  it("accepts the allowed picture types only", () => {
    const file = (type: string): { file: File } => ({ file: new File(["x"], "p", { type }) });
    expect(uploadImageSchema.safeParse(file("image/heic")).success).toBe(true);
    expect(uploadImageSchema.safeParse(file("image/gif")).success).toBe(false);
    expect(uploadImageSchema.safeParse({ file: "x" }).success).toBe(false);
  });
});
