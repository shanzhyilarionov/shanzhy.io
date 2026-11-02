import assert from "node:assert/strict";
import test from "node:test";
import { hasSharedHeader } from "../components/chrome-transition.js";
import { getProjectReturn, getProjectTransition, startProjectReturn, startWorksProjectTransition } from "../app/(site)/works/project-transition.js";
import { projects } from "../app/(site)/works/projects.js";

function setup(t, slug = "genesis", { narrow = false } = {}) {
  const animations = [];
  class Element {
    constructor(tag = "div") {
      this.tag = tag;
      this.children = [];
      this.dataset = {};
      this.attributes = new Map();
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
    insertBefore(child, sibling) {
      child.remove();
      child.parentElement = this;
      const index = this.children.indexOf(sibling);
      this.children.splice(index < 0 ? this.children.length : index, 0, child);
    }
    get nextSibling() {
      return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] ?? null;
    }
    querySelectorAll(selector) {
      const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
      return descendants.filter((child) => selector === "*" || child.tag === selector ||
        (selector === "[data-project-media]" && child.dataset.projectMedia !== undefined));
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
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAnimations() { return []; }
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
      this.naturalWidth = 1600;
      this.naturalHeight = 1000;
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
    window: { matchMedia: () => ({ matches: narrow }), setTimeout: t.mock.fn(), clearTimeout: t.mock.fn() },
    HTMLImageElement: Image,
    document: {
      body,
      timeline: { currentTime: 500 },
      createElement: (tag) => new Element(tag),
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
    getProjectReturn()?.dispose();
    getProjectTransition()?.dispose();
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return { animations, body, page, chrome, frame };
}

for (const { slug } of projects) {
  test(`Works navigation selects the ${slug} thumbnail, including query strings and fragments`, (t) => {
    setup(t, slug);
    assert.equal(startWorksProjectTransition("/works", `/works/${slug}?preview=1#demo`), true);
    assert.deepEqual(getProjectTransition().bounds, { top: 20, left: 30, width: 160, height: 90 });
  });
}

for (const narrow of [false, true]) {
  test(`project entry on a ${narrow ? "narrow" : "wide"} viewport reuses the displayed image without changing its responsive source`, (t) => {
    const { frame, page } = setup(t, "genesis", { narrow });
    const image = frame.querySelector("img");
    image.setAttribute("srcset", "/preview-small.png 400w, /preview.png 800w");
    image.setAttribute("sizes", "22rem");
    image.setAttribute("style", "object-fit: cover");
    frame.dataset.projectCrop = "true";
    startWorksProjectTransition("/works", "/works/genesis");
    const transition = getProjectTransition();
    assert.equal(transition.preview.querySelector("img"), image);
    assert.equal(image.getAttribute("srcset"), "/preview-small.png 400w, /preview.png 800w");
    assert.equal(image.getAttribute("sizes"), "22rem");
    assert.equal(image.currentSrc, "/preview.png");
    assert.equal(image.style.visibility, "visible");
    assert.equal(page.style.visibility, "hidden");
    transition.dispose();
    transition.dispose();
    assert.equal(frame.querySelector("img"), image);
    assert.equal(image.getAttribute("style"), "object-fit: cover");
  });

  test(`project return on a ${narrow ? "narrow" : "wide"} viewport keeps the displayed image until the transition ends`, (t) => {
    const { page, frame } = setup(t, "genesis", { narrow });
    frame.dataset.projectMedia = "";
    frame.dataset.projectCrop = "true";
    const image = frame.querySelector("img");
    image.setAttribute("srcset", "/preview-small.png 400w, /preview.png 800w");
    image.setAttribute("sizes", "100vw");
    const transition = startProjectReturn(page, frame, "genesis");
    assert.equal(transition.preview.querySelector("img"), image);
    assert.equal(image.getAttribute("srcset"), "/preview-small.png 400w, /preview.png 800w");
    assert.equal(image.getAttribute("sizes"), "100vw");
    assert.equal(image.currentSrc, "/preview.png");
    assert.equal(image.style.visibility, "visible");
    assert.equal(page.style.visibility, "hidden");
    transition.dispose();
    transition.dispose();
    assert.equal(frame.querySelector("img"), image);
    assert.equal(image.getAttribute("style"), null);
    assert.equal(page.style.visibility, "");
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

test("disposing an old entry again preserves the current transition and its hidden source", (t) => {
  const { animations, page, chrome } = setup(t);
  startWorksProjectTransition("/works", "/works/genesis");
  const previous = getProjectTransition();
  startWorksProjectTransition("/works", "/works/genesis");
  const current = getProjectTransition();

  previous.dispose();

  assert.equal(previous.disposed, true);
  assert.equal(getProjectTransition(), current);
  assert.equal(page.style.visibility, "hidden");
  assert.equal(chrome.style.visibility, "hidden");
  assert.ok(animations.slice(0, 2).every((animation) => animation.cancel.mock.callCount() === 1));
  assert.ok(animations.slice(2).every((animation) => animation.cancel.mock.callCount() === 0));
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
