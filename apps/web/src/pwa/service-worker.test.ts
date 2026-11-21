import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type RequestInfo = Pick<Request, "url" | "method" | "mode">;
type NavigationEvent = {
  request: RequestInfo;
  respondWith: (response: Promise<Response>) => void;
};
type WorkerListeners = {
  activate?: (event: { waitUntil: (claim: Promise<void>) => void }) => void;
  fetch?: (event: NavigationEvent) => void;
};

const origin: string = "https://larder.example";
const workerPath: string = resolve(import.meta.dirname, "../../public/service-worker.js");
const source: string = readFileSync(workerPath, "utf8");

function loadWorker(fetch: () => Promise<Response>, claim: () => Promise<void>): WorkerListeners {
  const listeners: WorkerListeners = {};
  runInNewContext(
    source,
    {
      URL,
      Response,
      fetch,
      self: {
        location: { origin },
        clients: { claim },
        addEventListener: <Type extends keyof WorkerListeners>(
          type: Type,
          listener: WorkerListeners[Type],
        ): void => {
          listeners[type] = listener;
        },
      },
    },
    // Let V8 associate coverage from the VM context with the deployed file.
    { filename: pathToFileURL(workerPath).href },
  );
  return listeners;
}

function dispatch(
  request: RequestInfo,
  fetch: () => Promise<Response>,
): Promise<Response> | undefined {
  const listeners = loadWorker(fetch, vi.fn());
  let response: Promise<Response> | undefined;
  if (!listeners.fetch) throw new Error("Missing service worker fetch listener");
  listeners.fetch({
    request,
    respondWith: (result: Promise<Response>): void => {
      response = result;
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

  it("waits for the worker to claim clients on activation", () => {
    const claimed = Promise.resolve();
    const claim = vi.fn().mockReturnValue(claimed);
    const waitUntil = vi.fn();
    loadWorker(vi.fn(), claim).activate?.({ waitUntil });
    expect(claim).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledWith(claimed);
  });

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
