let activeTransition = null;

function snapshot(element) {
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
    target.removeAttribute("id");
    if (original instanceof HTMLImageElement) {
      // Keep the already displayed bitmap, including Next's selected variant.
      // A new source or async decode can leave the clone blank for a frame.
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
    top: `${bounds.top}px`,
    left: `${bounds.left}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    margin: "0",
    transform: "none",
    pointerEvents: "none",
    zIndex: "100",
  });
}

export function startProjectTransition(page, frame) {
  activeTransition?.dispose();
  const startedAt = performance.now();
  const bounds = frame.getBoundingClientRect();
  const departing = snapshot(page);
  const preview = snapshot(frame);
  const frames = Array.from(page.querySelectorAll("img"));
  departing.querySelectorAll("img")[frames.indexOf(frame.querySelector("img"))]
    .parentElement.style.opacity = "0";
  place(departing, page.getBoundingClientRect());
  place(preview, bounds);
  const image = preview.querySelector("img");
  Object.assign(image.style, {
    width: "100%",
    height: "100%",
  });
  document.body.append(departing, preview);
  page.style.visibility = "hidden";

  const fade = departing.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 300,
    easing: "ease-out",
    fill: "both",
  });
  fade.currentTime = performance.now() - startedAt;
  fade.onfinish = () => departing.remove();

  const transition = {
    startedAt,
    preview,
    bounds,
    mediaReady: false,
    markMediaReady() {
      transition.mediaReady = true;
      transition.onMediaReady?.();
    },
    dispose() {
      fade.cancel();
      departing.remove();
      preview.remove();
      page.style.visibility = "";
      if (activeTransition === transition) activeTransition = null;
    },
  };
  activeTransition = transition;
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
  const geometry = (rect) => ({
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  const timing = {
    duration: 700,
    delay: 200,
    easing: getComputedStyle(document.documentElement).getPropertyValue("--ease-content").trim(),
    fill: "both",
  };
  const movement = preview.animate([geometry(bounds), geometry(destination)], timing);
  const image = preview.querySelector("img");
  const color = image.animate([
    { filter: image.style.filter },
    { filter: "grayscale(0)" },
  ], timing);
  const elapsed = performance.now() - startedAt;
  movement.currentTime = elapsed;
  color.currentTime = elapsed;

  let arrived = false;
  let disposed = false;
  let handoff;
  const revealMedia = () => {
    if (disposed || !arrived || !transition.mediaReady || handoff) return;
    // Keep the same bitmap until React has committed a presented video frame
    // (or its playback fallback). Fade it out over the live media so mobile
    // compositing and the thumbnail's lower resolution cannot cause a flash.
    handoff = preview.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 120,
      easing: "ease-out",
      fill: "both",
    });
    handoff.onfinish = () => transition.dispose();
  };
  transition.onMediaReady = revealMedia;
  movement.onfinish = () => {
    arrived = true;
    // Let the video present underneath the still-opaque cover. In particular,
    // don't depend on mobile browsers presenting a visibility:hidden video.
    target.style.visibility = visibility;
    revealMedia();
  };

  return () => {
    disposed = true;
    transition.onMediaReady = null;
    target.style.visibility = visibility;
    movement.cancel();
    color.cancel();
    handoff?.cancel();
    transition.cleanupFrame = requestAnimationFrame(() => transition.dispose());
  };
}
