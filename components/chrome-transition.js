import { findProjectByPath } from "../app/(site)/works/projects.js";
import { NARROW_VIEWPORT_QUERY } from "../styles/viewport.mjs";

export function hasSharedHeader(from, to) {
  const source = from.split(/[?#]/)[0];
  const destination = to.split(/[?#]/)[0];

  return source !== "/" && destination !== "/" && (
    window.matchMedia(NARROW_VIEWPORT_QUERY).matches ||
    (!findProjectByPath(source) && !findProjectByPath(destination))
  );
}
