export const WORKS_HOVER_SETTLE_MS = 500;

export function getWorksExitDelay(row = document.querySelector("[data-works-projects]")) {
  if (!row) return 0;

  const hovered = row.dataset.hoverEnabled === "true" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    row.querySelector("[data-project-preview]:hover");
  const restoring = row.getAnimations({ subtree: true }).some((animation) =>
    animation.playState === "running" &&
    (animation.transitionProperty === "flex-basis" || animation.transitionProperty === "filter"),
  );

  return hovered || restoring ? WORKS_HOVER_SETTLE_MS : 0;
}
