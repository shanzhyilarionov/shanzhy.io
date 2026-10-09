import assert from "node:assert/strict";
import test from "node:test";
import { arriveWorks, retainProjectVideo } from "../app/(site)/works/project-transition.js";

function setup(t, { cropped = false, aspectRatio = 1.6, thumbnailReady = true, growing = false, lateMs = 0 } = {}) {
  const animations = [];
  const frames = new Map();
  let nextFrame = 0;
  const animate = (keyframes, timing) => {
    const animation = { keyframes, timing, cancel: t.mock.fn() };
    animations.push(animation);
    return animation;
  };
  class Image {
    style = { setProperty(name, value) { this[name] = value; } };
    naturalWidth = 1600;
    naturalHeight = 1000;
    currentSrc = "/preview.png";
    animate = animate;
    remove = t.mock.fn();
    querySelectorAll() { return []; }
    cloneNode() { return new Image(); }
    removeAttribute() {}
    setAttribute() {}
    getBoundingClientRect() {
      return Object.create({ left: -30, top: 275, width: 240, height: 150 });
    }
  }
  const globals = {
    HTMLImageElement: Image,
    document: {
      documentElement: {},
      timeline: { currentTime: 500 },
      createElement: () => ({ style: {}, animate, append: t.mock.fn(), remove: t.mock.fn() }),
    },
    getComputedStyle: () => {
      const computed = ["filter"];
      computed.getPropertyValue = (name) => name === "filter" ? "grayscale(1)" : "ease";
      return computed;
    },
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
  const bounds = { left: 400, top: 300, width: growing ? 60 : 640, height: growing ? 40 : 400 };
  const bitmap = new Image();
  bitmap.getBoundingClientRect = () => bounds;
  const preview = { style: {}, firstElementChild: bitmap, animate, append: t.mock.fn() };
  const targetImage = new Image();
  if (!thumbnailReady) targetImage.naturalWidth = targetImage.naturalHeight = 0;
  const target = {
    style: { visibility: "" },
    querySelector: () => targetImage,
    getBoundingClientRect: () => ({ left: 20, top: 275, width: 100, height: 150 }),
  };
  const sibling = { contains: () => false, animate };
  const selected = { contains: () => true, animate };
  const page = { querySelectorAll: () => [sibling, selected] };
  const transition = {
    preview, bounds, cropped, mediaAspectRatio: aspectRatio,
    startedAt: performance.now() - lateMs, dispose: t.mock.fn(),
  };
  const cleanup = arriveWorks(transition, page, target);
  const clippingFrame = preview.append.mock.calls[0].arguments[0];
  const thumbnail = clippingFrame.append.mock.calls[0].arguments[1];
  return { animations, preview, bitmap, clippingFrame, thumbnail, transition, target, cleanup, frames, page };
}

test("returning to a tall thumbnail preserves the full image aspect ratio without animating layout or filters", (t) => {
  const { animations, bitmap, preview, clippingFrame, thumbnail, target, transition } = setup(t);
  const [movement, clip, imageMovement, thumbnailMovement, poster, siblingFade] = animations;
  assert.equal(target.style.visibility, "hidden");
  assert.deepEqual(movement.keyframes, [
    { transform: "translate3d(0, 0, 0)" },
    { transform: "translate3d(-380px, -25px, 0)" },
  ]);
  assert.deepEqual(clip.keyframes, [
    { transform: "translate3d(0px, 0px, 0)" },
    { transform: "translate3d(-540px, -250px, 0)" },
  ]);
  assert.deepEqual(imageMovement.keyframes, [
    { transform: "translate3d(0, 0, 0) scale(1)" },
    { transform: "translate3d(470px, 250px, 0) scale(0.375)" },
  ]);
  assert.deepEqual(thumbnailMovement.keyframes, imageMovement.keyframes);
  assert.equal(parseFloat(bitmap.style.width) / parseFloat(bitmap.style.height), 1.6);
  assert.equal(preview.style.width, "640px");
  assert.equal(preview.style.height, "400px");
  assert.equal(preview.style.filter, "none");
  assert.equal(clippingFrame.style.width, preview.style.width);
  assert.equal(clippingFrame.style.height, preview.style.height);
  assert.equal(clippingFrame.style.overflow, "hidden");
  assert.equal(thumbnail.style.filter, "grayscale(1)");
  assert.equal(thumbnail.style.visibility, "visible");
  assert.deepEqual(poster.keyframes, [{ opacity: 0 }, { opacity: 1 }]);
  for (const animation of animations.slice(0, 5)) {
    assert.deepEqual(animation.timing, movement.timing);
    assert.equal(animation.startTime, movement.startTime);
    for (const keyframe of animation.keyframes) {
      assert.ok(Object.keys(keyframe).every((name) => ["transform", "opacity"].includes(name)));
    }
  }
  assert.equal(movement.timing.duration, 700);
  assert.equal(movement.timing.delay, 300);
  assert.equal(siblingFade.timing.delay, 500);
  movement.onfinish();
  assert.equal(target.style.visibility, "");
  assert.equal(transition.dispose.mock.callCount(), 1);
});

test("the mockup contracts to its screen crop using uniform image scaling", (t) => {
  const { animations } = setup(t, { cropped: true });
  assert.deepEqual(animations[2].keyframes, [
    { transform: "translate3d(0, 0, 0) scale(1)" },
    { transform: "translate3d(490px, 250px, 0) scale(0.375)" },
  ]);
  assert.deepEqual(animations[3].keyframes, animations[2].keyframes);
});

test("a video frame retains its own aspect ratio while fading to the image thumbnail", (t) => {
  const { animations, bitmap } = setup(t, { aspectRatio: 16 / 9 });
  assert.equal(parseFloat(bitmap.style.width) / parseFloat(bitmap.style.height), 16 / 9);
  assert.notDeepEqual(animations[2].keyframes, animations[3].keyframes);
});

test("a newly mounted thumbnail uses the source aspect ratio before Firefox exposes its intrinsic dimensions", (t) => {
  const { animations, thumbnail } = setup(t, { thumbnailReady: false, aspectRatio: 16 / 9 });
  assert.deepEqual(animations[2].keyframes, animations[3].keyframes);
  assert.ok(Number.isFinite(parseFloat(thumbnail.style.width)));
  assert.ok(Number.isFinite(parseFloat(thumbnail.style.height)));
  assert.ok(!animations[3].keyframes[1].transform.includes("NaN"));
});

test("interrupting or replaying a return restores visibility and cleans up every animation and extra image", (t) => {
  const { animations, bitmap, clippingFrame, thumbnail, preview, transition, target, cleanup, frames, page } = setup(t, { cropped: true });
  cleanup();
  assert.equal(target.style.visibility, "");
  animations.forEach((animation) => assert.equal(animation.cancel.mock.callCount(), 1));
  assert.equal(thumbnail.remove.mock.callCount(), 1);
  assert.equal(clippingFrame.remove.mock.callCount(), 1);
  assert.equal(preview.append.mock.calls[1].arguments[0], bitmap);
  assert.equal(bitmap.style.left, "0px");
  assert.equal(bitmap.style.top, "0px");
  const pending = transition.cleanupFrame;
  const cleanupReplay = arriveWorks(transition, page, target);
  assert.equal(frames.has(pending), false);
  cleanupReplay();
  frames.get(transition.cleanupFrame)();
  assert.equal(transition.dispose.mock.callCount(), 1);
});

function transformAt(animation, progress) {
  const values = animation.keyframes.map(({ transform }) => {
    const [x, y] = transform.match(/translate3d\(([^)]+)\)/)[1].split(",").map(parseFloat);
    const scale = parseFloat(transform.match(/scale\(([^)]+)\)/)?.[1] ?? "1");
    return [x, y, scale];
  });
  return values[0].map((start, index) => start + (values[1][index] - start) * progress);
}

for (const growing of [false, true]) {
  test(`moving overflow clips and images remain aligned throughout a ${growing ? "growing" : "shrinking"} return`, (t) => {
    const { animations, bitmap, preview, clippingFrame, transition, target } = setup(t, { growing });
    const from = transition.bounds;
    const to = target.getBoundingClientRect();
    const mix = (start, end, progress) => start + (end - start) * progress;
    for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const [frameX, frameY] = transformAt(animations[0], progress);
      const [clipX, clipY] = transformAt(animations[1], progress);
      const [imageX, imageY, scale] = transformAt(animations[2], progress);
      const width = parseFloat(preview.style.width) + clipX;
      const height = parseFloat(preview.style.height) + clipY;
      assert.ok(Math.abs(width - mix(from.width, to.width, progress)) < 1e-9);
      assert.ok(Math.abs(height - mix(from.height, to.height, progress)) < 1e-9);
      assert.ok(Math.abs(from.left + frameX - mix(from.left, to.left, progress)) < 1e-9);
      assert.ok(Math.abs(from.top + frameY - mix(from.top, to.top, progress)) < 1e-9);
      const imageWidth = parseFloat(bitmap.style.width) * scale;
      const imageHeight = parseFloat(bitmap.style.height) * scale;
      assert.ok(Math.abs(imageWidth / imageHeight - 1.6) < 1e-9);
      assert.ok(Math.abs(clipX + parseFloat(bitmap.style.left) + imageX - (width - imageWidth) / 2) < 1e-9);
      assert.ok(Math.abs(clipY + parseFloat(bitmap.style.top) + imageY - (height - imageHeight) / 2) < 1e-9);
      assert.equal(clippingFrame.style.width, preview.style.width);
    }
  });
}

test("a delayed route still starts the thumbnail crossfade transparently instead of jumping into a darker frame", (t) => {
  const { animations } = setup(t, { lateMs: 900 });
  const [movement, , , , poster] = animations;
  assert.equal(movement.startTime, 200);
  assert.equal(poster.startTime, movement.startTime);
  assert.equal(document.timeline.currentTime - poster.startTime, poster.timing.delay);
  assert.equal(poster.keyframes[0].opacity, 0);
});

for (const connected of [false, true]) {
  test(`retaining a video preserves its frame and restores it ${connected ? "when navigation is interrupted" : "after its page unmounts"}`, (t) => {
    const parent = { isConnected: connected, insertBefore: t.mock.fn() };
    const sibling = { parentNode: parent };
    const attributes = new Map([["style", "opacity: 1"]]);
    const video = {
      parentElement: parent,
      nextSibling: sibling,
      controls: true,
      paused: false,
      currentTime: 12.5,
      src: "blob:video-source",
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: (name) => attributes.delete(name),
      pause: t.mock.fn(),
      play: t.mock.fn(() => Promise.resolve()),
      load: t.mock.fn(),
    };
    const restore = retainProjectVideo(video);
    assert.equal(video.pause.mock.callCount(), 1);
    assert.equal(video.controls, false);
    assert.equal(video.currentTime, 12.5);
    assert.equal(video.src, "blob:video-source");
    attributes.set("style", "transform: scale(.5)");
    restore();
    restore();
    assert.equal(parent.insertBefore.mock.callCount(), 1);
    assert.deepEqual(parent.insertBefore.mock.calls[0].arguments, [video, sibling]);
    assert.equal(attributes.get("style"), "opacity: 1");
    assert.equal(video.controls, true);
    assert.equal(video.play.mock.callCount(), Number(connected));
    assert.equal(video.load.mock.callCount(), Number(!connected));
  });
}

test("an already paused video stays paused and does not regain inline transition styles", (t) => {
  const parent = { isConnected: true, insertBefore: t.mock.fn() };
  const sibling = { parentNode: null };
  const video = {
    parentElement: parent,
    nextSibling: sibling,
    controls: false,
    paused: true,
    getAttribute: () => null,
    pause: t.mock.fn(),
    play: t.mock.fn(),
    removeAttribute: t.mock.fn(),
  };
  retainProjectVideo(video)();
  assert.equal(video.play.mock.callCount(), 0);
  assert.deepEqual(parent.insertBefore.mock.calls[0].arguments, [video, null]);
  assert.deepEqual(video.removeAttribute.mock.calls[0].arguments, ["style"]);
});
