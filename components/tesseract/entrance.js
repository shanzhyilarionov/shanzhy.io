import { smoothstep } from "./geometry.mjs";
import { LOOK } from "./look.js";
import { createScene } from "./scene.js";

export const ENTRANCE_DURATION = 3;
export const CHROME_REVEAL_TIME = ENTRANCE_DURATION;

export function entranceState(time) {
  return {
    line: smoothstep(0.2, 0.9, time),
    plane: smoothstep(0.9, 1.6, time),
    volume: smoothstep(1.6, 2.3, time),
    hyper: smoothstep(2.3, ENTRANCE_DURATION, time),
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

  const dimensions = [entry.line, entry.plane, entry.volume, entry.hyper];
  const visibility = (spanningAxes, vertex) => {
    let weight = 1;
    for (let axis = 0; axis < 4; axis++) {
      if (spanningAxes.includes(axis) || vertex[axis] > 0) {
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

  if (time < 0.2) scene.opacity = smoothstep(0, 0.2, time);
  const point = 1 - smoothstep(0.27, 0.55, time);
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
