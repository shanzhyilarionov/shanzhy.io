import { smoothstep } from "./geometry.mjs";
import { LOOK } from "./look.js";
import { createScene } from "./scene.js";

export const ENTRANCE_DURATION = 2.5;
export const CHROME_REVEAL_TIME = 2.5;

/** Point fades in over 0–.4s; square 1.1s, cube 1.8s, tesseract and motion 2.5s. */
export function entranceState(time) {
  return {
    plane: smoothstep(0.4, 1.1, time),
    volume: smoothstep(1.1, 1.8, time),
    hyper: smoothstep(1.8, 2.5, time),
    complete: time >= ENTRANCE_DURATION,
    motionTime: Math.max(0, time - ENTRANCE_DURATION),
  };
}

/**
 * Expansion uses the original scene's time-zero orientation throughout.
 * The original motion takes over as soon as the fourth dimension opens.
 * During expansion, the negative side of a collapsed axis owns the visible
 * surface; its positive copy fades in as that axis opens. This avoids drawing
 * four coincident panes (or rods) at full brightness in the square stage.
 */
export function createHomeScene(
  vertices, edges, faces, viewport, pointer, time, deltaTime, temporalState,
) {
  const entry = entranceState(time);
  if (entry.complete) {
    return createScene(
      vertices, edges, faces, viewport, pointer,
      entry.motionTime, deltaTime, temporalState,
    );
  }

  const dimensions = [entry.plane, entry.plane, entry.volume, entry.hyper];
  const visibility = (spanningAxes, vertex) => {
    let weight = 1;
    for (let axis = 0; axis < 4; axis++) {
      if (spanningAxes.includes(axis) || (axis >= 2 && vertex[axis] > 0)) {
        weight *= dimensions[axis];
      }
    }
    return weight;
  };
  const scene = createScene(
    vertices.map((vertex) => vertex.map((value, axis) => value * dimensions[axis])),
    edges,
    faces,
    viewport,
    { x: 0, y: 0 },
    0,
    deltaTime,
    temporalState,
    {
      faceVisibility: faces.map((face) => visibility(
        [face.firstAxis, face.secondAxis], vertices[face.corners[0]],
      )),
      edgeVisibility: edges.map(([first, second]) => visibility(
        [vertices[first].findIndex((value, axis) => value !== vertices[second][axis])],
        vertices[first],
      )),
    },
  );

  // Zero-area faces must never reach the shader's normal calculation.
  scene.faces = scene.faces.filter((face) => face.visibility > 0);
  scene.edges = scene.edges.filter((edge) => edge.visibility > 0);

  // Only the point is present during this interval. Fade the composited
  // canvas so its size and shading stay fixed throughout the fade.
  if (time < 0.4) scene.opacity = smoothstep(0, 0.4, time);
  const point = 1 - smoothstep(0.47, 0.75, time);
  if (point > 0) {
    // Match the edges' rounded endpoints, without adding a halo.
    scene.edges.push({
      bloom: false,
      x1: scene.centerX - 0.005,
      y1: scene.centerY,
      x2: scene.centerX + 0.005,
      y2: scene.centerY,
      bendDirection: [0, 0],
      coreWidth: LOOK.edges.baseWidth,
      coreColor: [1, 0.99, 0.97],
      coreIntensity: 6 * point,
      spectralStrength: 0,
      spread: 0,
      z1: 0,
      z2: 0,
      tint: [1, 1, 1],
    });
  }

  return scene;
}
