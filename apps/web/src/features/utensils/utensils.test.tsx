import type { Utensil } from "@larder/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { BAR_ID, meFixture, server } from "@/test/msw.ts";
import { renderWithProviders } from "@/test/render.tsx";

const url = `/api/bars/${BAR_ID}/utensils`;
const stamp = "2026-01-01T00:00:00.000Z";
let seq = 100;
const utensil = (name: string, extra: Partial<Utensil> = {}): Utensil => ({
  id: `01a1f326-d941-7d74-8a40-${String(++seq).padStart(12, "0")}`,
  name,
  kind: "glass",
  capacity_ml: null,
  description: null,
  created_at: stamp,
  updated_at: stamp,
  ...extra,
});

let store: Utensil[] = [];
let requests: { method: string; body?: unknown }[] = [];
const byName = (name: string) => store.find((u) => u.name === name) as Utensil;

/** A small fake of the utensils API: pages of `pageSize`, and a duplicate-name check. */
function useFakeApi(pageSize = 200) {
  server.use(
    http.get(url, ({ request }) => {
      const start = Number(new URL(request.url).searchParams.get("cursor") ?? 0);
      const sorted = [...store].sort((a, b) => a.name.localeCompare(b.name));
      const next = start + pageSize < sorted.length ? String(start + pageSize) : null;
      return HttpResponse.json({ items: sorted.slice(start, start + pageSize), next_cursor: next });
    }),
    http.post(url, async ({ request }) => {
      const body = (await request.json()) as Partial<Utensil> & { name: string };
      requests.push({ method: "POST", body });
      if (store.some((u) => u.name === body.name)) {
        const message = `A utensil named "${body.name}" already exists`;
        return HttpResponse.json(
          { error: { code: "CONFLICT", message, details: [{ path: ["name"], message }] } },
          { status: 409 },
        );
      }
      const created = utensil(body.name, body);
      store.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${url}/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<Utensil>;
      requests.push({ method: "PATCH", body });
      store = store.map((u) => (u.id === params.id ? { ...u, ...body } : u));
      return HttpResponse.json(store.find((u) => u.id === params.id));
    }),
    http.delete(`${url}/:id`, ({ params }) => {
      requests.push({ method: "DELETE" });
      store = store.filter((u) => u.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

beforeEach(() => {
  store = [
    utensil("Coupe", { capacity_ml: 180, description: "Vintage" }),
    utensil("Rocks"),
    utensil("Jigger", { kind: "tool" }),
  ];
  requests = [];
  useFakeApi();
});

const group = (name: string) => screen.getByRole("list", { name });
const rows = (name: string) =>
  within(group(name))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

async function open() {
  const view = renderWithProviders("/utensils");
  await screen.findByRole("list", { name: "Glasses" });
  return view;
}

describe("UtensilsPage", () => {
  it("groups glasses and tools, with capacity and description", async () => {
    await open();
    expect(rows("Glasses")).toEqual(["Coupe180 ml · Vintage", "Rocks"]);
    expect(rows("Tools")).toEqual(["Jigger"]);
  });

  it("hides an empty group and loads more pages", async () => {
    store = [utensil("Coupe"), utensil("Flute"), utensil("Rocks")];
    useFakeApi(2);
    const { user } = renderWithProviders("/utensils");
    await screen.findByRole("list", { name: "Glasses" });
    expect(screen.queryByRole("list", { name: "Tools" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(rows("Glasses")).toHaveLength(3));
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows an empty state, and a load error with a retry", async () => {
    let fail = true;
    server.use(
      http.get(url, () =>
        fail
          ? HttpResponse.json({ error: { code: "INTERNAL", message: "Down" } }, { status: 500 })
          : HttpResponse.json({ items: [], next_cursor: null }),
      ),
    );
    const { user } = renderWithProviders("/utensils");
    expect(await screen.findByRole("alert")).toHaveTextContent("Down");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No utensils yet")).toBeInTheDocument();
  });

  it("hides edit actions from viewers", async () => {
    server.use(
      http.get("/api/me", () =>
        HttpResponse.json({ ...meFixture, bars: [{ ...meFixture.bars[0], role: "viewer" }] }),
      ),
    );
    await open();
    expect(screen.queryByRole("button", { name: "Add utensil" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Coupe" })).not.toBeInTheDocument();
  });

  it("deletes a utensil after confirmation", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Delete Jigger" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete Jigger?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Deleted Jigger")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("list", { name: "Tools" })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Delete Rocks" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(store).toHaveLength(2);
  });
});

describe("UtensilSheet", () => {
  it("closes without saving", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add utensil" }));
    await screen.findByRole("dialog", { name: "New utensil" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(requests).toEqual([]);
  });

  it("adds a glass with its capacity", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add utensil" }));
    const sheet = await screen.findByRole("dialog", { name: "New utensil" });
    await user.type(within(sheet).getByLabelText("Name"), "Highball");
    await user.type(within(sheet).getByLabelText("Capacity (ml)"), "350");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Utensil added")).toBeInTheDocument();
    expect(requests[0]?.body).toEqual({
      name: "Highball",
      kind: "glass",
      capacity_ml: 350,
      description: null,
    });
    await waitFor(() => expect(rows("Glasses")).toContain("Highball350 ml"));
  });

  it("drops the capacity when a glass is turned into a tool", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Edit Coupe" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit Coupe" });
    expect(within(sheet).getByLabelText("Capacity (ml)")).toHaveValue(180);
    await user.selectOptions(within(sheet).getByLabelText("Kind"), "Tool");
    expect(within(sheet).queryByLabelText("Capacity (ml)")).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Utensil saved")).toBeInTheDocument();
    expect(requests[0]?.body).toMatchObject({ kind: "tool", capacity_ml: null });
    await waitFor(() => expect(rows("Tools")).toEqual(["CoupeVintage", "Jigger"]));
  });

  it("ignores an invalid capacity once the glass is turned into a tool", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add utensil" }));
    const sheet = await screen.findByRole("dialog", { name: "New utensil" });
    await user.type(within(sheet).getByLabelText("Name"), "Muddler");
    await user.type(within(sheet).getByLabelText("Capacity (ml)"), "0");
    await user.selectOptions(within(sheet).getByLabelText("Kind"), "Tool");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Utensil added")).toBeInTheDocument();
    expect(requests[0]?.body).toMatchObject({ name: "Muddler", kind: "tool", capacity_ml: null });
  });

  it("shows a duplicate name on the field and other errors in a toast", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Add utensil" }));
    const sheet = await screen.findByRole("dialog", { name: "New utensil" });
    await user.type(within(sheet).getByLabelText("Name"), "Rocks");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(
      await within(sheet).findByText('A utensil named "Rocks" already exists'),
    ).toBeInTheDocument();

    server.use(
      http.post(url, () =>
        HttpResponse.json({ error: { code: "INTERNAL", message: "Disk full" } }, { status: 500 }),
      ),
    );
    await user.clear(within(sheet).getByLabelText("Name"));
    await user.type(within(sheet).getByLabelText("Name"), "Other");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Could not save the utensil")).toBeInTheDocument();
    expect(byName("Rocks")).toBeTruthy();
  });
});
