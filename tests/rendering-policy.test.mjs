import assert from "node:assert/strict";
import test from "node:test";
import { createHardwareContext, createPerformanceMonitor } from "../components/tesseract/rendering-policy.js";

function graphics(name, { privateRenderer = false } = {}) {
  const lost = [];
  const requests = [];
  const gl = {
    getExtension(extension) {
      if (extension === "WEBGL_debug_renderer_info") return privateRenderer ? null : { UNMASKED_RENDERER_WEBGL: 1 };
      if (extension === "WEBGL_lose_context") return { loseContext: () => lost.push(true) };
    },
    getParameter: () => name,
  };
  const canvas = { getContext(type, options) { requests.push({ type, options }); return gl; } };
  return { canvas, gl, lost, requests };
}

test("WebGL requests reject major performance caveats and retain rendering options", () => {
  const { canvas, gl, requests } = graphics("ANGLE (Intel UHD Graphics)");
  assert.equal(createHardwareContext(canvas, { alpha: true, failIfMajorPerformanceCaveat: false }), gl);
  assert.equal(requests[0].options.failIfMajorPerformanceCaveat, true);
  assert.equal(requests[0].options.alpha, true);
});

test("both WebGL context names fail safely without retrying software rendering", () => {
  const requests = [];
  assert.equal(createHardwareContext({ getContext(type, options) { requests.push({ type, options }); return null; } }), null);
  assert.deepEqual(requests.map(({ type }) => type), ["webgl", "experimental-webgl"]);
  assert.ok(requests.every(({ options }) => options.failIfMajorPerformanceCaveat));
  assert.equal(createHardwareContext({ getContext() { throw new Error("blocked"); } }), null);
});

test("known CPU renderers are rejected before allocating shader resources", () => {
  for (const name of [
    "ANGLE (Google, Vulkan (SwiftShader Device (Subzero)))",
    "llvmpipe (LLVM 15.0.7, 256 bits)", "softpipe", "Software Rasterizer",
    "Microsoft Basic Render Driver",
  ]) {
    const { canvas, lost } = graphics(name);
    assert.equal(createHardwareContext(canvas), null, name);
    assert.equal(lost.length, 1);
  }
});

test("privacy settings hiding renderer details still allow hardware rendering", () => {
  const { canvas, gl } = graphics("", { privateRenderer: true });
  assert.equal(createHardwareContext(canvas), gl);
});

function advance(monitor, start, duration, fps) {
  let downgraded = false;
  for (let time = start; time <= start + duration; time += 1000 / fps) {
    downgraded ||= monitor.sample(time);
  }
  return downgraded;
}

test("sustained low frame rates trigger fallback, while usable hardware stays on WebGL", () => {
  for (const fps of [2, 10, 15]) assert.equal(advance(createPerformanceMonitor(), 0, 8000, fps), true);
  for (const fps of [24, 30, 60, 120]) assert.equal(advance(createPerformanceMonitor(), 0, 8000, fps), false);
});

test("a brief stall and one slow window do not downgrade a healthy renderer", () => {
  const monitor = createPerformanceMonitor();
  assert.equal(advance(monitor, 0, 3000, 60), false);
  assert.equal(monitor.sample(4500), false);
  assert.equal(advance(monitor, 4517, 6000, 60), false);
});

test("pausing clears timing so background-tab time cannot trigger a downgrade", () => {
  const monitor = createPerformanceMonitor();
  assert.equal(advance(monitor, 0, 3200, 10), false);
  monitor.reset();
  assert.equal(advance(monitor, 60000, 3200, 10), false);
});
