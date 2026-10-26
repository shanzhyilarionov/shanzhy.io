import assert from "node:assert/strict";
import test from "node:test";
import { hasSharedHeader } from "../components/chrome-transition.js";
import { getProjectTransition, startWorksProjectTransition } from "../app/(site)/works/project-transition.js";
import { projects } from "../app/(site)/works/projects.js";

function setup(t, slug = "genesis", { narrow = false } = {}) {
  const animations = [];
  class Element {
    constructor(tag = "div") {
      this.tag = tag;
      this.children = [];
      this.dataset = {};
      this.style = { setProperty(name, value) { this[name] = value; } };
    }
    append(...children) {
      children.forEach((child) => {
        child.remove();
        child.parentElement = this;
        this.children.push(child);
      });
    }
    remove() {
      const parent = this.parentElement;
      if (parent) parent.children = parent.children.filter((child) => child !== this);
      this.parentElement = null;
    }
    querySelectorAll(selector) {
      const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
      return descendants.filter((child) => selector === "*" || child.tag === selector);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    cloneNode() {
      const copy = this instanceof Image ? new Image() : new Element(this.tag);
      copy.dataset = { ...this.dataset };
      copy.append(...this.children.map((child) => child.cloneNode(true)));
      return copy;
    }
    replaceChildren(...children) {
      [...this.children].forEach((child) => child.remove());
      this.append(...children);
    }
    closest() { return page; }
    setAttribute() {}
    removeAttribute() {}
    getBoundingClientRect() { return { top: 20, left: 30, width: 160, height: 90 }; }
    animate(keyframes, timing) {
      const animation = { target: this, keyframes, timing, cancel: t.mock.fn() };
      animations.push(animation);
      return animation;
    }
  }
  class Image extends Element {
    constructor() {
      super("img");
      this.currentSrc = "/preview.png";
    }
  }
  const body = new Element("body");
  const page = new Element("main");
  const frame = new Element();
  frame.append(new Image());
  page.append(frame);
  const chrome = new Element();
  chrome.append(new Element("brand"), new Element("button"));
  body.append(page, chrome);
  const globals = {
    window: { matchMedia: () => ({ matches: narrow }) },
    HTMLImageElement: Image,
    document: {
      body,
      timeline: { currentTime: 500 },
      querySelector: (selector) => selector === "[data-site-chrome]" ? chrome :
        selector === `[data-project-thumbnail="${slug}"]` ? frame : null,
    },
    getComputedStyle: () => {
      const style = ["opacity", "visibility"];
      style.getPropertyValue = (name) => name === "opacity" ? "1" : "visible";
      return style;
    },
  };
  const originals = Object.fromEntries(Object.keys(globals).map((name) =>
    [name, Object.getOwnPropertyDescriptor(globalThis, name)],
  ));
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  t.after(() => {
    getProjectTransition()?.dispose();
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return { animations, body, page, chrome };
}

for (const { slug } of projects) {
  test(`Works navigation selects the ${slug} thumbnail, including query strings and fragments`, (t) => {
    setup(t, slug);
    assert.equal(startWorksProjectTransition("/works", `/works/${slug}?preview=1#demo`), true);
    assert.deepEqual(getProjectTransition().bounds, { top: 20, left: 30, width: 160, height: 90 });
  });
}

test("the departing header survives route unmount and fades on the same clock as the Works content", (t) => {
  const { animations, body, page, chrome } = setup(t);
  startWorksProjectTransition("/works", "/works/genesis");
  const [contentFade, chromeFade] = animations;
  assert.notEqual(chromeFade.target, chrome);
  assert.equal(chromeFade.target.children.length, 2);
  assert.deepEqual(chromeFade.keyframes, contentFade.keyframes);
  assert.deepEqual(chromeFade.timing, contentFade.timing);
  assert.equal(chromeFade.startTime, contentFade.startTime);
  page.remove();
  chrome.remove();
  assert.ok(body.children.includes(chromeFade.target));
  contentFade.onfinish();
  assert.equal(body.children.includes(chromeFade.target), false);
  assert.deepEqual(body.children, [getProjectTransition().preview]);
});

test("interrupting project entry removes both snapshots and restores the source page and header", (t) => {
  const { animations, body, page, chrome } = setup(t);
  startWorksProjectTransition("/works", "/works/genesis");
  getProjectTransition().dispose();
  assert.deepEqual(body.children, [page, chrome]);
  assert.equal(page.style.visibility, "");
  assert.equal(chrome.style.visibility, "");
  assert.ok(animations.every((animation) => animation.cancel.mock.callCount() === 1));
  assert.equal(getProjectTransition(), null);
});

test("other source pages and unknown destinations do not start a Works thumbnail transition", (t) => {
  setup(t);
  assert.equal(startWorksProjectTransition("/about", "/works/genesis"), false);
  assert.equal(startWorksProjectTransition("/works", "/about"), false);
  assert.equal(startWorksProjectTransition("/works", "/works/missing"), false);
  assert.equal(getProjectTransition(), null);
});

test("narrow Works entry keeps the original header visible while the page fades", (t) => {
  const { animations, body, chrome } = setup(t, "genesis", { narrow: true });
  startWorksProjectTransition("/works", "/works/genesis");
  assert.equal(animations.length, 1);
  assert.notEqual(animations[0].target, chrome);
  assert.notEqual(chrome.style.visibility, "hidden");
  assert.ok(body.children.includes(chrome));
  assert.equal(body.children.length, 4);
});

test("narrow project navigation shares the header while wide project entry replaces it", (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  let narrow = false;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: narrow }) },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  });
  for (narrow of [false, true]) {
    for (const source of ["/", "/works", "/about", "/contact", "/works/genesis"]) {
      for (const { slug } of projects) {
        assert.equal(hasSharedHeader(source, `/works/${slug}?preview=1#demo`), narrow && source !== "/");
      }
    }
    assert.equal(hasSharedHeader("/about", "/works"), true);
    assert.equal(hasSharedHeader("/works/genesis", "/works"), narrow);
    assert.equal(hasSharedHeader("/about", "/"), false);
  }
});
