import { getImageProps } from "next/image.js";
import {
  findProjectByPath,
  projects,
  projectThumbnailProps,
  PROJECT_IMAGE_QUALITY,
  PROJECT_DETAIL_IMAGE_SIZES,
} from "../app/(site)/works/projects.js";

const warmedImages = new Map();
export const GENESIS_VIDEO = "/videos/genesis.mp4";
let videoDownload;

const siteRoutes = ["/works", "/about", "/contact", "/", ...projects.map(({ slug }) => `/works/${slug}`)];

function routeImages(pathname) {
  if (pathname === "/works") {
    return projects.map((project) => getImageProps({ ...projectThumbnailProps(project), alt: "" }).props);
  }
  if (pathname === "/works/genesis") return [{ src: "/images/genesis.jpg" }];
  const project = findProjectByPath(pathname);
  if (project) {
    return [getImageProps({
      src: project.image, alt: "", width: project.width, height: project.height,
      sizes: PROJECT_DETAIL_IMAGE_SIZES,
      quality: PROJECT_IMAGE_QUALITY,
    }).props];
  }
  return [];
}

function prepareImage(props, priority) {
  const key = JSON.stringify([props.src, props.srcSet, props.sizes]);
  const warmed = warmedImages.get(key);
  if (warmed) {
    if (priority === "high") warmed.image.fetchPriority = priority;
    return warmed.ready;
  }

  const image = new Image();
  image.fetchPriority = priority;
  image.decoding = "async";
  if (props.sizes) image.sizes = props.sizes;
  if (props.srcSet) image.srcset = props.srcSet;
  image.src = props.src;
  const ready = image.decode().catch((error) => {
    warmedImages.delete(key);
    throw error;
  });
  warmedImages.set(key, { image, ready });
  return ready;
}

export function preloadRouteImages(pathname) {
  return Promise.allSettled(routeImages(pathname).map((props) => prepareImage(props, "high")));
}

export function preloadGenesisVideo() {
  if (!videoDownload) {
    videoDownload = fetch(GENESIS_VIDEO, { priority: "low" })
      .then((response) => {
        if (!response.ok) throw new Error(`Video download failed: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (!blob.size) throw new Error("Video download was empty");
        return URL.createObjectURL(blob);
      })
      .catch((error) => {
        videoDownload = undefined;
        throw error;
      });
  }
  return videoDownload;
}

export function preloadSiteAssets(router, pathname) {
  const connection = navigator.connection;
  if (connection?.saveData || /(^|-)[23]g$/.test(connection?.effectiveType || "")) return;

  const queue = siteRoutes.filter((path) => path !== pathname);
  let disposed = false;
  let inFlight = false;
  let idle;
  let timer;

  const schedule = () => {
    if (disposed || inFlight || document.hidden || !queue.length || idle !== undefined || timer !== undefined) return;
    if (window.requestIdleCallback) {
      idle = window.requestIdleCallback(advance, { timeout: 1500 });
    } else {
      timer = window.setTimeout(advance, 200);
    }
  };

  const advance = async () => {
    idle = timer = undefined;
    if (disposed || document.hidden) return;
    inFlight = true;
    const path = queue.shift();
    try {
      router.prefetch(path);
      await warmRouteAssets(path, { video: false });
    } catch {
      return;
    } finally {
      inFlight = false;
      schedule();
    }
  };

  document.addEventListener("visibilitychange", schedule);
  schedule();
  return () => {
    disposed = true;
    if (idle !== undefined) window.cancelIdleCallback(idle);
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", schedule);
  };
}

export function warmRouteAssets(href, { video = true } = {}) {
  const connection = navigator.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return;

  const pathname = href.split(/[?#]/)[0];
  if (video && pathname === "/works/genesis") preloadGenesisVideo().catch(() => {});
  return Promise.allSettled(routeImages(pathname).map((props) => prepareImage(props, "low")));
}
