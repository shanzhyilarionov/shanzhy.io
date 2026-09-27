import { getImageProps } from "next/image";
import { isBot } from "next/dist/shared/lib/router/utils/is-bot";
import { projects, PROJECT_IMAGE_SIZES } from "../app/(site)/works/projects";

const warmedImages = new Map();
export const GENESIS_VIDEO = "/videos/genesis.mp4";
let videoDownload;

const siteRoutes = ["/", "/about", "/contact", "/works", ...projects.map(({ slug }) => `/works/${slug}`)];

function routeImages(pathname) {
  if (pathname === "/works") {
    return projects.map((project) => getImageProps({
      src: project.image, alt: "", fill: true, sizes: PROJECT_IMAGE_SIZES,
    }).props);
  }
  return pathname === "/works/genesis" ? [{ src: "/images/genesis-poster.jpg" }] : [];
}

function prepareImage(props, priority) {
  if (warmedImages.has(props.src)) return warmedImages.get(props.src).ready;

  const image = new Image();
  image.fetchPriority = priority;
  image.decoding = "async";
  if (props.sizes) image.sizes = props.sizes;
  if (props.srcSet) image.srcset = props.srcSet;
  image.src = props.src;
  const ready = image.decode().catch((error) => {
    warmedImages.delete(props.src);
    throw error;
  });
  // Keep the decoded images alive for later routes, including their srcsets.
  warmedImages.set(props.src, { image, ready });
  return ready;
}

export function preloadSiteImages() {
  return Promise.allSettled(siteRoutes.flatMap(routeImages).map((props) => prepareImage(props, "high")));
}

/** Download the entire clip once, and retain its object URL for this document. */
export function preloadGenesisVideo() {
  if (!videoDownload) {
    videoDownload = fetch(GENESIS_VIDEO)
      .then((response) => {
        if (!response.ok) throw new Error(`Video download failed: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (!blob.size) throw new Error("Video download was empty");
        // The browser releases this document's URLs on unload. Keeping this
        // one alive lets every Genesis visit reuse the complete local video.
        return URL.createObjectURL(blob);
      })
      .catch((error) => {
        videoDownload = undefined;
        throw error;
      });
  }
  return videoDownload;
}

/** Fetch route data and load page modules without mounting any hidden pages. */
export function preloadSiteRoutes(router) {
  // Include the entry route: its initial HTML does not populate every entry
  // in Next's navigation cache needed when returning through a link.
  const pending = new Set(siteRoutes);
  let observer;
  let finish;
  const routeData = new Promise((resolve) => { finish = resolve; });
  const settle = () => {
    observer?.disconnect();
    finish();
  };

  // router.prefetch returns void. Resource timing lets the initial loader
  // wait for the route responses instead of treating scheduling as completion.
  const checkResponses = (entries) => {
    for (const entry of entries) {
      if (entry.initiatorType !== "fetch") continue;
      const url = new URL(entry.name);
      if (url.origin === location.origin) pending.delete(url.pathname);
    }
    if (!pending.size) settle();
  };
  if (
    process.env.NODE_ENV === "production" && !isBot(navigator.userAgent) &&
    typeof PerformanceObserver !== "undefined" &&
    PerformanceObserver.supportedEntryTypes?.includes("resource")
  ) {
    observer = new PerformanceObserver((list) => checkResponses(list.getEntries()));
    observer.observe({ type: "resource", buffered: true });
    checkResponses(performance.getEntriesByType("resource"));
  } else {
    // Next disables prefetching in development and for crawlers. Without
    // resource timing, still prepare modules and request the routes normally.
    settle();
  }
  for (const path of pending) router.prefetch(path, { kind: "full" });

  const ready = Promise.allSettled([
    routeData,
    import("../app/page"),
    import("./tesseract"),
    import("../app/(site)/about/page"),
    import("../app/(site)/contact/page"),
    import("../app/(site)/works/page"),
    import("../app/(site)/works/[slug]/genesis"),
  ]);
  return { ready, dispose: settle };
}

/** Prepare a destination's visible images when a link is focused or chosen. */
export function warmRouteAssets(href) {
  const connection = navigator.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return;

  const pathname = href.split(/[?#]/)[0];
  for (const props of routeImages(pathname)) {
    prepareImage(props, "low").catch(() => {});
  }
}
