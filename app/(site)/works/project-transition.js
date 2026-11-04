import { findProjectByPath } from "./projects.js";
import { hasSharedHeader } from "../../../components/chrome-transition.js";
import { easing, motion } from "../../../styles/animations.mjs";

let activeTransition = null;
let activeReturn = null;

function snapshot(element, preserveAnimations = false) {
  const copy = element.cloneNode(true);
  const originals = [element, ...element.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];

  originals.forEach((original, index) => {
    const computed = getComputedStyle(original);
    const target = copies[index];
    for (const property of computed) {
      target.style.setProperty(property, computed.getPropertyValue(property));
    }
    target.style.animation = "none";
    target.style.transition = "none";
    if (preserveAnimations) {
      for (const animation of original.getAnimations()) {
        const replay = target.animate(animation.effect.getKeyframes(), animation.effect.getTiming());
        replay.currentTime = animation.currentTime;
      }
    }
    target.removeAttribute("id");
    if (original instanceof HTMLImageElement) {
      target.removeAttribute("srcset");
      target.removeAttribute("sizes");
      target.src = original.currentSrc || original.src;
      target.decoding = "sync";
    }
  });

  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  return copy;
}

function place(element, bounds) {
  Object.assign(element.style, {
    position: "fixed",
    ...geometry(bounds),
    margin: "0",
    transform: "none",
    pointerEvents: "none",
    zIndex: "100",
  });
}

function geometry(bounds, origin = { top: 0, left: 0 }) {
  return {
    top: `${bounds.top - origin.top}px`,
    left: `${bounds.left - origin.left}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  };
}

function placeImage(image, bounds, frameBounds) {
  Object.assign(image.style, geometry(bounds, frameBounds), {
    position: "absolute",
    right: "auto",
    bottom: "auto",
    margin: "0",
    maxWidth: "none",
    maxHeight: "none",
    transform: "none",
    objectFit: "fill",
  });
}

function coverBounds(bounds, aspectRatio) {
  const width = Math.max(bounds.width, bounds.height * aspectRatio);
  const height = width / aspectRatio;
  return {
    top: bounds.top + (bounds.height - height) / 2,
    left: bounds.left + (bounds.width - width) / 2,
    width,
    height,
  };
}

function animateReturnImage(image, from, to, frameBounds, timing) {
  placeImage(image, from, frameBounds);
  image.style.transformOrigin = "0 0";
  image.style.willChange = "transform, opacity";
  return image.animate([
    { transform: "translate3d(0, 0, 0) scale(1)" },
    { transform: `translate3d(${to.left - from.left}px, ${to.top - from.top}px, 0) scale(${to.width / from.width})` },
  ], timing);
}

function releaseArrival(transition, target, visibility, animations) {
  target.style.visibility = visibility;
  animations.forEach((animation) => animation?.cancel());
  if (!transition.disposed) {
    transition.cleanupFrame = requestAnimationFrame(() => transition.dispose());
  }
}

function retainProjectImage(image) {
  const parent = image.parentElement;
  const sibling = image.nextSibling;
  const style = image.getAttribute("style");
  const computed = getComputedStyle(image);
  const properties = Array.from(computed, (property) => [property, computed.getPropertyValue(property)]);
  let restored = false;
  properties.forEach(([property, value]) => image.style.setProperty(property, value));
  image.style.animation = "none";
  image.style.transition = "none";

  return () => {
    if (restored) return;
    restored = true;
    parent.insertBefore(image, sibling?.parentNode === parent ? sibling : null);
    if (style === null) image.removeAttribute("style");
    else image.setAttribute("style", style);
  };
}

export function retainProjectVideo(video) {
  const parent = video.parentElement;
  const sibling = video.nextSibling;
  const style = video.getAttribute("style");
  const controls = video.controls;
  const playing = !video.paused;
  let restored = false;
  video.pause();
  video.controls = false;

  return () => {
    if (restored) return;
    restored = true;
    parent.insertBefore(video, sibling?.parentNode === parent ? sibling : null);
    if (style === null) video.removeAttribute("style");
    else video.setAttribute("style", style);
    video.controls = controls;
    if (!parent.isConnected) {
      video.removeAttribute("src");
      video.load();
    } else if (playing) {
      video.play().catch(() => {});
    }
  };
}

function startProjectTransition(page, frame, chrome) {
  activeReturn?.dispose();
  activeTransition?.dispose();
  const startedAt = performance.now();
  const bounds = frame.getBoundingClientRect();
  const departing = snapshot(page);
  const departingChrome = chrome ? snapshot(chrome) : null;
  const preview = snapshot(frame);
  const frames = Array.from(page.querySelectorAll("img"));
  departing.querySelectorAll("img")[frames.indexOf(frame.querySelector("img"))]
    .parentElement.style.opacity = "0";
  place(departing, page.getBoundingClientRect());
  place(preview, bounds);
  const image = frame.querySelector("img");
  const imageBounds = image.getBoundingClientRect();
  const restoreImage = retainProjectImage(image);
  const cropped = frame.dataset.projectCrop === "true";
  preview.replaceChildren(image);
  if (cropped) {
    placeImage(image, imageBounds, bounds);
  } else {
    Object.assign(image.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
    });
  }
  document.body.append(departing, preview);
  page.style.visibility = "hidden";
  if (departingChrome) {
    document.body.append(departingChrome);
    chrome.style.visibility = "hidden";
  }

  const fadeTiming = {
    duration: motion.projectDeparture,
    easing: easing.enter,
    fill: "both",
  };
  const fade = departing.animate([{ opacity: 1 }, { opacity: 0 }], fadeTiming);
  const chromeFade = departingChrome?.animate([{ opacity: 1 }, { opacity: 0 }], fadeTiming);
  const fadeStart = document.timeline.currentTime - (performance.now() - startedAt);
  fade.startTime = fadeStart;
  if (chromeFade) chromeFade.startTime = fadeStart;
  fade.onfinish = () => {
    departing.remove();
    departingChrome?.remove();
  };

  const transition = {
    startedAt,
    preview,
    bounds,
    cropped,
    disposed: false,
    mediaReady: false,
    markMediaReady() {
      transition.mediaReady = true;
      transition.onMediaReady?.();
    },
    dispose() {
      if (transition.disposed) return;
      transition.disposed = true;
      fade.cancel();
      chromeFade?.cancel();
      departing.remove();
      departingChrome?.remove();
      if (chrome) chrome.style.visibility = "";
      restoreImage();
      preview.remove();
      page.style.visibility = "";
      if (activeTransition === transition) activeTransition = null;
    },
  };
  activeTransition = transition;
}

export function startWorksProjectTransition(from, to) {
  if (from !== "/works") return false;
  const project = findProjectByPath(to.split(/[?#]/)[0]);
  if (!project) return false;
  const frame = document.querySelector(`[data-project-thumbnail="${project.slug}"]`);
  if (!frame) return false;
  startProjectTransition(
    frame.closest("main"),
    frame,
    hasSharedHeader(from, to) ? null : document.querySelector("[data-site-chrome]"),
  );
  return true;
}

export function startProjectReturn(page, frame, slug) {
  activeReturn?.dispose();
  activeTransition?.dispose();
  const startedAt = performance.now();
  const bounds = frame.getBoundingClientRect();
  const departing = snapshot(page, true);
  departing.querySelector("[data-project-media]").style.opacity = "0";
  place(departing, page.getBoundingClientRect());

  const preview = document.createElement("div");
  preview.setAttribute("aria-hidden", "true");
  preview.dataset.projectReturn = slug;
  preview.inert = true;
  place(preview, bounds);
  preview.style.overflow = "hidden";
  const video = frame.querySelector("video");
  const sourceImage = frame.querySelector("img");
  const sourceBounds = (video ?? sourceImage).getBoundingClientRect();
  const mediaAspectRatio = video
    ? (video.videoWidth || video.width) / (video.videoHeight || video.height)
    : (sourceImage.naturalWidth || sourceImage.width) / (sourceImage.naturalHeight || sourceImage.height);
  let bitmap;
  let restoreVideo;
  let restoreImage;
  if (video) {
    if (video.readyState >= 2) {
      bitmap = video;
      restoreVideo = retainProjectVideo(video);
    } else {
      bitmap = document.createElement("img");
      bitmap.src = video.poster;
    }
  } else {
    bitmap = sourceImage;
    restoreImage = retainProjectImage(sourceImage);
  }
  Object.assign(bitmap.style, {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  });
  if (frame.dataset.projectCrop === "true") {
    placeImage(bitmap, coverBounds(sourceBounds, mediaAspectRatio), bounds);
  }
  preview.append(bitmap);
  document.body.append(departing, preview);
  departing.scrollTop = page.scrollTop;
  page.style.visibility = "hidden";
  const exitTimer = window.setTimeout(() => departing.remove(), motion.content - (performance.now() - startedAt));
  const transition = {
    slug,
    startedAt,
    bounds,
    preview,
    disposed: false,
    cropped: frame.dataset.projectCrop === "true",
    mediaAspectRatio,
    dispose() {
      if (transition.disposed) return;
      transition.disposed = true;
      window.clearTimeout(exitTimer);
      departing.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      departing.remove();
      restoreVideo?.();
      restoreImage?.();
      preview.remove();
      page.style.visibility = "";
      if (activeReturn === transition) activeReturn = null;
      transition.onComplete?.();
    },
  };
  activeReturn = transition;
  return transition;
}

export function getProjectReturn() {
  return activeReturn;
}

export function arriveWorks(transition, page, target) {
  cancelAnimationFrame(transition.cleanupFrame);
  const { preview, bounds, startedAt } = transition;
  const destination = target.getBoundingClientRect();
  const targetImage = target.querySelector("img");
  const bitmap = transition.bitmap ?? preview.firstElementChild;
  transition.bitmap = bitmap;
  const mediaAspectRatio = transition.mediaAspectRatio || bounds.width / bounds.height;
  const thumbnailAspectRatio = targetImage.naturalWidth / targetImage.naturalHeight || mediaAspectRatio;
  const imageFrom = transition.imageBounds ?? (transition.cropped
    ? bitmap.getBoundingClientRect()
    : coverBounds(bounds, mediaAspectRatio));
  transition.imageBounds = imageFrom;
  const imageTo = transition.cropped
    ? targetImage.getBoundingClientRect()
    : coverBounds(destination, mediaAspectRatio);
  const timing = {
    duration: motion.projectMedia,
    delay: motion.projectReturnLead,
    easing: easing.content,
    fill: "both",
  };
  const visibility = target.style.visibility;
  target.style.visibility = "hidden";

  const width = Math.max(bounds.width, destination.width);
  const height = Math.max(bounds.height, destination.height);
  const clipFrom = { x: bounds.width - width, y: bounds.height - height };
  const clipTo = { x: destination.width - width, y: destination.height - height };
  Object.assign(preview.style, {
    width: `${width}px`,
    height: `${height}px`,
    filter: "none",
    willChange: "transform",
  });
  const clippingFrame = document.createElement("div");
  Object.assign(clippingFrame.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: `${width}px`,
    height: `${height}px`,
    overflow: "hidden",
    willChange: "transform",
  });
  const movement = preview.animate([
    { transform: "translate3d(0, 0, 0)" },
    { transform: `translate3d(${destination.left - bounds.left}px, ${destination.top - bounds.top}px, 0)` },
  ], timing);
  const clip = clippingFrame.animate([
    { transform: `translate3d(${clipFrom.x}px, ${clipFrom.y}px, 0)` },
    { transform: `translate3d(${clipTo.x}px, ${clipTo.y}px, 0)` },
  ], timing);
  const imageFrameBounds = {
    left: bounds.left + clipFrom.x,
    top: bounds.top + clipFrom.y,
  };
  const relativeDestination = (rect) => ({
    width: rect.width,
    height: rect.height,
    left: rect.left - destination.left + bounds.left - (clipTo.x - clipFrom.x),
    top: rect.top - destination.top + bounds.top - (clipTo.y - clipFrom.y),
  });
  const imageMovement = animateReturnImage(bitmap, imageFrom, relativeDestination(imageTo), imageFrameBounds, timing);
  const thumbnail = snapshot(targetImage);
  Object.assign(thumbnail.style, { filter: "grayscale(1)", visibility: "visible" });
  const thumbnailMovement = animateReturnImage(
    thumbnail,
    transition.cropped ? imageFrom : coverBounds(bounds, thumbnailAspectRatio),
    relativeDestination(transition.cropped ? imageTo : coverBounds(destination, thumbnailAspectRatio)),
    imageFrameBounds,
    timing,
  );
  clippingFrame.append(bitmap, thumbnail);
  preview.append(clippingFrame);
  const poster = thumbnail.animate([{ opacity: 0 }, { opacity: 1 }], timing);
  const fades = Array.from(page.querySelectorAll("[data-works-heading], [data-project-preview]"))
    .filter((element) => !element.contains(target))
    .map((element) => element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: motion.content,
      delay: motion.content,
      easing: easing.enter,
      fill: "both",
    }));
  const animations = [movement, clip, imageMovement, thumbnailMovement, poster, ...fades];
  const elapsed = Math.min(performance.now() - startedAt, timing.delay);
  const startTime = document.timeline.currentTime - elapsed;
  animations.forEach((animation) => { animation.startTime = startTime; });
  movement.onfinish = () => {
    target.style.visibility = visibility;
    transition.dispose();
  };

  return () => {
    releaseArrival(transition, target, visibility, animations);
    thumbnail.remove();
    clippingFrame.remove();
    if (!transition.disposed) {
      preview.append(bitmap);
      placeImage(bitmap, imageFrom, bounds);
    }
  };
}

export function getProjectTransition() {
  return activeTransition;
}

export function arriveProject(transition, target) {
  cancelAnimationFrame(transition.cleanupFrame);
  const { preview, bounds, startedAt } = transition;
  const destination = target.getBoundingClientRect();
  const visibility = target.style.visibility;
  target.style.visibility = "hidden";
  const timing = {
    duration: motion.projectMedia,
    delay: motion.projectEntryLead,
    easing: easing.content,
    fill: "both",
  };
  const movement = preview.animate([geometry(bounds), geometry(destination)], timing);
  const image = preview.querySelector("img");
  const color = image.animate([
    { filter: image.style.filter },
    { filter: "grayscale(0)" },
  ], timing);
  const imageBounds = image.getBoundingClientRect();
  const crop = transition.cropped ? image.animate([
    geometry(imageBounds, bounds),
    geometry(coverBounds(destination, imageBounds.width / imageBounds.height), destination),
  ], timing) : null;
  const elapsed = performance.now() - startedAt;
  movement.currentTime = elapsed;
  color.currentTime = elapsed;
  if (crop) crop.currentTime = elapsed;

  let arrived = false;
  let disposed = false;
  let handoff;
  const revealMedia = () => {
    if (disposed || !arrived || !transition.mediaReady || handoff) return;
    handoff = preview.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: motion.projectHandoff,
      easing: easing.enter,
      fill: "both",
    });
    handoff.onfinish = () => transition.dispose();
  };
  transition.onMediaReady = revealMedia;
  movement.onfinish = () => {
    arrived = true;
    target.style.visibility = visibility;
    revealMedia();
  };

  return () => {
    disposed = true;
    transition.onMediaReady = null;
    releaseArrival(transition, target, visibility, [movement, color, crop, handoff]);
  };
}
