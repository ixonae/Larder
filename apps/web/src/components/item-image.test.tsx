import { imageUrl, newId } from "@larder/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ItemImage } from "./item-image.tsx";

it("falls back to the authenticated variant and tries bundled artwork again for a new source", () => {
  const imageId = newId();
  const oldKey = "a".repeat(64);
  const newKey = "b".repeat(64);
  const { rerender } = render(
    <ItemImage imageId={imageId} artworkKey={oldKey} size="small" alt="Glass" />,
  );
  const img = screen.getByRole("img", { name: "Glass" });
  expect(img).toHaveAttribute("src", imageUrl(imageId, "small", oldKey));
  fireEvent.error(img);
  expect(img).toHaveAttribute("src", imageUrl(imageId, "small"));
  fireEvent.error(img);
  expect(img).toHaveAttribute("src", imageUrl(imageId, "small"));

  rerender(<ItemImage imageId={imageId} artworkKey={newKey} size="small" alt="Glass" />);
  expect(img).toHaveAttribute("src", imageUrl(imageId, "small", newKey));
});
