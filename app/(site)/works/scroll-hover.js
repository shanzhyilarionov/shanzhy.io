import { projects } from "./projects.js";

const SWIPE_THRESHOLD = 36;
const WHEEL_THRESHOLD = 8;
const ANIMATION_MS = 500;
const WHEEL_GESTURE_IDLE_MS = 160;
const IDLE_MS = 5000;

export function bindWorksScrollHover(page, onChange) {
  let activeIndex = null;
  let distance = 0;
  let lockedUntil = 0;
  let idleTimer;
  let touch = null;
  let lastWheelAt = null;
  let wheelDistance = 0;
  let lastWheelDelta = 0;
  let fallingSamples = 0;
  let risingSamples = 0;
  let wheelInertia = false;

  const reset = () => {
    window.clearTimeout(idleTimer);
    activeIndex = null;
    distance = 0;
    wheelDistance = 0;
    lockedUntil = 0;
    onChange(null);
  };

  const recordActivity = () => {
    window.clearTimeout(idleTimer);
    if (activeIndex !== null) idleTimer = window.setTimeout(reset, IDLE_MS);
  };

  const select = (direction) => {
    const nextIndex = activeIndex === null
      ? projects.findIndex((project) => project.slug === "shanzhy-io")
      : Math.max(0, Math.min(projects.length - 1, activeIndex + direction));
    if (nextIndex === activeIndex) return;

    activeIndex = nextIndex;
    lockedUntil = performance.now() + ANIMATION_MS;
    onChange(projects[activeIndex].slug);
    recordActivity();
  };

  const advance = (delta) => {
    if (performance.now() < lockedUntil) {
      distance = 0;
      return;
    }
    distance = Math.sign(distance) === Math.sign(delta) ? distance + delta : delta;
    if (Math.abs(distance) < SWIPE_THRESHOLD) return;
    const direction = Math.sign(distance);
    distance = 0;
    select(direction);
  };

  const handleTouchStart = (event) => {
    if (event.touches.length !== 1) {
      touch = null;
      return;
    }
    const point = event.touches[0];
    touch = {
      id: point.identifier,
      x: point.clientX,
      y: point.clientY,
      lastX: point.clientX,
      lastY: point.clientY,
      moving: false,
    };
    distance = 0;
    recordActivity();
  };

  const handleTouchMove = (event) => {
    if (!touch || event.touches.length !== 1) return;
    const point = Array.from(event.touches).find((point) => point.identifier === touch.id);
    if (!point) return;
    const deltaX = touch.lastX - point.clientX;
    const deltaY = touch.lastY - point.clientY;
    touch.lastX = point.clientX;
    touch.lastY = point.clientY;
    recordActivity();
    if (!touch.moving) {
      const x = Math.abs(point.clientX - touch.x);
      const y = Math.abs(point.clientY - touch.y);
      if (Math.max(x, y) < 8) return;
      touch.moving = true;
    }
    const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
    if (event.cancelable) event.preventDefault();
    if (delta !== 0) advance(delta);
  };

  const handleTouchEnd = () => {
    touch = null;
    distance = 0;
    recordActivity();
  };

  const handleWheel = (event) => {
    if (event.ctrlKey || (event.deltaX === 0 && event.deltaY === 0)) return;
    if (event.cancelable) event.preventDefault();
    const now = performance.now();
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const pageSize = horizontal ? page.clientWidth : page.clientHeight;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageSize : 1;
    const delta = (horizontal ? event.deltaX : event.deltaY) * unit;
    const magnitude = Math.abs(delta);
    const previousMagnitude = Math.abs(lastWheelDelta);
    if (
      lastWheelAt === null || now - lastWheelAt > WHEEL_GESTURE_IDLE_MS ||
      Math.sign(delta) !== Math.sign(lastWheelDelta) || event.deltaMode !== 0
    ) {
      wheelDistance = 0;
      fallingSamples = 0;
      risingSamples = 0;
      wheelInertia = false;
    } else if (magnitude < previousMagnitude - 0.5) {
      fallingSamples += 1;
      risingSamples = 0;
      if (fallingSamples >= 2) wheelInertia = true;
    } else if (magnitude > previousMagnitude + 0.5) {
      risingSamples += 1;
      fallingSamples = 0;
      if (risingSamples >= 2) wheelInertia = false;
    } else {
      risingSamples = 0;
    }
    lastWheelAt = now;
    lastWheelDelta = delta;
    if (wheelInertia) {
      wheelDistance = 0;
      return;
    }
    recordActivity();
    if (now < lockedUntil) {
      wheelDistance = 0;
      return;
    }
    wheelDistance = Math.sign(wheelDistance) === Math.sign(delta) ? wheelDistance + delta : delta;
    if (Math.abs(wheelDistance) < WHEEL_THRESHOLD) return;
    const direction = Math.sign(wheelDistance);
    wheelDistance = 0;
    select(direction);
  };

  const handlePointerMove = (event) => {
    if (
      event.pointerType === "mouse" &&
      (event.movementX !== 0 || event.movementY !== 0) &&
      (activeIndex !== null || distance !== 0 || wheelDistance !== 0)
    ) reset();
  };

  page.addEventListener("pointermove", handlePointerMove);
  page.addEventListener("touchstart", handleTouchStart, { passive: true });
  page.addEventListener("touchmove", handleTouchMove, { passive: false });
  page.addEventListener("touchend", handleTouchEnd, { passive: true });
  page.addEventListener("touchcancel", handleTouchEnd, { passive: true });
  page.addEventListener("wheel", handleWheel, { passive: false });

  return () => {
    window.clearTimeout(idleTimer);
    page.removeEventListener("pointermove", handlePointerMove);
    page.removeEventListener("touchstart", handleTouchStart);
    page.removeEventListener("touchmove", handleTouchMove);
    page.removeEventListener("touchend", handleTouchEnd);
    page.removeEventListener("touchcancel", handleTouchEnd);
    page.removeEventListener("wheel", handleWheel);
  };
}
