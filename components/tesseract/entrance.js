import { clamp } from "./geometry.mjs";
import { createScene } from "./scene.js";

export const ENTRANCE_DURATION = 0.8;
export const CHROME_REVEAL_TIME = 0.5;

export function entranceState(time) {
  const progress = clamp(time / ENTRANCE_DURATION, 0, 1);
  const acceleration = 0.45;
  const deceleration = 0.45;
  const peakSpeed = 1 / (1 - (acceleration + deceleration) / 2);

  const eased =
    progress < acceleration
      ? peakSpeed * progress ** 2 / (2 * acceleration)
      : progress <= 1 - deceleration
        ? peakSpeed * (progress - acceleration / 2)
        : 1 - peakSpeed * (1 - progress) ** 2 / (2 * deceleration);

  return {
    scale: 0.2 + 0.8 * eased,
    opacity: eased,
    complete: progress === 1,
    motionTime: Math.max(0, time),
  };
}

export function createHomeScene(
  vertices, edges, faces, viewport, pointer, time, deltaTime, temporalState,
) {
  const entry = entranceState(time);
  const scene = createScene(
    vertices, edges, faces, viewport,
    entry.complete ? pointer : { x: 0, y: 0 },
    entry.motionTime, deltaTime, temporalState,
  );

  if (!entry.complete) {
    scene.entranceScale = entry.scale;
    scene.opacity = entry.opacity;
  }

  return scene;
}
