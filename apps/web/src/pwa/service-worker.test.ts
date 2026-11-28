import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type RequestInfo = Pick<Request, "url" | "method" | "mode">;
type NavigationEvent = {
  request: RequestInfo;
  preloadResponse?: Promise<Response | undefined>;
  respondWith: (response: Promise<Response>) => void;
};
type WorkerListeners = {
  activate?: (event: { waitUntil: (claim: Promise<void>) => void }) => void;
  fetch?: (event: NavigationEvent) => void;
};

const origin: string = "https://larder.example";
const workerPath: string = resolve(import.meta.dirname, "../../public/service-worker.js");
const source: string = readFileSync(workerPath, "utf8");

function loadWorker(
  fetch: () => Promise<Response>,
  claim: () => Promise<void>,
  navigationPreload?: { enable: () => Promise<void> },
): WorkerListeners {
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
        registration: { navigationPreload },
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
  listeners: WorkerListeners,
  preloadResponse?: Promise<Response | undefined>,
): Promise<Response> | undefined {
  let response: Promise<Response> | undefined;
  if (!listeners.fetch) throw new Error("Missing service worker fetch listener");
  listeners.fetch({
    request,
    preloadResponse,
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

  it("enables navigation preload and waits for the worker to claim clients on activation", async () => {
    const claim = vi.fn().mockResolvedValue(undefined);
    const enable = vi.fn().mockResolvedValue(undefined);
    const waitUntil = vi.fn<(claim: Promise<void>) => void>();
    loadWorker(vi.fn(), claim, { enable }).activate?.({ waitUntil });
    expect(claim).toHaveBeenCalledOnce();
    expect(enable).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toEqual([undefined, undefined]);
  });

  it.each([undefined, { enable: (): Promise<void> => Promise.reject(new Error("Unavailable")) }])(
    "claims clients when navigation preload cannot be enabled (%o)",
    async (navigationPreload) => {
      const claim = vi.fn().mockResolvedValue(undefined);
      const waitUntil = vi.fn<(claim: Promise<void>) => void>();
      loadWorker(vi.fn(), claim, navigationPreload).activate?.({ waitUntil });
      await expect(waitUntil.mock.calls[0]?.[0]).resolves.toEqual([undefined, undefined]);
      expect(claim).toHaveBeenCalledOnce();
    },
  );

  it("uses the preloaded response without making a second fetch", async () => {
    const network = vi.fn();
    const response = new Response("Ready");
    expect(
      await dispatch(navigation, loadWorker(network, vi.fn()), Promise.resolve(response)),
    ).toBe(response);
    expect(network).not.toHaveBeenCalled();
  });

  it("reuses private image navigation preload without making a second request", async () => {
    const request = { ...navigation, url: `${origin}/api/images/image-id` };
    const network = vi.fn();
    const response = new Response("Image", { headers: { "Content-Type": "image/webp" } });
    const worker = loadWorker(network, vi.fn());
    expect(await dispatch(request, worker, Promise.resolve(response))).toBe(response);
    expect(network).not.toHaveBeenCalled();
  });

  it("preserves API errors instead of showing the app's offline page", async () => {
    const request = { ...navigation, url: `${origin}/api` };
    const response = new Response("Unauthorized", { status: 401 });
    const network = vi.fn().mockResolvedValue(response);
    const worker = loadWorker(network, vi.fn());
    expect(await dispatch(request, worker, Promise.resolve(undefined))).toBe(response);
    expect(network).toHaveBeenCalledExactlyOnceWith(request);
    const offline = new TypeError("Failed to fetch");
    await expect(dispatch(request, worker, Promise.reject(offline))).rejects.toBe(offline);
    expect(network).toHaveBeenCalledOnce();
  });

  it("preserves an HTTP response from the server", async () => {
    const response: Response = new Response("Page not found", { status: 404 });
    const network = vi.fn().mockResolvedValue(response);
    expect(await dispatch(navigation, loadWorker(network, vi.fn()))).toBe(response);
    expect(network).toHaveBeenCalledWith(navigation);
  });

  it.each([false, true])(
    "returns the offline page when a navigation cannot reach the server (preload=%s)",
    async (preload) => {
      const error = new TypeError("Failed to fetch");
      const network = vi.fn().mockRejectedValue(error);
      const response = await dispatch(
        navigation,
        loadWorker(network, vi.fn()),
        preload ? Promise.reject(error) : undefined,
      );
      expect(network).toHaveBeenCalledTimes(preload ? 0 : 1);
      expect(response?.status).toBe(503);
      expect(response?.headers.get("Cache-Control")).toBe("no-store");
      expect(await response?.text()).toContain("Larder is offline");
    },
  );

  it.each([
    { url: `${origin}/api` },
    { url: `${origin}/api/images/image-id` },
    { url: "https://another.example/" },
    { method: "POST" },
    { mode: "cors", url: `${origin}/assets/app-123.js` },
  ] satisfies Partial<RequestInfo>[])("leaves %o to the browser", async (overrides) => {
    const network = vi.fn();
    const worker = loadWorker(network, vi.fn());
    expect(dispatch({ ...navigation, ...overrides }, worker)).toBeUndefined();
    expect(network).not.toHaveBeenCalled();
    const page = new Response("Ready");
    network.mockResolvedValue(page);
    expect(await dispatch(navigation, worker)).toBe(page);
  });
});
