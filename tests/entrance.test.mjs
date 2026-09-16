import assert from "node:assert/strict";
import test from "node:test";
import { buildEdges4D, buildFaces4D, buildVertices4D } from "../components/tesseract/geometry.mjs";
import { createHomeScene, ENTRANCE_DURATION, entranceState } from "../components/tesseract/entrance.js";
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

test("the fixed-size point fades in for .4s followed by three .7s expansions", () => {
  const point = frame(0.4);
  assert.equal(point.faces.length, 0);
  assert.equal(point.edges.length, 1);
  assert.equal((point.edges[0].x1 + point.edges[0].x2) / 2, point.centerX);
  assert.equal(point.edges[0].y1, point.centerY);

  const seed = frame(0);
  assert.equal(seed.opacity, 0);
  assert.equal(point.opacity ?? 1, 1);
  let previousOpacity = -1;
  for (const time of [0, 0.1, 0.2, 0.3, 0.4]) {
    const fading = frame(time);
    assert.equal(fading.faces.length, 0);
    assert.deepEqual(fading.edges, point.edges);
    assert.ok((fading.opacity ?? 1) > previousOpacity);
    previousOpacity = fading.opacity ?? 1;
  }

  for (const [time, faceCount, edgeCount] of [[1.1, 1, 4], [1.8, 6, 12], [2.5, 24, 32]]) {
    const scene = frame(time);
    assert.equal(scene.faces.length, faceCount);
    assert.equal(scene.edges.length, edgeCount);
    scene.faces.forEach((face) => assert.equal(face.visibility ?? 1, 1));
    scene.edges.forEach((edge) => assert.equal(edge.visibility ?? 1, 1));
  }

  const square = frame(1.1).faces[0].points3D;
  assert.ok(square.some((point) => Math.abs(point[2]) > 0.1));
  const lengths = square.map((point, index) => Math.hypot(
    ...point.map((value, axis) => value - square[(index + 1) % 4][axis]),
  ));
  lengths.forEach((length) => assert.ok(Math.abs(length - 2) < 1e-12));
});

test("motion begins at 2.5 seconds without a hold after expansion", () => {
  assert.equal(entranceState(2.499).complete, false);
  assert.equal(entranceState(2.5).complete, true);
  assert.equal(entranceState(2.5).motionTime, 0);
  assert.notDeepEqual(frame(2.5), frame(2.55));
  assert.deepEqual(frame(2.499, 1440, { x: 1, y: -1 }), frame(2.499));
});

test("every expansion stage uses the tesseract's initial viewing angle", () => {
  for (const [time, dimensions] of [
    [0.75, [0.5, 0.5, 0, 0]],
    [1.1, [1, 1, 0, 0]],
    [1.45, [1, 1, 0.5, 0]],
    [1.8, [1, 1, 1, 0]],
    [2.15, [1, 1, 1, 0.5]],
  ]) {
    const reference = createScene(
      vertices.map((vertex) => vertex.map((value, axis) => value * dimensions[axis])),
      edges, faces, { width: 1440, height: 900 }, neutral,
      0, 1 / 60, { pointer: { ...neutral } },
    );
    assertClose(frame(time).faces[0].points3D, reference.faces[0].points3D);
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
          time, 1 / 60, referenceState,
        );
        assert.deepEqual(actual, expected);
        assert.deepEqual(state, referenceState);
      }
    }
  }
});

test("the last entrance pose matches the first motion frame without a jump", () => {
  const before = frame(ENTRANCE_DURATION - 1e-6);
  for (const face of before.faces) delete face.visibility;
  for (const edge of before.edges) delete edge.visibility;
  assertClose(before, frame(ENTRANCE_DURATION), 1e-7);
});

test("intermediate geometry is finite and visible faces never have zero area", () => {
  const finite = (value) => {
    if (typeof value === "number") assert.ok(Number.isFinite(value));
    else if (value && typeof value === "object") Object.values(value).forEach(finite);
  };
  for (const width of [390, 1440]) {
    for (let step = 0; step <= 300; step++) {
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
