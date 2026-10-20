import assert from "node:assert/strict";
import test from "node:test";
import "next/image.js";
import { imageConfigDefault } from "next/dist/shared/lib/image-config.js";
import nextConfig from "../next.config.mjs";

let moduleId = 0;

async function setup(t, { connection = {}, hidden = false, idle = true, decode = () => Promise.resolve() } = {}) {
  const qualities = imageConfigDefault.qualities;
  imageConfigDefault.qualities = nextConfig.images.qualities;
  t.after(() => { imageConfigDefault.qualities = qualities; });
  const images = [];
  const callbacks = new Map();
  const listeners = new Map();
  const routes = [];
  const downloads = [];
  let callbackId = 0;
  const schedule = (callback) => {
    callbacks.set(++callbackId, callback);
    return callbackId;
  };
  const globals = {
    navigator: { connection },
    fetch: (url, options) => {
      downloads.push({ url, options });
      return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["video"])) });
    },
    document: {
      hidden,
      addEventListener: (event, callback) => listeners.set(event, callback),
      removeEventListener: (event) => listeners.delete(event),
    },
    window: {
      location: { href: "https://shanzhy.io/" },
      ...(idle ? { requestIdleCallback: schedule, cancelIdleCallback: (id) => callbacks.delete(id) } : {}),
      setTimeout: schedule,
      clearTimeout: (id) => callbacks.delete(id),
    },
    Image: class {
      constructor() { images.push(this); }
      decode() { return decode(this); }
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  const assets = await import(`../components/preload-assets.js?test=${++moduleId}`);
  const advance = async () => {
    const [id, callback] = callbacks.entries().next().value;
    callbacks.delete(id);
    await callback();
  };
  return { ...assets, images, callbacks, listeners, routes, downloads, advance, router: { prefetch: (path) => routes.push(path) } };
}

test("home and text pages prepare without downloading project images or video", async (t) => {
  const assets = await setup(t);
  for (const route of ["/", "/about", "/contact"]) await assets.preloadRouteImages(route);
  assert.equal(assets.images.length, 0);
  assert.equal(assets.callbacks.size, 0);
  assert.equal(assets.routes.length, 0);
  assert.equal(assets.downloads.length, 0);
});

test("direct project entry decodes its own media with high priority", async (t) => {
  let finish;
  const assets = await setup(t, { decode: () => new Promise((resolve) => { finish = resolve; }) });
  let ready = false;
  const pending = assets.preloadRouteImages("/works/genesis").then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  assert.equal(assets.images.length, 1);
  assert.equal(assets.images[0].src, "/images/genesis.jpg");
  assert.equal(assets.images[0].fetchPriority, "high");
  finish();
  await pending;
  assert.equal(ready, true);
});

test("intent warming is deduplicated and promoted when it becomes critical", async (t) => {
  const assets = await setup(t);
  await assets.warmRouteAssets("/works/genesis?from=works#demo");
  await assets.warmRouteAssets("/works/genesis");
  assert.equal(assets.images.length, 1);
  assert.equal(assets.images[0].fetchPriority, "low");
  await assets.preloadRouteImages("/works/genesis");
  assert.equal(assets.images.length, 1);
  assert.equal(assets.images[0].fetchPriority, "high");
});

test("responsive detail media is prepared independently of its thumbnail", async (t) => {
  const assets = await setup(t);
  await assets.preloadRouteImages("/works");
  const thumbnails = assets.images.length;
  await assets.preloadRouteImages("/works/shanzhy-io");
  assert.equal(assets.images.length, thumbnails + 1);
  assert.notEqual(assets.images.at(-1).sizes, assets.images[1].sizes);
  assert.equal(assets.images.at(-1).fetchPriority, "high");
});

test("failed images release their cache entry and can be retried", async (t) => {
  let attempts = 0;
  const assets = await setup(t, { decode: () => ++attempts === 1 ? Promise.reject(new Error("offline")) : Promise.resolve() });
  await assets.preloadRouteImages("/works/genesis");
  await assets.preloadRouteImages("/works/genesis");
  assert.equal(attempts, 2);
});

test("background prefetch waits for idle, excludes the current route and advances in batches", async (t) => {
  const assets = await setup(t);
  const dispose = assets.preloadSiteAssets(assets.router, "/");
  assert.deepEqual(assets.routes, []);
  assert.equal(assets.images.length, 0);
  await assets.advance();
  assert.deepEqual(assets.routes, ["/works"]);
  assert.ok(assets.images.every((image) => image.fetchPriority === "low"));
  while (assets.callbacks.size) await assets.advance();
  assert.equal(assets.routes.length, 6);
  assert.equal(assets.routes.includes("/"), false);
  assert.equal(assets.downloads.length, 0);
  dispose();
  assert.equal(assets.listeners.size, 0);
});

test("background prefetch stops when disposed during image preparation", async (t) => {
  const finishes = [];
  const assets = await setup(t, { decode: () => new Promise((resolve) => finishes.push(resolve)) });
  const dispose = assets.preloadSiteAssets(assets.router, "/");
  const pending = assets.advance();
  dispose();
  finishes.forEach((finish) => finish());
  await pending;
  assert.equal(assets.callbacks.size, 0);
  assert.deepEqual(assets.routes, ["/works"]);
});

test("hidden tabs defer warming until visible and cancellation removes pending work", async (t) => {
  const assets = await setup(t, { hidden: true });
  const dispose = assets.preloadSiteAssets(assets.router, "/about");
  assert.equal(assets.callbacks.size, 0);
  document.hidden = false;
  assets.listeners.get("visibilitychange")();
  assert.equal(assets.callbacks.size, 1);
  dispose();
  assert.equal(assets.callbacks.size, 0);
  assert.equal(assets.listeners.size, 0);
  assert.deepEqual(assets.routes, []);
});

test("browsers without idle callbacks use cancellable background timers", async (t) => {
  const assets = await setup(t, { idle: false });
  const dispose = assets.preloadSiteAssets(assets.router, "/works");
  await assets.advance();
  assert.deepEqual(assets.routes, ["/about"]);
  dispose();
  assert.equal(assets.callbacks.size, 0);
});

test("save-data and slow connections avoid speculative background work", async (t) => {
  const assets = await setup(t);
  for (const connection of [{ saveData: true }, { effectiveType: "slow-2g" }, { effectiveType: "2g" }, { effectiveType: "3g" }]) {
    navigator.connection = connection;
    assert.equal(assets.preloadSiteAssets(assets.router, "/"), undefined);
  }
  assert.equal(assets.callbacks.size, 0);
  assert.equal(assets.images.length, 0);
  navigator.connection = { saveData: true };
  await assets.preloadRouteImages("/works/genesis");
  assert.equal(assets.images.length, 1);
});

test("Genesis intent starts one reusable video download without blocking image readiness", async (t) => {
  const assets = await setup(t);
  await assets.warmRouteAssets("/works/genesis");
  await assets.warmRouteAssets("/works/genesis");
  const first = assets.preloadGenesisVideo();
  assert.equal(first, assets.preloadGenesisVideo());
  const source = await first;
  assert.ok(source.startsWith("blob:"));
  URL.revokeObjectURL(source);
  assert.equal(assets.downloads.length, 1);
  assert.equal(assets.downloads[0].url, assets.GENESIS_VIDEO);
  assert.equal(assets.downloads[0].options.priority, "low");
});

test("failed and empty video downloads can be retried", async (t) => {
  const assets = await setup(t);
  const responses = [
    { ok: false, status: 503 },
    { ok: true, blob: async () => new Blob() },
    { ok: true, blob: async () => new Blob(["video"]) },
  ];
  globalThis.fetch = async () => responses.shift();
  await assert.rejects(assets.preloadGenesisVideo(), /503/);
  await assert.rejects(assets.preloadGenesisVideo(), /empty/);
  const source = await assets.preloadGenesisVideo();
  assert.ok(source.startsWith("blob:"));
  URL.revokeObjectURL(source);
});
