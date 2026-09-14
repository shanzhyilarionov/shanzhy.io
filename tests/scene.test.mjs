import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEdges4D,
  buildFaces4D,
  buildVertices4D,
} from "../components/tesseract/geometry.mjs";
import { createScene } from "../components/tesseract/scene.js";

const vertices = buildVertices4D();
const edges = buildEdges4D(vertices);
const faces = buildFaces4D(vertices);

function frame(time, pointer, width = 1440, state = { pointer: { ...pointer } }, deltaTime = 1 / 60) {
  return createScene(
    vertices,
    edges,
    faces,
    { width, height: 900 },
    pointer,
    time,
    deltaTime,
    state,
  );
}

function points(scene) {
  const result = [];
  faces.forEach((face, faceIndex) => {
    face.corners.forEach((vertexIndex, cornerIndex) => {
      result[vertexIndex] = scene.faces[faceIndex].points3D[cornerIndex];
    });
  });
  return result;
}

function distances(scene) {
  const positions = points(scene);
  return positions.flatMap((first, index) =>
    positions.slice(index + 1).map((second) =>
      Math.hypot(...first.map((value, axis) => value - second[axis])),
    ),
  );
}

test("pointer movement changes the view without deforming the animated object", () => {
  for (const width of [390, 1440]) {
    for (const time of [0, 1, 10]) {
      const neutral = frame(time, { x: 0, y: 0 }, width);
      const reference = distances(neutral);

      for (const pointer of [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: -1 },
        { x: 1, y: 1 },
      ]) {
        const tilted = frame(time, pointer, width);
        assert.notDeepEqual(points(tilted), points(neutral));
        distances(tilted).forEach((distance, index) => {
          assert.ok(Math.abs(distance - reference[index]) < 1e-9);
        });
        tilted.faces.forEach((face, index) => {
          assert.equal(face.scatterGain, neutral.faces[index].scatterGain);
        });
      }
    }
  }
});

test("automatic 4D motion continues with the pointer held still", () => {
  for (const pointer of [{ x: 0, y: 0 }, { x: 1, y: -1 }]) {
    const initial = distances(frame(0, pointer));
    const later = distances(frame(1, pointer));
    assert.ok(later.some((distance, index) => Math.abs(distance - initial[index]) > 1e-3));
  }
});

test("pointer following is gradual and consistent across frame rates", () => {
  const pointer = { x: 1, y: -1 };
  const follow = (fps) => {
    const state = { pointer: { x: 0, y: 0 } };
    for (let index = 0; index < fps / 2; index++) {
      frame(0, pointer, 1440, state, 1 / fps);
      assert.ok(state.pointer.x > 0 && state.pointer.x < 1);
      assert.ok(state.pointer.y < 0 && state.pointer.y > -1);
    }
    return state.pointer;
  };

  const slow = follow(30);
  const fast = follow(120);
  assert.ok(Math.abs(slow.x - fast.x) < 1e-12);
  assert.ok(Math.abs(slow.y - fast.y) < 1e-12);
});
