import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { dismissToast, Toaster, toast } from "./toaster.tsx";

describe("Toaster", () => {
  it("shows toasts and dismisses them", async () => {
    render(<Toaster />);
    act(() => {
      toast("Saved");
      toast("Could not save", { description: "Database is locked", variant: "error" });
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Database is locked")).toBeInTheDocument();
    const [first] = screen.getAllByRole("button", { name: "Dismiss" });
    await userEvent.click(first as HTMLElement);
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.getByText("Could not save")).toBeInTheDocument();
  });

  it("can be dismissed from code, and drops pending toasts when unmounted", () => {
    const { unmount } = render(<Toaster />);
    let id = 0;
    act(() => {
      id = toast("One");
      toast("Two");
    });
    act(() => dismissToast(id));
    expect(screen.queryByText("One")).not.toBeInTheDocument();
    // A second Toaster keeps the pending toasts alive until both are gone.
    const second = render(<Toaster />);
    unmount();
    expect(screen.getByText("Two")).toBeInTheDocument();
    second.unmount();
    render(<Toaster />);
    expect(screen.queryByText("Two")).not.toBeInTheDocument();
  });
});
