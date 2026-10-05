import assert from "node:assert/strict";
import test from "node:test";
import { arriveProject } from "../app/(site)/works/project-transition.js";

function setup(t, { mediaReady = false, filter = "grayscale(1)", cropped = false } = {}) {
  const frames = new Map();
  let nextFrame = 0;
  const globals = {
    document: { documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: () => "ease" }),
    requestAnimationFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }

  const animations = [];
  const animate = (keyframes, timing) => {
    const animation = { keyframes, timing, cancel: t.mock.fn() };
    animations.push(animation);
    return animation;
  };
  const image = {
    style: { filter },
    animate,
    getBoundingClientRect: () => ({ top: -20, left: -90, width: 400, height: 250 }),
  };
  const bounds = { top: 10, left: 10, width: 100, height: 150 };
  const target = {
    style: { visibility: "" },
    getBoundingClientRect: () => ({ top: 300, left: 20, width: 350, height: cropped ? 218.75 : 197 }),
  };
  const transition = {
    startedAt: performance.now(),
    bounds,
    preview: { animate, querySelector: () => image },
    mediaReady,
    cropped,
    dispose: t.mock.fn(),
  };
  const cleanup = arriveProject(transition, target);
  const presentMedia = () => {
    transition.mediaReady = true;
    transition.onMediaReady?.();
  };
  return { transition, target, animations, cleanup, presentMedia, frames };
}

test("keeps the cover after movement until a video frame has been committed", (t) => {
  const { transition, target, animations, presentMedia } = setup(t);
  assert.equal(target.style.visibility, "hidden");
  animations[0].onfinish();
  assert.equal(target.style.visibility, "");
  assert.equal(transition.dispose.mock.callCount(), 0);
  assert.equal(animations.length, 2);

  presentMedia();
  assert.equal(animations.length, 3);
  assert.deepEqual(animations[2].keyframes, [{ opacity: 1 }, { opacity: 0 }]);
  assert.equal(transition.dispose.mock.callCount(), 0);
  presentMedia();
  assert.equal(animations.length, 3);
  animations[2].onfinish();
  assert.equal(transition.dispose.mock.callCount(), 1);
});

test("a mockup expands its existing image from the screen crop to the full composition without distortion", (t) => {
  const { animations, target } = setup(t, { cropped: true });
  const [movement, color, crop] = animations;
  assert.equal(target.style.visibility, "hidden");
  assert.deepEqual(crop.keyframes, [
    { top: "-30px", left: "-100px", width: "400px", height: "250px" },
    { top: "0px", left: "0px", width: "350px", height: "218.75px" },
  ]);
  assert.deepEqual(crop.timing, movement.timing);
  assert.equal(crop.currentTime, movement.currentTime);
  assert.equal(color.currentTime, movement.currentTime);
  const [start, end] = crop.keyframes.map(({ width, height }) => ({
    width: parseFloat(width), height: parseFloat(height),
  }));
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const width = start.width + (end.width - start.width) * progress;
    const height = start.height + (end.height - start.height) * progress;
    assert.equal(width / height, 1.6);
  }
});

test("a mockup waits for image readiness and cancels its crop animation when interrupted", (t) => {
  const { transition, animations, cleanup, presentMedia } = setup(t, { cropped: true });
  animations[0].onfinish();
  assert.equal(animations.length, 3);
  presentMedia();
  assert.equal(animations.length, 4);
  cleanup();
  animations.forEach((animation) => assert.equal(animation.cancel.mock.callCount(), 1));
  assert.equal(transition.dispose.mock.callCount(), 0);
});

test("a ready video or playback fallback still waits for the movement to finish", (t) => {
  const { animations, presentMedia } = setup(t, { mediaReady: true });
  presentMedia();
  assert.equal(animations.length, 2);
  animations[0].onfinish();
  assert.equal(animations.length, 3);
});

test("color fades from the current hover state on the same 700ms movement clock", (t) => {
  const { animations: [movement, color] } = setup(t, { filter: "grayscale(0.65)" });
  assert.deepEqual(color.keyframes, [
    { filter: "grayscale(0.65)" }, { filter: "grayscale(0)" },
  ]);
  assert.deepEqual(color.timing, movement.timing);
  assert.equal(color.timing.duration, 700);
  assert.equal(color.currentTime, movement.currentTime);
});

test("leaving while media is pending cancels animations and ignores late readiness", (t) => {
  const { transition, target, animations, cleanup, presentMedia, frames } = setup(t);
  animations[0].onfinish();
  cleanup();
  presentMedia();
  assert.equal(animations.length, 2);
  assert.equal(target.style.visibility, "");
  animations.forEach((animation) => assert.equal(animation.cancel.mock.callCount(), 1));
  frames.get(transition.cleanupFrame)();
  assert.equal(transition.dispose.mock.callCount(), 1);
});

test("effect replay cancels deferred disposal and leaving cancels an active handoff", (t) => {
  const { transition, target, animations, cleanup, frames } = setup(t, { mediaReady: true });
  cleanup();
  const disposeFrame = transition.cleanupFrame;
  const cleanupReplay = arriveProject(transition, target);
  assert.equal(frames.has(disposeFrame), false);
  animations[2].onfinish();
  assert.equal(animations.length, 5);
  cleanupReplay();
  assert.equal(animations[4].cancel.mock.callCount(), 1);
  assert.equal(target.style.visibility, "");
});
