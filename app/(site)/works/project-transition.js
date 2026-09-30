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

export function startProjectTransition(source, page, frame) {
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
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  image.src = source;
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
  const geometry = (rect) => ({
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  const movement = preview.animate([geometry(bounds), geometry(destination)], {
    duration: 700,
    delay: 200,
    easing: getComputedStyle(document.documentElement).getPropertyValue("--ease-content").trim(),
    fill: "both",
  });
  movement.currentTime = performance.now() - startedAt;
  movement.onfinish = () => transition.dispose();

  return () => {
    movement.cancel();
    transition.cleanupFrame = requestAnimationFrame(() => transition.dispose());
  };
}
