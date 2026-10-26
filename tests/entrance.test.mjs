import assert from "node:assert/strict";
import test from "node:test";
import { buildEdges4D, buildFaces4D, buildVertices4D } from "../components/tesseract/geometry.mjs";
import {
  createHomeScene,
  CHROME_REVEAL_TIME,
  ENTRANCE_DURATION,
  entranceState,
} from "../components/tesseract/entrance.js";
import { createScene } from "../components/tesseract/scene.js";

const vertices = buildVertices4D();
const edges = buildEdges4D(vertices);
const faces = buildFaces4D(vertices);
const neutral = { x: 0, y: 0 };

function frame(time, width = 1440, pointer = neutral, state = { pointer: { ...neutral } }) {
  return createHomeScene(
    vertices, edges, faces, { width, height: 900 }, pointer, time, 1 / 60, state,
  );
}

function assertClose(actual, expected, tolerance = 1e-9) {
  if (typeof expected === "number") {
    assert.ok(Math.abs(actual - expected) < tolerance * Math.max(1, Math.abs(expected)));
  } else {
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    Object.keys(expected).forEach((key) => assertClose(actual[key], expected[key], tolerance));
  }
}

test("the point expands directly into all tesseract edges and faces over .7 seconds", () => {
  const seed = frame(0);
  assert.equal(seed.faces.length, 0);
  assert.equal(seed.edges.length, 1);
  assert.equal((seed.edges[0].x1 + seed.edges[0].x2) / 2, seed.centerX);
  assert.equal(seed.edges[0].y1, seed.centerY);
  assert.equal(seed.opacity ?? 1, 1);
  assert.equal(entranceState(0).scale, 0);
  assert.equal(entranceState(0.35).scale, 0.5);
  assert.equal(entranceState(0.7).scale, 1);

  for (const width of [390, 1440]) {
    let previousRadius = 0;
    for (let step = 1; step <= 84; step++) {
      const scene = frame(step / 120, width);
      assert.equal(scene.faces.length, 24);
      assert.equal(scene.edges.filter((edge) => edge.bloom !== false).length, 32);
      const radius = Math.max(...scene.faces.flatMap((face) =>
        face.points3D.map((point) => Math.hypot(...point)),
      ));
      assert.ok(radius > previousRadius);
      previousRadius = radius;
    }
  }
});

test("chrome starts at .5 seconds and motion starts at .7 seconds without a hold", () => {
  assert.equal(ENTRANCE_DURATION, 0.7);
  assert.equal(CHROME_REVEAL_TIME, 0.5);
  assert.equal(entranceState(0.699).complete, false);
  assert.equal(entranceState(0.7).complete, true);
  assert.equal(entranceState(0.7).motionTime, 0);
  assert.notDeepEqual(frame(0.7), frame(0.75));
  assert.notDeepEqual(frame(0.7, 1440, { x: 1, y: -1 }), frame(0.7));
  for (const time of [0, 0.1, 0.35, 0.5, 0.699]) {
    assert.deepEqual(frame(time, 1440, { x: 1, y: -1 }), frame(time));
  }
});

test("all four dimensions expand together at the tesseract's initial viewing angle", () => {
  for (const width of [390, 1440]) {
    for (const time of [0.01, 0.1, 0.35, 0.5, 0.699]) {
      const { scale } = entranceState(time);
      const reference = createScene(
        vertices.map((vertex) => vertex.map((value) => value * scale)),
        edges, faces, { width, height: 900 }, neutral,
        0, 1 / 60, { pointer: { ...neutral } },
      );
      const actual = frame(time, width);
      assertClose(actual.faces, reference.faces);
      assertClose(actual.edges.filter((edge) => edge.bloom !== false), reference.edges);
    }
  }
});

test("completed entrance returns the original scene and pointer response exactly", () => {
  for (const width of [390, 1440]) {
    for (const time of [0, 0.25, 1, 8]) {
      for (const pointer of [neutral, { x: 1, y: -1 }]) {
        const state = { pointer: { ...neutral } };
        const referenceState = { pointer: { ...neutral } };
        const actual = frame(ENTRANCE_DURATION + time, width, pointer, state);
        const expected = createScene(
          vertices, edges, faces, { width, height: 900 }, pointer,
          ENTRANCE_DURATION + time - ENTRANCE_DURATION, 1 / 60, referenceState,
        );
        assert.deepEqual(actual, expected);
        assert.deepEqual(state, referenceState);
      }
    }
  }
});

test("the last entrance pose matches the first motion frame without a jump", () => {
  const before = frame(ENTRANCE_DURATION - 1e-6);
  assertClose(before, frame(ENTRANCE_DURATION), 1e-7);
});

test("intermediate geometry is finite and visible faces never have zero area", () => {
  const finite = (value) => {
    if (typeof value === "number") assert.ok(Number.isFinite(value));
    else if (value && typeof value === "object") Object.values(value).forEach(finite);
  };
  for (const width of [390, 1440]) {
    for (let step = 0; step <= 120; step++) {
      const scene = frame(step / 120, width);
      finite(scene);
      scene.faces.forEach(({ tangent: a, bitangent: b }) => {
        const area = Math.hypot(
          a[1] * b[2] - a[2] * b[1],
          a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0],
        );
        assert.ok(area > 0);
      });
    }
  }
});
