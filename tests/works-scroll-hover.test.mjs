import assert from "node:assert/strict";
import test from "node:test";
import { bindWorksScrollHover } from "../app/(site)/works/scroll-hover.js";

function setup(t, width = 390) {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const changes = [];
  let dispose = () => {};
  t.after(() => dispose());
  const page = new EventTarget();
  page.clientHeight = 800;
  page.clientWidth = width;
  const globals = {
    performance: { now: () => now },
    window: {
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
  dispose = bindWorksScrollHover(page, (slug) => changes.push(slug));

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
  return { changes, page, timers, dispose, dispatch, point, advance, swipe, wheel };
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

test("one touch accumulates to the threshold and triggers only one transition", (t) => {
  const ui = setup(t);
  ui.dispatch("touchstart", { touches: [ui.point(200)] });
  ui.dispatch("touchmove", { touches: [ui.point(180)] });
  assert.deepEqual(ui.changes, []);
  const move = ui.dispatch("touchmove", { touches: [ui.point(160)] });
  assert.equal(move.defaultPrevented, true);
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(120)] });
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
  ui.dispatch("touchend", { touches: [] });
  ui.swipe(-40);
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

test("reversing direction within one touch does not trigger another hover", (t) => {
  const ui = setup(t);
  ui.dispatch("touchstart", { touches: [ui.point(200)] });
  ui.dispatch("touchmove", { touches: [ui.point(240)] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(280)] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(240)] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(200)] });
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
  ui.dispatch("touchend", { touches: [] });
  ui.swipe(40);
  assert.deepEqual(ui.changes, ["shanzhy-io", "genesis"]);
});

test("wheel movement uses scroll direction and a distance threshold", (t) => {
  const ui = setup(t);
  ui.wheel(4);
  assert.deepEqual(ui.changes, []);
  ui.wheel(4);
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

test("a horizontal gesture switches once even when it continues or reverses", (t) => {
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
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
  ui.dispatch("touchend", { touches: [] });
  ui.swipe(-40, "horizontal");
  assert.deepEqual(ui.changes, ["shanzhy-io", "commissioning-workspace"]);
});

for (const axis of ["vertical", "horizontal"]) {
  test(`${axis} wheel inertia triggers one hover until scrolling stops`, (t) => {
    const ui = setup(t);
    const scroll = (amount) => axis === "vertical" ? ui.wheel(amount) : ui.wheel(0, { deltaX: amount });
    scroll(1000);
    for (let step = 0; step < 20; step += 1) {
      ui.advance(100);
      scroll(step < 10 ? 300 : -300);
    }
    assert.deepEqual(ui.changes, ["shanzhy-io"]);
    ui.advance(241);
    scroll(-1000);
    assert.deepEqual(ui.changes, ["shanzhy-io", "genesis"]);
  });
}

test("a new wheel gesture during animation is queued once without repeating on inertia", (t) => {
  const ui = setup(t);
  ui.wheel(1000);
  ui.advance(300);
  ui.wheel(1000);
  for (let step = 0; step < 6; step += 1) {
    ui.advance(100);
    ui.wheel(1000);
  }
  assert.deepEqual(ui.changes, ["shanzhy-io", "commissioning-workspace"]);
  ui.advance(241);
  ui.wheel(-1000);
  assert.deepEqual(ui.changes, ["shanzhy-io", "commissioning-workspace", "shanzhy-io"]);
});

test("horizontal wheel input uses the dominant axis and normalizes page distances", (t) => {
  const ui = setup(t);
  ui.wheel(2, { deltaX: 4 });
  assert.deepEqual(ui.changes, []);
  ui.wheel(2, { deltaX: 4 });
  ui.advance(500);
  ui.wheel(0, { deltaX: -0.1, deltaMode: 2 });
  assert.deepEqual(ui.changes, ["shanzhy-io", "genesis"]);
});

for (const [mode, amount] of [[0, 8], [1, 1]]) {
  test(`small desktop wheel steps in delta mode ${mode} switch without repeated attempts`, (t) => {
    const ui = setup(t, 1920);
    ui.wheel(amount, { deltaMode: mode });
    assert.deepEqual(ui.changes, ["shanzhy-io"]);
    ui.advance(150);
    ui.wheel(-amount, { deltaMode: mode });
    assert.deepEqual(ui.changes, ["shanzhy-io"]);
    ui.advance(350);
    assert.deepEqual(ui.changes, ["shanzhy-io", "genesis"]);
    ui.advance(500);
    ui.wheel(amount, { deltaMode: mode });
    assert.deepEqual(ui.changes, ["shanzhy-io", "genesis", "shanzhy-io"]);
  });
}

test("mouse takeover cancels a queued wheel transition", (t) => {
  const ui = setup(t);
  ui.wheel(100);
  ui.advance(150);
  ui.wheel(100);
  ui.dispatch("pointermove", { pointerType: "mouse", movementX: 1, movementY: 0 });
  ui.advance(500);
  assert.deepEqual(ui.changes, ["shanzhy-io", null]);
  assert.equal(ui.timers.size, 0);
});

test("wide touchscreens and desktop wheels use the same project sequence", (t) => {
  const ui = setup(t, 1920);
  ui.swipe(40);
  ui.advance(500);
  ui.swipe(40, "horizontal");
  ui.advance(500);
  assert.equal(ui.wheel(40).defaultPrevented, true);
  ui.advance(500);
  ui.wheel(0, { deltaX: 40 });
  assert.deepEqual(ui.changes, ["shanzhy-io", "genesis", "shanzhy-io", "commissioning-workspace"]);
});

test("pinch zoom preserves its default behavior", (t) => {
  const ui = setup(t, 1920);
  assert.equal(ui.wheel(80, { ctrlKey: true }).defaultPrevented, false);
  assert.equal(ui.wheel(0, { deltaX: 80, ctrlKey: true }).defaultPrevented, false);
  ui.dispatch("touchstart", { touches: [ui.point(200), { ...ui.point(200), identifier: 2 }] });
  ui.dispatch("touchmove", { touches: [ui.point(100)] });
  assert.deepEqual(ui.changes, []);
});

test("mouse movement takes over a scroll preview while touch movement leaves it active", (t) => {
  const ui = setup(t);
  ui.swipe(40);
  ui.dispatch("pointermove", { pointerType: "touch", movementX: 10, movementY: 10 });
  ui.dispatch("pointermove", { pointerType: "mouse", movementX: 0, movementY: 0 });
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
  ui.dispatch("pointermove", { pointerType: "mouse", movementX: 1, movementY: 0 });
  assert.deepEqual(ui.changes, ["shanzhy-io", null]);
  assert.equal(ui.timers.size, 0);
  ui.wheel(-40);
  assert.deepEqual(ui.changes, ["shanzhy-io", null, "shanzhy-io"]);
});

test("disposal removes listeners and idle timers", (t) => {
  const ui = setup(t);
  ui.swipe(40);
  ui.dispose();
  assert.equal(ui.timers.size, 0);
  ui.swipe(80);
  ui.wheel(80);
  ui.dispatch("pointermove", { pointerType: "mouse", movementX: 1, movementY: 0 });
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
});
