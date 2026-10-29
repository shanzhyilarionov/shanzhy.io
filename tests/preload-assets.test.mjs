import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import "next/image.js";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import nextConfigLoader from "next/dist/server/config.js";
import { imageConfigDefault } from "next/dist/shared/lib/image-config.js";

const nextConfig = await nextConfigLoader.default(PHASE_DEVELOPMENT_SERVER, fileURLToPath(new URL("..", import.meta.url)));

let moduleId = 0;

async function setup(t, { connection = {}, hidden = false, idle = true, decode = () => Promise.resolve() } = {}) {
  const qualities = imageConfigDefault.qualities;
  const localPatterns = imageConfigDefault.localPatterns;
  imageConfigDefault.qualities = nextConfig.images.qualities;
  imageConfigDefault.localPatterns = nextConfig.images.localPatterns;
  t.after(() => {
    imageConfigDefault.qualities = qualities;
    imageConfigDefault.localPatterns = localPatterns;
  });
  const images = [];
  const callbacks = new Map();
  const listeners = new Map();
  const routes = [];
  const downloads = [];
  const videos = [];
  const observers = [];
  class Video extends EventTarget {
    attributes = new Map();
    currentTime = 0;
    duration = 41.4;
    readyState = 0;
    error = null;
    ranges = [];
    buffered = {
      get length() { return this.video.ranges.length; },
      start(index) { return this.video.ranges[index][0]; },
      end(index) { return this.video.ranges[index][1]; },
      video: this,
    };
    load = t.mock.fn(() => { this.error = null; });
    get src() { return this.getAttribute("src"); }
    set src(value) { this.setAttribute("src", value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
  }
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
      createElement: (tag) => {
        assert.equal(tag, "video");
        const video = new Video();
        videos.push(video);
        return video;
      },
      addEventListener: (event, callback) => listeners.set(event, callback),
      removeEventListener: (event) => listeners.delete(event),
    },
    window: {
      location: { href: "https://shanzhy.io/" },
      ...(idle ? { requestIdleCallback: schedule, cancelIdleCallback: (id) => callbacks.delete(id) } : {}),
      setTimeout: schedule,
      clearTimeout: (id) => callbacks.delete(id),
      IntersectionObserver: class {
        constructor(callback) {
          this.callback = callback;
          observers.push(this);
        }
        observe = t.mock.fn();
        disconnect = t.mock.fn();
      },
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
  return { ...assets, images, videos, observers, callbacks, listeners, routes, downloads, advance, router: { prefetch: (path) => routes.push(path) } };
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

test("Genesis intent preloads one reusable native player without fetching a complete blob", async (t) => {
  const assets = await setup(t);
  await assets.warmRouteAssets("/works/genesis");
  await assets.warmRouteAssets("/works/genesis");
  const first = assets.preloadGenesisVideo();
  assert.equal(first, assets.preloadGenesisVideo());
  assert.equal(assets.videos.length, 1);
  assert.equal(first.src, assets.GENESIS_VIDEO);
  assert.equal(first.preload, "auto");
  assert.equal(first.muted, true);
  assert.equal(first.playsInline, true);
  assert.equal(first.load.mock.callCount(), 1);
  assert.equal(assets.downloads.length, 0);
});

test("failed or released media can restart on the same native player", async (t) => {
  const assets = await setup(t);
  const video = assets.preloadGenesisVideo();
  video.error = new Error("offline");
  assert.equal(assets.preloadGenesisVideo(), video);
  assert.equal(video.load.mock.callCount(), 2);
  video.removeAttribute("src");
  assert.equal(assets.preloadGenesisVideo(), video);
  assert.equal(video.src, assets.GENESIS_VIDEO);
  assert.equal(video.load.mock.callCount(), 3);
  assert.equal(assets.videos.length, 1);
});

test("initial readiness needs a decoded frame and three contiguous seconds, not the full video", async (t) => {
  const assets = await setup(t);
  const video = assets.preloadGenesisVideo();
  let settled = false;
  const ready = assets.waitForVideoBuffer(video).then((status) => {
    settled = true;
    return status;
  });
  video.ranges = [[0, 4]];
  video.dispatchEvent(new Event("progress"));
  await Promise.resolve();
  assert.equal(settled, false);
  video.readyState = 2;
  video.ranges = [[0, 2], [5, 10]];
  video.dispatchEvent(new Event("loadeddata"));
  await Promise.resolve();
  assert.equal(settled, false);
  video.ranges = [[0, 3.1]];
  video.dispatchEvent(new Event("progress"));
  assert.equal(await ready, "ready");
  assert.ok(video.ranges[0][1] < video.duration);
  assert.equal(assets.callbacks.size, 0);
});

test("a warm buffer and clips shorter than the buffer target are ready immediately", async (t) => {
  const assets = await setup(t);
  const video = assets.preloadGenesisVideo();
  video.readyState = 2;
  video.currentTime = 2;
  video.ranges = [[0, 5]];
  assert.equal(await assets.waitForVideoBuffer(video), "ready");
  video.currentTime = 0;
  video.duration = 1.5;
  video.ranges = [[0, 1.5]];
  assert.equal(await assets.waitForVideoBuffer(video), "ready");
  assert.equal(assets.callbacks.size, 0);
});

test("slow buffering releases the loading gate at the deadline without stopping the download", async (t) => {
  const assets = await setup(t);
  const video = assets.preloadGenesisVideo();
  const ready = assets.waitForVideoBuffer(video);
  await assets.advance();
  assert.equal(await ready, "timeout");
  assert.equal(video.src, assets.GENESIS_VIDEO);
  assert.equal(video.preload, "auto");
  assert.equal(video.load.mock.callCount(), 1);
  assert.equal(assets.callbacks.size, 0);
});

test("errors and navigation cancellation release buffer listeners and timers", async (t) => {
  const assets = await setup(t);
  const video = assets.preloadGenesisVideo();
  const failed = assets.waitForVideoBuffer(video);
  video.error = new Error("offline");
  video.dispatchEvent(new Event("error"));
  assert.equal(await failed, "error");
  video.error = null;
  const controller = new AbortController();
  const cancelled = assets.waitForVideoBuffer(video, { signal: controller.signal });
  controller.abort();
  assert.equal(await cancelled, "aborted");
  assert.equal(await assets.waitForVideoBuffer(video, { signal: controller.signal }), "aborted");
  assert.equal(assets.callbacks.size, 0);
});

test("visible Genesis cards warm during idle and reuse the player on later intent", async (t) => {
  const assets = await setup(t);
  const target = {};
  const dispose = assets.preloadVisibleGenesisVideo(target);
  const observer = assets.observers[0];
  assert.equal(observer.observe.mock.calls[0].arguments[0], target);
  assert.equal(assets.videos.length, 0);
  observer.callback([{ isIntersecting: true }]);
  assert.equal(assets.videos.length, 0);
  await assets.advance();
  assert.equal(assets.videos.length, 1);
  await assets.warmRouteAssets("/works/genesis");
  assert.equal(assets.videos.length, 1);
  assert.equal(assets.videos[0].load.mock.callCount(), 1);
  assert.equal(assets.listeners.size, 0);
  dispose();
});

test("card preloading respects visibility, cancellation, save-data and slow connections", async (t) => {
  const assets = await setup(t, { hidden: true });
  const dispose = assets.preloadVisibleGenesisVideo({});
  assets.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(assets.callbacks.size, 0);
  document.hidden = false;
  assets.listeners.get("visibilitychange")();
  assert.equal(assets.callbacks.size, 1);
  dispose();
  assert.equal(assets.callbacks.size, 0);
  assert.equal(assets.listeners.size, 0);
  assert.equal(assets.videos.length, 0);
  for (const connection of [{ saveData: true }, { effectiveType: "slow-2g" }, { effectiveType: "2g" }, { effectiveType: "3g" }]) {
    navigator.connection = connection;
    assert.equal(assets.preloadVisibleGenesisVideo({}), undefined);
  }
  assert.equal(assets.observers.length, 1);
});
