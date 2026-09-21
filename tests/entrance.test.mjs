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

test("the fixed-size point fades in for .2s followed by four .7s expansions", () => {
  const point = frame(0.2);
  assert.equal(point.faces.length, 0);
  assert.equal(point.edges.length, 1);
  assert.equal((point.edges[0].x1 + point.edges[0].x2) / 2, point.centerX);
  assert.equal(point.edges[0].y1, point.centerY);

  const seed = frame(0);
  assert.equal(seed.opacity, 0);
  assert.equal(point.opacity ?? 1, 1);
  let previousOpacity = -1;
  for (const time of [0, 0.05, 0.1, 0.15, 0.2]) {
    const fading = frame(time);
    assert.equal(fading.faces.length, 0);
    assert.deepEqual(fading.edges, point.edges);
    assert.ok((fading.opacity ?? 1) > previousOpacity);
    previousOpacity = fading.opacity ?? 1;
  }

  for (const [time, faceCount, edgeCount] of [[0.9, 0, 1], [1.6, 1, 4], [2.3, 6, 12], [3, 24, 32]]) {
    const scene = frame(time);
    assert.equal(scene.faces.length, faceCount);
    assert.equal(scene.edges.length, edgeCount);
    scene.faces.forEach((face) => assert.equal(face.visibility ?? 1, 1));
    scene.edges.forEach((edge) => assert.equal(edge.visibility ?? 1, 1));
  }

  const square = frame(1.6).faces[0].points3D;
  assert.ok(square.some((point) => Math.abs(point[2]) > 0.1));
  const lengths = square.map((point, index) => Math.hypot(
    ...point.map((value, axis) => value - square[(index + 1) % 4][axis]),
  ));
  lengths.forEach((length) => assert.ok(Math.abs(length - 2) < 1e-12));
});

test("motion and chrome begin at 3 seconds without a hold after expansion", () => {
  assert.equal(ENTRANCE_DURATION, 3);
  assert.equal(CHROME_REVEAL_TIME, 3);
  assert.equal(entranceState(2.999).complete, false);
  assert.equal(entranceState(3).complete, true);
  assert.equal(entranceState(3).motionTime, 0);
  assert.notDeepEqual(frame(3), frame(3.05));
  assert.notDeepEqual(frame(3, 1440, { x: 1, y: -1 }), frame(3));
  for (const time of [0.1, 0.55, 1.25, 1.95, 2.65, 2.999]) {
    assert.deepEqual(frame(time, 1440, { x: 1, y: -1 }), frame(time));
  }
});

test("the line grows around the point and the square grows around the line", () => {
  const endpoints = (scene) => {
    const edge = scene.edges.find((edge) => edge.bloom !== false);
    return [1, 2].map((end) => {
      const depth = edge[`z${end}`];
      const scale = scene.scale * scene.zDistance / (scene.zDistance - depth);
      return [
        (edge[`x${end}`] - scene.centerX) / scale,
        (edge[`y${end}`] - scene.centerY) / scale,
        depth,
      ];
    });
  };
  const midpoint = (first, second) => first.map((value, axis) =>
    (value + second[axis]) / 2,
  );

  for (const width of [390, 1440]) {
    for (const time of [0.3, 0.55, 0.9]) {
      const line = frame(time, width);
      assert.equal(line.faces.length, 0);
      assertClose(midpoint(...endpoints(line)), [0, 0, 0]);
    }

    const line = endpoints(frame(0.9, width));
    for (const time of [0.95, 1.25, 1.6]) {
      const square = frame(time, width).faces[0].points3D;
      assertClose(midpoint(square[0], square[3]), line[0]);
      assertClose(midpoint(square[1], square[2]), line[1]);
    }
  }
});

test("every expansion stage uses the tesseract's initial viewing angle", () => {
  for (const [time, dimensions] of [
    [0.55, [0.5, 0, 0, 0]],
    [0.9, [1, 0, 0, 0]],
    [1.25, [1, 0.5, 0, 0]],
    [1.6, [1, 1, 0, 0]],
    [1.95, [1, 1, 0.5, 0]],
    [2.3, [1, 1, 1, 0]],
    [2.65, [1, 1, 1, 0.5]],
  ]) {
    const reference = createScene(
      vertices.map((vertex) => vertex.map((value, axis) => value * dimensions[axis])),
      edges, faces, { width: 1440, height: 900 }, neutral,
      0, 1 / 60, { pointer: { ...neutral } },
    );
    const actual = frame(time);
    for (const edge of actual.edges) {
      assert.ok(reference.edges.some((candidate) =>
        ["x1", "y1", "x2", "y2", "z1", "z2"].every((key) =>
          Math.abs(edge[key] - candidate[key]) < 1e-9,
        ),
      ));
    }
    if (actual.faces.length) {
      assertClose(actual.faces[0].points3D, reference.faces[0].points3D);
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
    for (let step = 0; step <= 360; step++) {
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
