import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEdges4D,
  buildFaces4D,
  buildVertices4D,
} from "../components/tesseract/geometry.mjs";
import {
  createHomeScene,
  COLOR_REVEAL_TIME,
  COLOR_REVEAL_DURATION,
  CHROME_REVEAL_TIME,
  ENTRANCE_DURATION,
  RETURN_ENTRANCE_DURATION,
  WIREFRAME_WIDTH,
  UNFOLD_DURATION,
  LOADING_HOLD_DURATION,
  entranceState,
  returnEntranceState,
} from "../components/tesseract/entrance.js";
import { createScene, projectSceneVertices } from "../components/tesseract/scene.js";

const vertices = buildVertices4D();
const edges = buildEdges4D(vertices);
const faces = buildFaces4D(vertices);
const neutral = { x: 0, y: 0 };

function frame(time, width = 1440, pointer = neutral, state = { pointer: { ...neutral } }, returning = false) {
  return createHomeScene(
    vertices, edges, faces, { width, height: 900 }, pointer, time, 1 / 60, state, returning,
  );
}

function assertClose(actual, expected, tolerance = 1e-9) {
  if (typeof expected === "number") {
    assert.ok(Math.abs(actual - expected) < tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
  } else {
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    Object.keys(expected).forEach((key) => assertClose(actual[key], expected[key], tolerance));
  }
}

const coordinates = (lines) => lines.map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2])
  .sort((first, second) => first[0] - second[0] || first[1] - second[1] || first[2] - second[2]);

test("the loader hands off a visible dot, unfolding finishes at 2 seconds and the page fades until 2.5", () => {
  assert.equal(LOADING_HOLD_DURATION, 0.2);
  assert.equal(ENTRANCE_DURATION + LOADING_HOLD_DURATION, 3);
  assert.equal(COLOR_REVEAL_TIME, 2);
  assert.equal(COLOR_REVEAL_DURATION, 0.5);
  assert.equal(CHROME_REVEAL_TIME + LOADING_HOLD_DURATION, 2.5);
  assert.equal(COLOR_REVEAL_TIME + LOADING_HOLD_DURATION, 2.2);
  assert.equal(UNFOLD_DURATION, 2);
  const stages = [
    [0, [0, 0, 0, 0], 0],
    [0.5, [1, 0, 0, 0], 1],
    [1, [1, 1, 0, 0], 4],
    [1.5, [1, 1, 1, 0], 12],
    [2, [1, 1, 1, 1], 32],
  ];
  for (const width of [390, 1440]) {
    for (const [time, dimensions, edgeCount] of stages) {
      const entry = entranceState(time);
      const scene = frame(time, width);
      assertClose(entry.dimensions, dimensions);
      assert.equal(scene.wireframe.edges.length, edgeCount);
      assert.equal(scene.opacity, entry.colorProgress);
      assert.equal(scene.chromeOpacity, 0);
      assert.equal(scene.backgroundOpacity, 1);
      assert.equal(entry.motionTime, 0);
      assert.equal(entry.complete, false);
    }
  }
  for (const time of [0, 0.1, 0.2, 0.4, 0.6]) {
    assert.equal(entranceState(time).dotRadius * 2, WIREFRAME_WIDTH);
  }
  assert.equal(entranceState(0).dotOpacity, 1);
  assert.equal(entranceState(0.25).dotOpacity, 0.5);
  assert.equal(entranceState(0.5).dotOpacity, 0);
  assert.ok(entranceState(0.01).dimensions[0] > 0);
  assertClose(entranceState(2.125).colorProgress, 0.25);
  assertClose(entranceState(2.25).colorProgress, 0.5);
  assertClose(entranceState(2.375).colorProgress, 0.75);
  assert.equal(entranceState(2).colorProgress, 0);
  assert.equal(entranceState(2.5).colorProgress, 1);
  assert.equal(entranceState(2.3).chromeProgress, 0);
  assertClose(entranceState(2.55).chromeProgress, 0.5);
  assert.equal(entranceState(2.8).chromeProgress, 1);
  assert.equal(entranceState(2.8).colorProgress, 1);
  assert.equal(entranceState(2.8).complete, true);
});

test("each stage expands only its next axis in the fixed starting view", () => {
  for (const time of [0.25, 0.75, 1.25, 1.75]) {
    const axis = Math.floor(time / 0.5);
    const expectedDimensions = [0, 1, 2, 3].map((index) => index < axis ? 1 : index === axis ? 0.5 : 0);
    assertClose(entranceState(time).dimensions, expectedDimensions);
    const viewport = { width: 1440, height: 900 };
    const points = projectSceneVertices(
      vertices.map((vertex) => vertex.map((value, index) => value * expectedDimensions[index])),
      viewport, neutral, 0,
    );
    const expected = edges.map(([first, second]) => ({
      x1: points[first].x, y1: points[first].y,
      x2: points[second].x, y2: points[second].y,
    }));
    for (const line of frame(time).wireframe.edges) {
      assert.ok(expected.some((other) =>
        Object.keys(line).every((key) => Math.abs(line[key] - other[key]) < 1e-8),
      ));
    }
  }
});

test("the black wireframe crossfades into the aligned colored model and background", () => {
  for (const width of [390, 1440]) {
    const initial = createScene(
      vertices, edges, faces, { width, height: 900 }, neutral,
      0, 1 / 60, { pointer: { ...neutral } },
    );
    const before = frame(2 - 1e-8, width);
    assertClose(coordinates(before.wireframe.edges), coordinates(initial.edges), 1e-7);
    for (const time of [2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.79]) {
      const scene = frame(time, width);
      assertClose(coordinates(scene.wireframe.edges), coordinates(scene.edges));
      const entry = entranceState(time);
      assert.equal(scene.opacity, entry.colorProgress);
      assert.equal(scene.wireframe.opacity, scene.backgroundOpacity);
      assert.equal(scene.backgroundOpacity, 1 - entry.colorProgress);
      assert.equal(scene.chromeOpacity, entry.chromeProgress);
    }
    assert.notDeepEqual(frame(2, width).edges, frame(2.2, width).edges);
  }
});

test("the page reveals its original colors through opacity alone between 2 and 2.5 seconds", () => {
  for (const width of [390, 1440]) {
    for (const time of [2, 2.125, 2.25, 2.375, 2.5, 2.7]) {
      const scene = frame(time, width);
      const progress = Math.max(0, Math.min(1, (time - 2) / 0.5));
      assertClose(scene.opacity, progress);
      assertClose(scene.backgroundOpacity, 1 - progress);
      assertClose(scene.wireframe.opacity, 1 - progress);
      const reference = createScene(
        vertices, edges, faces, { width, height: 900 }, neutral,
        entranceState(time).motionTime, 1 / 60, { pointer: { ...neutral } },
      );
      assert.deepEqual(scene.faces, reference.faces);
      assert.deepEqual(scene.edges, reference.edges);
    }
  }
});

test("pointer interaction waits for the unchanged overall entrance and rotation accelerates during the reveal", () => {
  for (const time of [0, 0.2, 0.7, 1.2, 1.7, 2.2, 2.6, ENTRANCE_DURATION - 0.001]) {
    assert.deepEqual(frame(time, 1440, { x: 1, y: -1 }), frame(time));
  }
  assert.notDeepEqual(frame(ENTRANCE_DURATION, 1440, { x: 1, y: -1 }), frame(ENTRANCE_DURATION));
  assert.equal(entranceState(2).motionTime, 0);
  assertClose(entranceState(2.4).motionTime, 0.1);
  assertClose(entranceState(2.8).motionTime, 0.4);
  assertClose(entranceState(3).motionTime, 0.6);
  assertClose(entranceState(4).motionTime, 1.6);
});

test("the completed entrance continues the existing scene with no visual jump", () => {
  for (const width of [390, 1440]) {
    for (const time of [ENTRANCE_DURATION, 3.5, 8]) {
      for (const pointer of [neutral, { x: 1, y: -1 }]) {
        const state = { pointer: { ...neutral } };
        const referenceState = { pointer: { ...neutral } };
        const actual = frame(time, width, pointer, state);
        const expected = createScene(
          vertices, edges, faces, { width, height: 900 }, pointer,
          entranceState(time).motionTime, 1 / 60, referenceState,
        );
        assert.deepEqual(actual, expected);
        assert.deepEqual(state, referenceState);
      }
    }
    const { opacity, backgroundOpacity, chromeOpacity, wireframe, ...before } = frame(ENTRANCE_DURATION - 1e-8, width);
    assertClose(opacity, 1, 1e-7);
    assertClose(backgroundOpacity, 0, 1e-6);
    assertClose(wireframe.opacity, 0, 1e-6);
    assertClose(chromeOpacity, 1, 1e-7);
    assertClose(before, frame(ENTRANCE_DURATION, width), 1e-6);
  }
});

test("returning home retains the original short scaling entrance", () => {
  assert.equal(RETURN_ENTRANCE_DURATION, 0.8);
  assert.equal(returnEntranceState(0).scale, 0.2);
  assert.equal(returnEntranceState(0).opacity, 0);
  assert.equal(returnEntranceState(0.8).scale, 1);
  assert.equal(returnEntranceState(0.8).opacity, 1);
  for (const time of [0, 0.2, 0.5, 0.799, 0.8, 3]) {
    const entry = returnEntranceState(time);
    const actual = frame(time, 1440, neutral, { pointer: { ...neutral } }, true);
    const expected = createScene(
      vertices, edges, faces, { width: 1440, height: 900 }, neutral,
      time, 1 / 60, { pointer: { ...neutral } },
    );
    if (!entry.complete) {
      expected.entranceScale = entry.scale;
      expected.opacity = entry.opacity;
    }
    assert.deepEqual(actual, expected);
    assert.equal(actual.wireframe, undefined);
    assert.equal(actual.backgroundOpacity, undefined);
  }
});

test("all entrance coordinates stay finite and colored faces remain nondegenerate", () => {
  const finite = (value) => {
    if (typeof value === "number") assert.ok(Number.isFinite(value));
    else if (value && typeof value === "object") Object.values(value).forEach(finite);
  };
  for (const width of [390, 1440]) {
    for (let step = 0; step <= 120; step++) {
      const scene = frame(step / 120 * ENTRANCE_DURATION, width);
      finite(scene);
      scene.faces.forEach(({ tangent: a, bitangent: b }) => {
        assert.ok(Math.hypot(
          a[1] * b[2] - a[2] * b[1],
          a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0],
        ) > 0);
      });
    }
  }
});
