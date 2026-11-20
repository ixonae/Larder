import { describe, expect, it } from "vitest";
import { bottleCommentInputSchema } from "./bottle-comments.ts";
import { COMMENT_MAX } from "./feedback.ts";

describe("bottleCommentInputSchema", () => {
  it("trims the body and refuses it empty or too long", () => {
    expect(bottleCommentInputSchema.parse({ body: " Hi " })).toEqual({
      body: "Hi",
      is_private: false,
    });
    for (const body of ["", "  ", "x".repeat(COMMENT_MAX + 1)]) {
      expect(bottleCommentInputSchema.safeParse({ body }).success).toBe(false);
    }
  });
});
