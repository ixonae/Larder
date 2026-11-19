import { describe, expect, it, vi } from "vitest";
import { createLogger } from "./logger.ts";

describe("createLogger", () => {
  it("writes JSON lines at or above the level", () => {
    const lines: string[] = [];
    const log = createLogger("info", (l) => lines.push(l));
    log.debug("hidden");
    log.info("hello", { a: 1 });
    log.warn("careful");
    log.error("boom");
    expect(lines.map((l) => JSON.parse(l))).toMatchObject([
      { level: "info", msg: "hello", a: 1 },
      { level: "warn", msg: "careful" },
      { level: "error", msg: "boom" },
    ]);
  });

  it("writes nothing when silent", () => {
    const lines: string[] = [];
    const log = createLogger("silent", (l) => lines.push(l));
    log.error("boom");
    expect(lines).toEqual([]);
  });

  it("writes to stdout by default", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    createLogger("info").info("x");
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"msg":"x"'));
    write.mockRestore();
  });
});
