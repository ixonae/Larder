import { describe, expect, it } from "vitest";
import { hasRole, meSchema, ROLES, type Role } from "./tenancy.ts";

describe("hasRole", () => {
  const cases: [Role, Role, boolean][] = [
    ["viewer", "viewer", true],
    ["viewer", "editor", false],
    ["viewer", "owner", false],
    ["editor", "viewer", true],
    ["editor", "editor", true],
    ["editor", "owner", false],
    ["owner", "viewer", true],
    ["owner", "editor", true],
    ["owner", "owner", true],
  ];
  it.each(cases)("%s has %s rights: %s", (role, required, expected) => {
    expect(hasRole(role, required)).toBe(expected);
  });

  it("covers every role", () => {
    expect(new Set(cases.map(([r]) => r))).toEqual(new Set(ROLES));
  });
});

describe("meSchema", () => {
  it("rejects an unknown role", () => {
    const me = {
      user: { id: "01a1f326-d941-7d74-8a40-504a488cd388", email: "a@b.c", display_name: "A" },
      bars: [{ id: "01a1f326-d941-7d74-8a40-504a488cd388", name: "Bar", role: "admin" }],
    };
    expect(meSchema.safeParse(me).success).toBe(false);
  });
});
