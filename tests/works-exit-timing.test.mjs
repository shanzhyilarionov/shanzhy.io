import assert from "node:assert/strict";
import test from "node:test";
import { getWorksExitDelay } from "../app/(site)/works/exit-timing.js";

function setup(t, { hovered = false, enabled = true, mouse = true, animations = [] } = {}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: mouse }) },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  });

  return {
    dataset: { hoverEnabled: String(enabled) },
    querySelector: () => hovered ? {} : null,
    getAnimations: () => animations,
  };
}

test("an idle works page exits immediately, including during its entrance", (t) => {
  const row = setup(t, { animations: [{ playState: "running", animationName: "revealUp" }] });
  assert.equal(getWorksExitDelay(row), 0);
  assert.equal(getWorksExitDelay(null), 0);
});

test("an enabled mouse hover keeps the card restoration step", (t) => {
  assert.equal(getWorksExitDelay(setup(t, { hovered: true })), 500);
});

test("a pointer resting on a card does not delay exit while hover is disabled", (t) => {
  assert.equal(getWorksExitDelay(setup(t, { hovered: true, enabled: false })), 0);
});

test("touch hover does not delay exit", (t) => {
  assert.equal(getWorksExitDelay(setup(t, { hovered: true, mouse: false })), 0);
});

test("cards still restoring after pointer leave keep the restoration step", (t) => {
  for (const transitionProperty of ["flex-basis", "filter"]) {
    const row = setup(t, {
      animations: [{ playState: "running", transitionProperty }],
    });
    assert.equal(getWorksExitDelay(row), 500);
  }
});

test("finished hover transitions and title fades do not delay exit", (t) => {
  const row = setup(t, {
    animations: [
      { playState: "finished", transitionProperty: "flex-basis" },
      { playState: "finished", transitionProperty: "filter" },
      { playState: "running", transitionProperty: "opacity" },
    ],
  });
  assert.equal(getWorksExitDelay(row), 0);
});
