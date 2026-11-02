import { getImageProps } from "next/image.js";
import { motion, videoPlaybackRate } from "../styles/animations.mjs";
import {
  findProjectByPath,
  projects,
  projectThumbnailProps,
  PROJECT_IMAGE_QUALITY,
  PROJECT_DETAIL_IMAGE_SIZES,
} from "../app/(site)/works/projects.js";

const warmedImages = new Map();
export const GENESIS_VIDEO = "/videos/genesis.mp4";
let genesisVideo;

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
  if (!genesisVideo) {
    genesisVideo = document.createElement("video");
    genesisVideo.muted = true;
    genesisVideo.defaultMuted = true;
    genesisVideo.loop = true;
    genesisVideo.playsInline = true;
    genesisVideo.defaultPlaybackRate = videoPlaybackRate;
    genesisVideo.playbackRate = videoPlaybackRate;
    genesisVideo.preload = "auto";
    genesisVideo.poster = "/images/genesis.jpg";
    genesisVideo.setAttribute("aria-label", "Genesis ecosystem simulation demo");
  }
  if (genesisVideo.getAttribute("src") !== GENESIS_VIDEO) {
    genesisVideo.src = GENESIS_VIDEO;
    genesisVideo.load();
  } else if (genesisVideo.error) {
    genesisVideo.load();
  }
  return genesisVideo;
}

export function waitForVideoBuffer(video, {
  seconds = motion.videoBuffer / 1000,
  timeout = motion.videoBufferTimeout,
  signal,
} = {}) {
  return new Promise((resolve) => {
    let timer;
    const events = ["loadeddata", "progress", "canplay", "durationchange", "suspend"];
    const finish = (status) => {
      window.clearTimeout(timer);
      events.forEach((event) => video.removeEventListener(event, check));
      video.removeEventListener("error", fail);
      signal?.removeEventListener("abort", abort);
      resolve(status);
    };
    const fail = () => finish("error");
    const abort = () => finish("aborted");
    const check = () => {
      if (video.error) return fail();
      if (video.readyState < 2) return;
      const start = video.currentTime;
      const remaining = Number.isFinite(video.duration) ? video.duration - start : seconds;
      const required = Math.min(seconds, remaining);
      for (let index = 0; index < video.buffered.length; index++) {
        if (
          video.buffered.start(index) <= start + motion.videoBufferTolerance / 1000 &&
          video.buffered.end(index) - start >= required
        ) {
          finish("ready");
          return;
        }
      }
    };

    if (signal?.aborted) return abort();
    events.forEach((event) => video.addEventListener(event, check));
    video.addEventListener("error", fail);
    signal?.addEventListener("abort", abort, { once: true });
    timer = window.setTimeout(() => finish("timeout"), timeout);
    check();
  });
}

export function preloadVisibleGenesisVideo(target) {
  const connection = navigator.connection;
  if (
    !target || !window.IntersectionObserver || connection?.saveData ||
    /(^|-)[23]g$/.test(connection?.effectiveType || "")
  ) return;

  let visible = false;
  let disposed = false;
  let warmed = false;
  let idle;
  let timer;

  const prepare = () => {
    idle = timer = undefined;
    if (disposed || !visible || document.hidden) return;
    preloadGenesisVideo();
    warmed = true;
    observer.disconnect();
    document.removeEventListener("visibilitychange", schedule);
  };
  const schedule = () => {
    if (
      disposed || warmed || !visible || document.hidden ||
      idle !== undefined || timer !== undefined
    ) return;
    if (window.requestIdleCallback) {
      idle = window.requestIdleCallback(prepare, { timeout: motion.preloadIdleTimeout });
    } else {
      timer = window.setTimeout(prepare, motion.preloadInterval);
    }
  };
  const observer = new window.IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    schedule();
  });
  observer.observe(target);
  document.addEventListener("visibilitychange", schedule);

  return () => {
    disposed = true;
    observer.disconnect();
    if (idle !== undefined) window.cancelIdleCallback(idle);
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", schedule);
  };
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
      idle = window.requestIdleCallback(advance, { timeout: motion.preloadIdleTimeout });
    } else {
      timer = window.setTimeout(advance, motion.preloadInterval);
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
  if (video && pathname === "/works/genesis") preloadGenesisVideo();
  return Promise.allSettled(routeImages(pathname).map((props) => prepareImage(props, "low")));
}
