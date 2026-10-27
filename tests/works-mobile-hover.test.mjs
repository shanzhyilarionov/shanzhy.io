import assert from "node:assert/strict";
import test from "node:test";
import { bindMobileWorksHover } from "../app/(site)/works/mobile-hover.js";

function setup(t, mobile = true) {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const changes = [];
  let dispose = () => {};
  t.after(() => dispose());
  const page = new EventTarget();
  const media = new EventTarget();
  media.matches = mobile;
  page.clientHeight = 800;
  page.clientWidth = 390;
  const globals = {
    performance: { now: () => now },
    window: {
      matchMedia: () => media,
      setTimeout: (callback, delay) => {
        timers.set(++timerId, { callback, at: now + delay });
        return timerId;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  dispose = bindMobileWorksHover(page, (slug) => changes.push(slug));

  const dispatch = (type, props) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, props);
    page.dispatchEvent(event);
    return event;
  };
  const point = (y, x = 100) => ({ identifier: 1, clientX: x, clientY: y });
  const advance = (ms) => {
    now += ms;
    for (const [id, timer] of timers) {
      if (timer.at <= now) {
        timers.delete(id);
        timer.callback();
      }
    }
  };
  const swipe = (delta, axis = "vertical") => {
    dispatch("touchstart", { touches: [point(200)] });
    dispatch("touchmove", { touches: [axis === "horizontal" ? point(200, 100 + delta) : point(200 + delta)] });
    dispatch("touchend", { touches: [] });
  };
  const wheel = (deltaY, props = {}) => dispatch("wheel", { deltaY, deltaX: 0, deltaMode: 0, ...props });
  return { changes, page, media, timers, dispose, dispatch, point, advance, swipe, wheel };
}

test("the first swipe opens shanzhy.io in either direction after the threshold", (t) => {
  const ui = setup(t);
  ui.swipe(20);
  assert.deepEqual(ui.changes, []);
  ui.swipe(40);
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
  ui.advance(5000);
  ui.swipe(-40);
  assert.deepEqual(ui.changes, ["shanzhy-io", null, "shanzhy-io"]);
});

test("finger down selects genesis and finger up reverses through shanzhy.io to cw", (t) => {
  const ui = setup(t);
  for (const delta of [40, 40, 40, -40, -40, -40, 40, 40]) {
    ui.swipe(delta);
    ui.advance(500);
  }
  assert.deepEqual(ui.changes, [
    "shanzhy-io", "genesis", "shanzhy-io", "commissioning-workspace", "shanzhy-io", "genesis",
  ]);
});

test("each hover animation completes before another swipe can select a project", (t) => {
  const ui = setup(t);
  ui.swipe(40);
  ui.advance(499);
  ui.swipe(80);
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
  ui.advance(1);
  ui.swipe(40);
  assert.deepEqual(ui.changes, ["shanzhy-io", "genesis"]);
});

test("continuous touch movement accumulates until a complete transition is triggered", (t) => {
  const ui = setup(t);
  ui.dispatch("touchstart", { touches: [ui.point(200)] });
  ui.dispatch("touchmove", { touches: [ui.point(180)] });
  assert.deepEqual(ui.changes, []);
  const move = ui.dispatch("touchmove", { touches: [ui.point(160)] });
  assert.equal(move.defaultPrevented, true);
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(120)] });
  assert.deepEqual(ui.changes, ["shanzhy-io", "commissioning-workspace"]);
});

test("activity renews the five second timeout even without switching projects", (t) => {
  const ui = setup(t);
  ui.swipe(40);
  ui.advance(4500);
  ui.swipe(10);
  ui.advance(4999);
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
  ui.advance(1);
  assert.deepEqual(ui.changes, ["shanzhy-io", null]);
});

test("reversing direction during one touch switches back after the animation", (t) => {
  const ui = setup(t);
  ui.dispatch("touchstart", { touches: [ui.point(200)] });
  ui.dispatch("touchmove", { touches: [ui.point(240)] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(280)] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(240)] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(200)] });
  assert.deepEqual(ui.changes, ["shanzhy-io", "genesis", "shanzhy-io", "commissioning-workspace"]);
});

test("wheel movement uses scroll direction and a distance threshold", (t) => {
  const ui = setup(t);
  ui.wheel(20);
  assert.deepEqual(ui.changes, []);
  ui.wheel(20);
  ui.advance(500);
  ui.wheel(-40);
  assert.deepEqual(ui.changes, ["shanzhy-io", "genesis"]);
});

test("horizontal swipes open shanzhy.io first and switch in both directions", (t) => {
  const ui = setup(t);
  ui.swipe(20, "horizontal");
  assert.deepEqual(ui.changes, []);
  for (const delta of [40, 40, 40, -40, -40, -40, 40, 40]) {
    ui.swipe(delta, "horizontal");
    ui.advance(500);
  }
  assert.deepEqual(ui.changes, [
    "shanzhy-io", "genesis", "shanzhy-io", "commissioning-workspace", "shanzhy-io", "genesis",
  ]);
  ui.advance(5000);
  ui.swipe(-40, "horizontal");
  assert.equal(ui.changes.at(-1), "shanzhy-io");
});

test("a horizontal gesture can reverse without lifting and waits for each animation", (t) => {
  const ui = setup(t);
  ui.dispatch("touchstart", { touches: [ui.point(200)] });
  const move = ui.dispatch("touchmove", { touches: [ui.point(200, 140)] });
  assert.equal(move.defaultPrevented, true);
  ui.dispatch("touchmove", { touches: [ui.point(200, 180)] });
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(200, 220)] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(200, 180)] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(200, 140)] });
  assert.deepEqual(ui.changes, ["shanzhy-io", "genesis", "shanzhy-io", "commissioning-workspace"]);
});

test("horizontal wheel input uses the dominant axis and normalizes page distances", (t) => {
  const ui = setup(t);
  ui.wheel(2, { deltaX: 20 });
  assert.deepEqual(ui.changes, []);
  ui.wheel(2, { deltaX: 20 });
  ui.advance(500);
  ui.wheel(0, { deltaX: -0.1, deltaMode: 2 });
  assert.deepEqual(ui.changes, ["shanzhy-io", "genesis"]);
});

test("desktop and pinch zoom preserve their default behavior", (t) => {
  const ui = setup(t, false);
  ui.swipe(80);
  ui.swipe(80, "horizontal");
  assert.equal(ui.wheel(80).defaultPrevented, false);
  assert.equal(ui.wheel(0, { deltaX: 80 }).defaultPrevented, false);
  ui.media.matches = true;
  assert.equal(ui.wheel(80, { ctrlKey: true }).defaultPrevented, false);
  assert.equal(ui.wheel(0, { deltaX: 80, ctrlKey: true }).defaultPrevented, false);
  ui.dispatch("touchstart", { touches: [ui.point(200), { ...ui.point(200), identifier: 2 }] });
  ui.dispatch("touchmove", { touches: [ui.point(100)] });
  assert.deepEqual(ui.changes, []);
});

test("resizing clears mobile hover and disposal removes listeners and timers", (t) => {
  const ui = setup(t);
  ui.swipe(40);
  ui.media.matches = false;
  ui.media.dispatchEvent(new Event("change"));
  assert.deepEqual(ui.changes, ["shanzhy-io", null]);
  ui.media.matches = true;
  ui.swipe(40);
  ui.dispose();
  assert.equal(ui.timers.size, 0);
  ui.swipe(80);
  ui.wheel(80);
  assert.deepEqual(ui.changes, ["shanzhy-io", null, "shanzhy-io"]);
});
