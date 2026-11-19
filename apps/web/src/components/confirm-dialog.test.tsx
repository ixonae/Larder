import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client.ts";
import { ConfirmDialog, usedByOf } from "./confirm-dialog.tsx";

function Harness({ onConfirm }: { onConfirm: () => Promise<unknown> }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <span>{open ? "open" : "closed"}</span>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Gin?"
        description="This cannot be undone."
        onConfirm={onConfirm}
      />
    </>
  );
}

const conflict = new ApiError(409, "CONFLICT", '"Rum" still has sub-categories', {
  used_by: [
    { type: "category", id: "1", name: "Aged rum" },
    { type: "product", id: "2", name: "Plantation 3 Stars" },
  ],
});

describe("ConfirmDialog", () => {
  it("runs the action and closes", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<Harness onConfirm={onConfirm} />);
    const dialog = screen.getByRole("alertdialog", { name: "Delete Gin?" });
    expect(dialog).toHaveTextContent("This cannot be undone.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  it("lists what still uses the item on a conflict", async () => {
    render(<Harness onConfirm={() => Promise.reject(conflict)} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent('"Rum" still has sub-categories');
    expect(
      within(alert)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Aged rum (Category)", "Plantation 3 Stars (Bottle)"]);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("closed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows other errors and lets the user retry or cancel", async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error("Network down"));
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(screen.queryByText("Still used by:")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  it("disables the button while the action runs", async () => {
    let finish = () => {};
    render(<Harness onConfirm={() => new Promise<void>((r) => (finish = r))} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    finish();
    expect(await screen.findByText("closed")).toBeInTheDocument();
  });
});

describe("usedByOf", () => {
  it("only reads CONFLICT errors with a used_by list", () => {
    expect(usedByOf(conflict)).toHaveLength(2);
    expect(usedByOf(new Error("x"))).toBeNull();
    expect(usedByOf(new ApiError(404, "NOT_FOUND", "x"))).toBeNull();
    expect(usedByOf(new ApiError(409, "CONFLICT", "x", { other: 1 }))).toBeNull();
  });
});
