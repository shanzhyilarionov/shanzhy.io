import assert from "node:assert/strict";
import test from "node:test";
import { createFallbackRenderer } from "../components/tesseract/fallback-renderer.js";
import { createHomeScene } from "../components/tesseract/entrance.js";
import { buildVertices4D, buildEdges4D, buildFaces4D } from "../components/tesseract/geometry.mjs";

test("the CPU renderer draws every entrance stage and resizes without invalid coordinates or colors", () => {
  let strokes = 0;
  let fills = 0;
  const context = {
    clearRect() {}, beginPath() {}, closePath() {},
    moveTo(...values) { assert.ok(values.every(Number.isFinite)); },
    lineTo(...values) { assert.ok(values.every(Number.isFinite)); },
    set fillStyle(value) { assert.ok(!/NaN|undefined/.test(value)); },
    set strokeStyle(value) { assert.ok(!/NaN|undefined/.test(value)); },
    set lineWidth(value) { assert.ok(Number.isFinite(value) && value > 0); },
    stroke() { strokes++; }, fill() { fills++; },
  };
  const canvas = { getContext(type) { assert.equal(type, "2d"); return context; } };
  const renderer = createFallbackRenderer(canvas);
  const vertices = buildVertices4D();
  const edges = buildEdges4D(vertices);
  const faces = buildFaces4D(vertices);
  for (const width of [390, 1440]) {
    for (const time of [0, 0.2, 0.55, 0.9, 1.6, 2.3, 3, 10]) {
      const scene = createHomeScene(vertices, edges, faces, { width, height: 900 },
        { x: 1, y: -1 }, time, 1 / 30, { pointer: { x: 0, y: 0 } });
      renderer.render(scene);
      assert.equal(canvas.width, width);
      assert.equal(canvas.height, 900);
    }
  }
  assert.ok(strokes > 0 && fills > 0);
  renderer.destroy();
});

test("an unavailable Canvas 2D context fails gracefully", () => {
  assert.equal(createFallbackRenderer({ getContext: () => null }), null);
});
