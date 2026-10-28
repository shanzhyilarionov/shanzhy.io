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
  ui.advance(3000);
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

test("one continuous touch can trigger more transitions after each full animation", (t) => {
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
  ui.dispatch("touchend", { touches: [] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(80)] });
  assert.deepEqual(ui.changes, ["shanzhy-io", "commissioning-workspace"]);
});

test("activity renews the three second timeout even without switching projects", (t) => {
  const ui = setup(t);
  ui.swipe(40);
  ui.advance(2500);
  ui.swipe(10);
  ui.advance(2999);
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
  ui.advance(1);
  assert.deepEqual(ui.changes, ["shanzhy-io", null]);
});

test("a continuous vertical touch can move both ways through all projects", (t) => {
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
  ui.advance(3000);
  ui.swipe(-40, "horizontal");
  assert.equal(ui.changes.at(-1), "shanzhy-io");
});

test("a continuous horizontal touch can keep moving and reverse direction", (t) => {
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

for (const axis of ["vertical", "horizontal"]) {
  test(`${axis} decaying wheel inertia cannot trigger additional previews`, (t) => {
    const ui = setup(t);
    const scroll = (amount) => axis === "vertical" ? ui.wheel(amount) : ui.wheel(0, { deltaX: amount });
    scroll(80);
    for (let step = 0; step < 20; step += 1) {
      ui.advance(50);
      scroll(60 * 0.85 ** step);
    }
    assert.deepEqual(ui.changes, ["shanzhy-io"]);
    ui.advance(200);
    scroll(-80);
    assert.deepEqual(ui.changes, ["shanzhy-io", "genesis"]);
  });
}

test("active wheel movement can continue switching without waiting for a new gesture", (t) => {
  const ui = setup(t);
  ui.wheel(40);
  for (let step = 0; step < 5; step += 1) {
    ui.advance(100);
    ui.wheel(40);
  }
  assert.deepEqual(ui.changes, ["shanzhy-io", "commissioning-workspace"]);
  for (let step = 0; step < 10; step += 1) {
    ui.advance(100);
    ui.wheel(-40);
  }
  assert.deepEqual(ui.changes, ["shanzhy-io", "commissioning-workspace", "shanzhy-io", "genesis"]);
});

test("wheel input during an animation never schedules a transition after input stops", (t) => {
  const ui = setup(t);
  ui.wheel(100);
  ui.advance(150);
  ui.wheel(100);
  ui.advance(1000);
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
});

test("inertial spikes are ignored and renewed acceleration can resume switching", (t) => {
  const ui = setup(t);
  ui.wheel(80);
  for (const amount of [70, 60, 50, 40, 30, 24, 18, 14, 12, 10, 60, 8, 7]) {
    ui.advance(50);
    ui.wheel(amount);
  }
  assert.deepEqual(ui.changes, ["shanzhy-io"]);
  for (const amount of [12, 24]) {
    ui.advance(50);
    ui.wheel(amount);
  }
  assert.deepEqual(ui.changes, ["shanzhy-io", "commissioning-workspace"]);
});

test("inertia does not keep an idle hover visible or reopen it after timeout", (t) => {
  const ui = setup(t);
  ui.wheel(80);
  for (let step = 0; step < 60; step += 1) {
    ui.advance(100);
    ui.wheel(70 * 0.9 ** step);
  }
  assert.deepEqual(ui.changes, ["shanzhy-io", null]);
});

test("a continuous touch can change axes and ignores moves after release or cancel", (t) => {
  const ui = setup(t);
  ui.dispatch("touchstart", { touches: [ui.point(200)] });
  ui.dispatch("touchmove", { touches: [ui.point(160)] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(160, 140)] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(160, 100)] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(120, 100)] });
  ui.dispatch("touchcancel", { touches: [] });
  ui.advance(500);
  ui.dispatch("touchmove", { touches: [ui.point(160, 100)] });
  assert.deepEqual(ui.changes, ["shanzhy-io", "genesis", "shanzhy-io", "commissioning-workspace"]);
});

test("a finger remaining on screen can restart previews after the idle timeout", (t) => {
  const ui = setup(t);
  ui.dispatch("touchstart", { touches: [ui.point(200)] });
  ui.dispatch("touchmove", { touches: [ui.point(160)] });
  ui.advance(3000);
  ui.dispatch("touchmove", { touches: [ui.point(120)] });
  assert.deepEqual(ui.changes, ["shanzhy-io", null, "shanzhy-io"]);
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
    assert.deepEqual(ui.changes, ["shanzhy-io"]);
    ui.wheel(-amount, { deltaMode: mode });
    assert.deepEqual(ui.changes, ["shanzhy-io", "genesis"]);
    ui.advance(500);
    ui.wheel(amount, { deltaMode: mode });
    assert.deepEqual(ui.changes, ["shanzhy-io", "genesis", "shanzhy-io"]);
  });
}

test("mouse takeover clears a scroll preview without delayed wheel transitions", (t) => {
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
