import { findProjectByPath } from "../app/(site)/works/projects";

export function hasSharedHeader(from, to) {
  const source = from.split(/[?#]/)[0];
  const destination = to.split(/[?#]/)[0];

  return source !== "/" && destination !== "/" && (
    window.matchMedia("(max-width: 768px)").matches ||
    (!findProjectByPath(source) && !findProjectByPath(destination))
  );
}
