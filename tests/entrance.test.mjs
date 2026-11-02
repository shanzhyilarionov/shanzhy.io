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

test("the tesseract scales and fades in over 0.8 seconds with a slow start, faster middle and slow finish", () => {
  assert.equal(ENTRANCE_DURATION, 0.8);
  assert.equal(CHROME_REVEAL_TIME, 0.5);
  assert.equal(entranceState(0).scale, 0.2);
  assert.equal(entranceState(0).opacity, 0);
  assert.equal(entranceState(0.8).scale, 1);
  assert.equal(entranceState(0.8).opacity, 1);
  assert.equal(entranceState(0.799).complete, false);
  assert.equal(entranceState(0.8).complete, true);

  let previous = entranceState(0);
  const scaleSteps = [];
  for (let step = 1; step <= 100; step++) {
    const entry = entranceState(step / 100 * ENTRANCE_DURATION);
    const scaleStep = entry.scale - previous.scale;
    assert.ok(scaleStep > 0);
    assert.ok(entry.opacity > previous.opacity);
    scaleSteps.push(scaleStep);
    previous = entry;
  }
  for (let index = 1; index < 45; index++) {
    assert.ok(scaleSteps[index] > scaleSteps[index - 1]);
  }
  for (let index = 46; index < 55; index++) {
    assertClose(scaleSteps[index], scaleSteps[index - 1]);
  }
  for (let index = 56; index < scaleSteps.length; index++) {
    assert.ok(scaleSteps[index] < scaleSteps[index - 1]);
  }

  const epsilon = 1e-6;
  for (const boundary of [0.45, 0.55].map((ratio) => ratio * ENTRANCE_DURATION)) {
    const before = entranceState(boundary - epsilon).scale;
    const at = entranceState(boundary).scale;
    const after = entranceState(boundary + epsilon).scale;
    assert.ok(Math.abs(after - before) < 1e-5);
    assertClose((at - before) / epsilon, (after - at) / epsilon, 1e-5);
  }

  const quarter = entranceState(ENTRANCE_DURATION / 4).scale;
  const midpoint = entranceState(ENTRANCE_DURATION / 2).scale;
  const threeQuarters = entranceState(ENTRANCE_DURATION * 3 / 4).scale;
  assertClose(midpoint, 0.6);
  assertClose(quarter - 0.2, 1 - threeQuarters);
  assert.ok(quarter - 0.2 < midpoint - quarter);
});

test("scaling preserves the complete tesseract geometry, center and rotation", () => {
  for (const width of [390, 1440]) {
    for (const time of [0, 0.01, 0.15, 0.3, 0.5, 0.799]) {
      const reference = createScene(
        vertices, edges, faces, { width, height: 900 }, neutral,
        time, 1 / 60, { pointer: { ...neutral } },
      );
      const actual = frame(time, width);
      assert.equal(actual.centerX, width / 2);
      assert.equal(actual.centerY, 450);
      assert.equal(actual.faces.length, 24);
      assert.equal(actual.edges.length, 32);
      assert.deepEqual(actual.faces, reference.faces);
      assert.deepEqual(actual.edges, reference.edges);
      assert.equal(actual.entranceScale, entranceState(time).scale);
      assert.equal(actual.opacity, entranceState(time).opacity);
    }
    assert.notDeepEqual(frame(0, width).faces, frame(0.01, width).faces);
  }
});

test("pointer input waits for the entrance to finish without delaying rotation", () => {
  for (const time of [0, 0.1, 0.5, 0.799]) {
    assert.equal(entranceState(time).motionTime, time);
    assert.deepEqual(frame(time, 1440, { x: 1, y: -1 }), frame(time));
  }
  assert.notDeepEqual(frame(0.8, 1440, { x: 1, y: -1 }), frame(0.8));
});

test("completed entrance preserves the scene's rotation time and pointer response", () => {
  for (const width of [390, 1440]) {
    for (const time of [0.8, 1.05, 2, 8]) {
      for (const pointer of [neutral, { x: 1, y: -1 }]) {
        const state = { pointer: { ...neutral } };
        const referenceState = { pointer: { ...neutral } };
        const actual = frame(time, width, pointer, state);
        const expected = createScene(
          vertices, edges, faces, { width, height: 900 }, pointer,
          time, 1 / 60, referenceState,
        );
        assert.deepEqual(actual, expected);
        assert.deepEqual(state, referenceState);
      }
    }
  }
});

test("scale, opacity and rotation remain continuous at the end of the entrance", () => {
  const { entranceScale, opacity, ...before } = frame(ENTRANCE_DURATION - 1e-8);
  assert.ok(Math.abs(entranceScale - 1) < 1e-7);
  assert.ok(Math.abs(opacity - 1) < 1e-7);
  assertClose(before, frame(ENTRANCE_DURATION), 1e-7);
});

test("intermediate geometry is finite and visible faces never have zero area", () => {
  const finite = (value) => {
    if (typeof value === "number") assert.ok(Number.isFinite(value));
    else if (value && typeof value === "object") Object.values(value).forEach(finite);
  };
  for (const width of [390, 1440]) {
    for (let step = 0; step <= 120; step++) {
      const scene = frame(step / 120 * ENTRANCE_DURATION, width);
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
