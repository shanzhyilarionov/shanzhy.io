import { clamp } from "./geometry.mjs";
import { createScene, projectSceneVertices } from "./scene.js";
import { homeReturnEntrance, motion, wireframeWidth } from "../../styles/animations.mjs";

export const LOADING_HOLD_DURATION = motion.loadingCompleteHold / 1000;
export const ENTRANCE_DURATION = motion.homeEntrance / 1000 - LOADING_HOLD_DURATION;
export const COLOR_REVEAL_TIME = motion.homeColorReveal / 1000 - LOADING_HOLD_DURATION;
export const COLOR_REVEAL_DURATION = motion.homeSceneReveal / 1000;
export const CHROME_REVEAL_TIME = motion.homeChromeReveal / 1000 - LOADING_HOLD_DURATION;
export const RETURN_ENTRANCE_DURATION = motion.homeReturnEntrance / 1000;
export const WIREFRAME_WIDTH = wireframeWidth;
export const UNFOLD_DURATION = 4 * motion.homeDimension / 1000;
const DIMENSION_DURATION = motion.homeDimension / 1000;
const ROTATION_DURATION = motion.homeRotationRamp / 1000;

function smoothProgress(time, start, duration) {
  const progress = clamp((time - start) / duration, 0, 1);
  return progress * progress * (3 - 2 * progress);
}

export function entranceState(time) {
  const rotationElapsed = Math.max(0, time - UNFOLD_DURATION);
  const accelerationTime = Math.min(rotationElapsed, ROTATION_DURATION);

  return {
    dimensions: [0, 1, 2, 3].map((stage) =>
      smoothProgress(time, stage * DIMENSION_DURATION, DIMENSION_DURATION),
    ),
    dotRadius: WIREFRAME_WIDTH / 2,
    dotOpacity: 1 - smoothProgress(time, 0, DIMENSION_DURATION),
    colorProgress: clamp((time - COLOR_REVEAL_TIME) / COLOR_REVEAL_DURATION, 0, 1),
    chromeProgress: smoothProgress(time, CHROME_REVEAL_TIME, ENTRANCE_DURATION - CHROME_REVEAL_TIME),
    complete: time >= ENTRANCE_DURATION,
    motionTime: accelerationTime ** 2 / (2 * ROTATION_DURATION) +
      Math.max(0, rotationElapsed - ROTATION_DURATION),
  };
}

export function returnEntranceState(time) {
  const progress = clamp(time / RETURN_ENTRANCE_DURATION, 0, 1);
  const { acceleration, deceleration, initialScale } = homeReturnEntrance;
  const peakSpeed = 1 / (1 - (acceleration + deceleration) / 2);

  const eased =
    progress < acceleration
      ? peakSpeed * progress ** 2 / (2 * acceleration)
      : progress <= 1 - deceleration
        ? peakSpeed * (progress - acceleration / 2)
        : 1 - peakSpeed * (1 - progress) ** 2 / (2 * deceleration);

  return {
    scale: initialScale + (1 - initialScale) * eased,
    opacity: eased,
    complete: progress === 1,
    motionTime: Math.max(0, time),
  };
}

function unfoldEdges(vertices, edges, viewport, entry) {
  const points = projectSceneVertices(
    vertices.map((vertex) => vertex.map((value, axis) => value * entry.dimensions[axis])),
    viewport, { x: 0, y: 0 }, 0,
  );
  const unique = new Map();

  for (const [firstIndex, secondIndex] of edges) {
    const first = points[firstIndex];
    const second = points[secondIndex];
    if (Math.hypot(first.x - second.x, first.y - second.y) < 1e-6) continue;
    const key = [first, second].map((point) =>
      `${point.x.toFixed(6)},${point.y.toFixed(6)}`,
    ).sort().join(":");
    unique.set(key, { x1: first.x, y1: first.y, x2: second.x, y2: second.y });
  }

  return [...unique.values()];
}

export function createHomeScene(
  vertices, edges, faces, viewport, pointer, time, deltaTime, temporalState,
  returning = false,
) {
  const entry = returning ? returnEntranceState(time) : entranceState(time);
  const scene = createScene(
    vertices, edges, faces, viewport,
    entry.complete ? pointer : { x: 0, y: 0 },
    entry.motionTime, deltaTime, temporalState,
  );

  if (!entry.complete) {
    if (returning) {
      scene.entranceScale = entry.scale;
      scene.opacity = entry.opacity;
    } else {
      scene.opacity = entry.colorProgress;
      scene.backgroundOpacity = 1 - entry.colorProgress;
      scene.chromeOpacity = entry.chromeProgress;
      scene.wireframe = {
        opacity: 1 - entry.colorProgress,
        dotRadius: entry.dotRadius,
        dotOpacity: entry.dotOpacity,
        edges: time >= UNFOLD_DURATION
          ? scene.edges
          : unfoldEdges(vertices, edges, viewport, entry),
      };
    }
  }

  return scene;
}
