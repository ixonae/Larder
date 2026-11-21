import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type RequestInfo = Pick<Request, "url" | "method" | "mode">;
type NavigationEvent = {
  request: RequestInfo;
  respondWith: (response: Promise<Response>) => void;
};

const origin: string = "https://larder.example";
const worker: string = readFileSync(
  resolve(import.meta.dirname, "../../public/service-worker.js"),
  "utf8",
);

function dispatch(
  request: RequestInfo,
  fetch: () => Promise<Response>,
): Promise<Response> | undefined {
  let response: Promise<Response> | undefined;
  runInNewContext(worker, {
    URL,
    Response,
    fetch,
    self: {
      location: { origin },
      addEventListener: (type: string, handle: (event: NavigationEvent) => void): void => {
        if (type === "fetch") {
          handle({
            request,
            respondWith: (result: Promise<Response>) => {
              response = result;
            },
          });
        }
      },
    },
  });
  return response;
}

describe("Larder's service worker", () => {
  const navigation: RequestInfo = {
    url: `${origin}/cocktails?query=martini`,
    method: "GET",
    mode: "navigate",
  };

  it("preserves an HTTP response from the server", async () => {
    const response: Response = new Response("Page not found", { status: 404 });
    const network = vi.fn().mockResolvedValue(response);
    expect(await dispatch(navigation, network)).toBe(response);
    expect(network).toHaveBeenCalledWith(navigation);
  });

  it("returns the offline page when a navigation cannot reach the server", async () => {
    const network = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const response = await dispatch(navigation, network);
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(await response?.text()).toContain("Larder is offline");
  });

  it.each([
    { url: `${origin}/api` },
    { url: `${origin}/api/images/image-id` },
    { url: "https://another.example/" },
    { method: "POST" },
    { mode: "cors", url: `${origin}/assets/app-123.js` },
  ] satisfies Partial<RequestInfo>[])("leaves %o to the browser", (overrides) => {
    const network = vi.fn();
    expect(dispatch({ ...navigation, ...overrides }, network)).toBeUndefined();
    expect(network).not.toHaveBeenCalled();
  });
});
