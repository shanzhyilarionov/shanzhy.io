import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECTED_RADIUS_3D,
  W_PROJECTION_DISTANCE,
  buildEdges4D,
  buildFaces4D,
  buildVertices4D,
  cross3D,
  dot3D,
  faceNormal4D,
  frontness,
  normalize3D,
  project4Dto3D,
  rotate4D,
  rotateAll4D,
  subtract3D,
} from "../components/tesseract/geometry.mjs";

const vertices = buildVertices4D();
const edges = buildEdges4D(vertices);
const faces = buildFaces4D(vertices);

function norm4(point) {
  return Math.hypot(point[0], point[1], point[2], point[3]);
}

function randomRotations(seed) {
  // Deterministic pseudo-random angles, so a failure is reproducible.
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return (state / 2147483648) * Math.PI * 2;
  };

  return [
    [0, 3, next()],
    [1, 2, next()],
    [0, 1, next()],
    [2, 3, next()],
    [0, 2, next()],
    [1, 3, next()],
  ];
}

test("the tesseract has 16 distinct vertices", () => {
  assert.equal(vertices.length, 16);
  assert.equal(new Set(vertices.map((v) => v.join(","))).size, 16);

  for (const vertex of vertices) {
    assert.equal(vertex.length, 4);
    for (const value of vertex) assert.ok(value === 1 || value === -1);
  }
});

test("the tesseract has 32 edges and every vertex has degree 4", () => {
  assert.equal(edges.length, 32);

  const degree = new Array(16).fill(0);
  for (const [first, second] of edges) {
    degree[first]++;
    degree[second]++;
  }

  for (const count of degree) assert.equal(count, 4);
});

test("the tesseract has 24 square faces", () => {
  assert.equal(faces.length, 24);

  const edgeKeys = new Set(
    edges.map(([first, second]) => `${Math.min(first, second)}-${Math.max(first, second)}`),
  );

  for (const face of faces) {
    assert.equal(face.corners.length, 4);
    assert.equal(new Set(face.corners).size, 4);

    for (let index = 0; index < 4; index++) {
      const current = face.corners[index];
      const next = face.corners[(index + 1) % 4];
      const key = `${Math.min(current, next)}-${Math.max(current, next)}`;

      // Consecutive corners are joined by a real edge of the tesseract...
      assert.ok(edgeKeys.has(key), "face side is not a tesseract edge");
    }

    // ...and opposite corners are the diagonal, differing on both axes.
    for (const [first, second] of [
      [0, 2],
      [1, 3],
    ]) {
      let differences = 0;
      for (let axis = 0; axis < 4; axis++) {
        if (vertices[face.corners[first]][axis] !== vertices[face.corners[second]][axis]) {
          differences++;
        }
      }
      assert.equal(differences, 2);
    }
  }
});

test("each of the 32 edges is shared by exactly 3 faces", () => {
  const shared = new Map();

  for (const face of faces) {
    for (let index = 0; index < 4; index++) {
      const current = face.corners[index];
      const next = face.corners[(index + 1) % 4];
      const key = `${Math.min(current, next)}-${Math.max(current, next)}`;
      shared.set(key, (shared.get(key) ?? 0) + 1);
    }
  }

  assert.equal(shared.size, 32);
  for (const count of shared.values()) assert.equal(count, 3);
});

test("exactly two cells carry a tint, six faces each", () => {
  const counts = { "-1": 0, 0: 0, 1: 0 };
  for (const face of faces) counts[face.cellLayer]++;

  assert.equal(counts[0], 6);
  assert.equal(counts[1], 6);
  assert.equal(counts["-1"], 12);
});

test("4D rotation is an isometry", () => {
  for (const vertex of vertices) {
    const rotated = rotateAll4D(vertex, randomRotations(7));
    assert.ok(Math.abs(norm4(rotated) - norm4(vertex)) < 1e-9);
  }

  // A rotation by 2*pi is the identity.
  const point = [0.3, -0.7, 0.5, 0.1];
  const round = rotate4D(point, 1, 3, Math.PI * 2);
  for (let axis = 0; axis < 4; axis++) {
    assert.ok(Math.abs(round[axis] - point[axis]) < 1e-9);
  }
});

test("XW and YZ rotations commute, XW and XY do not", () => {
  const point = [0.3, -0.7, 0.5, 0.1];
  const orthogonal = [
    rotateAll4D(point, [
      [0, 3, 0.6],
      [1, 2, 1.1],
    ]),
    rotateAll4D(point, [
      [1, 2, 1.1],
      [0, 3, 0.6],
    ]),
  ];

  for (let axis = 0; axis < 4; axis++) {
    assert.ok(Math.abs(orthogonal[0][axis] - orthogonal[1][axis]) < 1e-12);
  }

  const sharing = [
    rotateAll4D(point, [
      [0, 3, 0.6],
      [0, 1, 1.1],
    ]),
    rotateAll4D(point, [
      [0, 1, 1.1],
      [0, 3, 0.6],
    ]),
  ];

  const difference = sharing[0].reduce(
    (total, value, axis) => total + Math.abs(value - sharing[1][axis]),
    0,
  );
  assert.ok(difference > 1e-6);
});

test("the projected radius never exceeds the closed-form bound 6/sqrt(5)", () => {
  let observed = 0;

  for (let seed = 1; seed <= 400; seed++) {
    const rotations = randomRotations(seed);

    for (const vertex of vertices) {
      const projected = project4Dto3D(
        rotateAll4D(vertex, rotations),
        W_PROJECTION_DISTANCE,
      );
      observed = Math.max(observed, Math.hypot(...projected));
    }
  }

  assert.ok(observed <= PROJECTED_RADIUS_3D + 1e-9, "bound was exceeded");
  // The bound should be tight, not merely safe.
  assert.ok(observed > PROJECTED_RADIUS_3D * 0.97, "bound is not tight");
});

test("faces stay planar after the 4D to 3D projection", () => {
  const rotations = randomRotations(23);

  for (const face of faces) {
    const points = face.corners.map((index) =>
      project4Dto3D(rotateAll4D(vertices[index], rotations), W_PROJECTION_DISTANCE),
    );
    const normal = normalize3D(
      cross3D(
        subtract3D(points[1], points[0]),
        subtract3D(points[3], points[0]),
      ),
    );
    const offPlane = Math.abs(dot3D(normal, subtract3D(points[2], points[0])));

    assert.ok(offPlane < 1e-9, `face is not planar: ${offPlane}`);
  }
});

test("frontness maps the depth range onto [0, 1]", () => {
  assert.equal(frontness(-PROJECTED_RADIUS_3D), 0);
  assert.equal(frontness(PROJECTED_RADIUS_3D), 1);
  assert.ok(Math.abs(frontness(0) - 0.5) < 1e-12);
  assert.equal(frontness(-1000), 0);
  assert.equal(frontness(1000), 1);
});

test("the 4D face normal is a unit vector orthogonal to the face", () => {
  for (const face of faces) {
    const normal = faceNormal4D(face);
    assert.ok(Math.abs(norm4(normal) - 1) < 1e-12);

    // The face spans firstAxis and secondAxis; the normal must not.
    assert.equal(normal[face.firstAxis], 0);
    assert.equal(normal[face.secondAxis], 0);
  }
});
