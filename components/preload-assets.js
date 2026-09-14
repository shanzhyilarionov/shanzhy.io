import { getImageProps } from "next/image";
import { projects } from "../app/(site)/works/projects";

const GENESIS_VIDEO = "/videos/genesis.mp4";
let warmed = false;
let videoRequest = null;
let videoBlobUrl = null;

export function getGenesisVideoSource() {
  return videoBlobUrl || GENESIS_VIDEO;
}

export function stopVideoWarmup() {
  // An early visit should stream immediately instead of waiting for the full
  // background download, or competing with it for the same connection.
  videoRequest?.abort();
  videoRequest = null;
}

export function warmSiteAssets(router, entryPath) {
  if (warmed) return;
  warmed = true;
  const connection = navigator.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return;

  const routes = ["/", "/about", "/contact", "/works",
    ...projects.map((project) => `/works/${project.slug}`)];
  routes.filter((path) => path !== entryPath).forEach((path) => router.prefetch(path));

  // Match the exact responsive image variants used by the Works page.
  if (entryPath !== "/works") {
    projects.forEach((project) => {
      const { props } = getImageProps({
        src: project.image, alt: "", fill: true, sizes: "18rem",
      });
      const image = new Image();
      image.fetchPriority = "low";
      image.sizes = props.sizes;
      image.srcset = props.srcSet;
      image.src = props.src;
      image.decode().catch(() => {});
    });
  }

  const poster = new Image();
  poster.fetchPriority = "low";
  poster.src = "/images/genesis-poster.jpg";
  poster.decode().catch(() => {});

  if (entryPath === "/works/genesis" || document.querySelector("video")) return;
  videoRequest = new AbortController();
  const request = videoRequest;
  fetch(GENESIS_VIDEO, { signal: request.signal, priority: "low" })
    .then((response) => {
      if (!response.ok) throw new Error("Video preload failed");
      return response.blob();
    })
    .then((blob) => {
      // Retain one URL for this document so a later video mount can reuse the
      // downloaded bytes without relying on partial-response cache behavior.
      if (!request.signal.aborted) videoBlobUrl = URL.createObjectURL(blob);
    })
    .catch(() => {})
    .finally(() => {
      if (videoRequest === request) videoRequest = null;
    });
}
