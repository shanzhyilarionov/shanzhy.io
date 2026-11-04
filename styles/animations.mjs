const panel = 1000;
const content = 500;
const interaction = 200;

export const wireframeWidth = 1.5;

export const motion = Object.freeze({
  panel,
  content,
  interaction,
  overlap: 300,
  projectMedia: 700,
  projectEntryLead: interaction,
  projectReturnLead: 300,
  projectDeparture: 300,
  projectHandoff: 120,
  loadingProgress: 180,
  loadingCompleteHold: 200,
  loadingCollapse: 500,
  loadingTimeoutBuffer: 100,
  resizeSettle: 100,
  feedbackHold: 2000,
  worksPreviewIdle: 3000,
  wheelGestureIdle: 160,
  videoBuffer: 3000,
  videoBufferTimeout: 3500,
  videoBufferTolerance: 50,
  preloadIdleTimeout: 1500,
  preloadInterval: 200,
  renderWarmup: 1000,
  renderSampleWindow: 2000,
  homeEntrance: 3000,
  homeDimension: 500,
  homeColorReveal: 2200,
  homeSceneReveal: 500,
  homeRotationRamp: 800,
  homeChromeReveal: 2500,
  homeReturnEntrance: 800,
});

export const easing = Object.freeze({
  panel: "cubic-bezier(0.76, 0, 0.24, 1)",
  content: "cubic-bezier(0.62, 0, 0.2, 1)",
  enter: "ease-out",
  exit: "ease-in",
  feedback: "ease-in-out",
  linear: "linear",
});

export const worksReveal = Object.freeze({
  genesis: 800,
  "shanzhy-io": content,
  "commissioning-workspace": panel,
});

export const homeReturnEntrance = Object.freeze({
  acceleration: 0.45,
  deceleration: 0.45,
  initialScale: 0.2,
});

export const cubeMotion = Object.freeze({
  rotationXWPerSecond: 0.43,
  rotationYZPerSecond: 0.19,
  pointerResponseMs: 100,
});

export const frameTiming = Object.freeze({
  defaultFps: 60,
  fallbackFps: 30,
  maxFps: 240,
  maxDeltaMs: 50,
  toleranceMs: 1,
  minHealthyFps: 20,
  slowWindowsBeforeFallback: 2,
});

export const videoPlaybackRate = 1;

const cssName = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

export const motionVariables = Object.freeze({
  ...Object.fromEntries([
    "panel", "content", "interaction", "overlap", "projectMedia", "projectEntryLead", "loadingCollapse",
  ].map((name) => [
    `--motion-${cssName(name)}`, `${motion[name]}ms`,
  ])),
  ...Object.fromEntries(Object.entries(easing).map(([name, value]) => [
    `--ease-${cssName(name)}`, value,
  ])),
  "--reveal-distance": "1rem",
  "--home-wireframe-width": `${wireframeWidth}px`,
});
