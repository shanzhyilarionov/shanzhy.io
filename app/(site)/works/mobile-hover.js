import { projects } from "./projects.js";

const SWIPE_THRESHOLD = 36;
const ANIMATION_MS = 500;
const IDLE_MS = 5000;

export function bindMobileWorksHover(page, onChange) {
  const media = window.matchMedia("(max-width: 768px)");
  let activeIndex = null;
  let distance = 0;
  let lockedUntil = 0;
  let idleTimer;
  let touch = null;
  let lastWheelAt = 0;

  const reset = () => {
    window.clearTimeout(idleTimer);
    activeIndex = null;
    distance = 0;
    lockedUntil = 0;
    touch = null;
    onChange(null);
  };

  const recordActivity = () => {
    window.clearTimeout(idleTimer);
    if (activeIndex !== null) idleTimer = window.setTimeout(reset, IDLE_MS);
  };

  const advance = (delta) => {
    recordActivity();
    if (performance.now() < lockedUntil) {
      distance = 0;
      return;
    }
    distance = Math.sign(distance) === Math.sign(delta) ? distance + delta : delta;
    if (Math.abs(distance) < SWIPE_THRESHOLD) return;

    const nextIndex = activeIndex === null
      ? projects.findIndex((project) => project.slug === "shanzhy-io")
      : Math.max(0, Math.min(projects.length - 1, activeIndex + Math.sign(distance)));
    distance = 0;
    if (nextIndex === activeIndex) return;

    activeIndex = nextIndex;
    lockedUntil = performance.now() + ANIMATION_MS;
    onChange(projects[activeIndex].slug);
    recordActivity();
  };

  const handleTouchStart = (event) => {
    if (!media.matches || event.touches.length !== 1) {
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
      axis: null,
    };
    distance = 0;
    recordActivity();
  };

  const handleTouchMove = (event) => {
    if (!media.matches || !touch || event.touches.length !== 1) return;
    const point = Array.from(event.touches).find((point) => point.identifier === touch.id);
    if (!point) return;
    const deltaX = touch.lastX - point.clientX;
    const deltaY = touch.lastY - point.clientY;
    touch.lastX = point.clientX;
    touch.lastY = point.clientY;
    recordActivity();
    if (!touch.axis) {
      const x = Math.abs(point.clientX - touch.x);
      const y = Math.abs(point.clientY - touch.y);
      if (Math.max(x, y) < 8) return;
      touch.axis = y > x ? "vertical" : "horizontal";
    }
    const delta = touch.axis === "horizontal" ? deltaX : deltaY;
    if (event.cancelable) event.preventDefault();
    if (delta !== 0) advance(delta);
  };

  const handleTouchEnd = () => {
    touch = null;
    distance = 0;
    recordActivity();
  };

  const handleWheel = (event) => {
    if (!media.matches || event.ctrlKey || (event.deltaX === 0 && event.deltaY === 0)) return;
    if (event.cancelable) event.preventDefault();
    const now = performance.now();
    if (now - lastWheelAt > 180) distance = 0;
    lastWheelAt = now;
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const pageSize = horizontal ? page.clientWidth : page.clientHeight;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageSize : 1;
    advance((horizontal ? event.deltaX : event.deltaY) * unit);
  };

  media.addEventListener("change", reset);
  page.addEventListener("touchstart", handleTouchStart, { passive: true });
  page.addEventListener("touchmove", handleTouchMove, { passive: false });
  page.addEventListener("touchend", handleTouchEnd, { passive: true });
  page.addEventListener("touchcancel", handleTouchEnd, { passive: true });
  page.addEventListener("wheel", handleWheel, { passive: false });

  return () => {
    window.clearTimeout(idleTimer);
    media.removeEventListener("change", reset);
    page.removeEventListener("touchstart", handleTouchStart);
    page.removeEventListener("touchmove", handleTouchMove);
    page.removeEventListener("touchend", handleTouchEnd);
    page.removeEventListener("touchcancel", handleTouchEnd);
    page.removeEventListener("wheel", handleWheel);
  };
}
