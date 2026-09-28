"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { GENESIS_VIDEO, preloadGenesisVideo, preloadSiteImages, preloadSiteRoutes } from "./preload-assets";
import styles from "./entry-loading.module.css";

const EntryContext = createContext({ pending: false, ready: () => {}, videoSource: null });
const LEAVING_TIMEOUT_MS = 600;

export function useEntryLoading() {
  return useContext(EntryContext);
}

/** Prepare the entire site once; client-side navigation keeps it settled. */
export default function EntryLoading({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [entryPath] = useState(pathname);
  const [videoSource, setVideoSource] = useState(null);
  const [completed, setCompleted] = useState([]);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("loading");
  const stageRef = useRef(null);
  const displayedRef = useRef(0);
  const tasks = useMemo(() => [
    "page", "fonts", "images", "routes", "video",
    ...(entryPath === "/" ? ["scene"] : []),
    ...(entryPath === "/works/genesis" ? ["video-frame"] : []),
  ], [entryPath]);
  const target = Math.round(
    (tasks.filter((task) => completed.includes(task)).length / tasks.length) * 100,
  );
  const pending = phase !== "done";

  const ready = useCallback((task) => {
    setCompleted((current) => current.includes(task) ? current : [...current, task]);
  }, []);
  const context = useMemo(() => ({ pending, ready, videoSource }), [pending, ready, videoSource]);

  useEffect(() => {
    let disposed = false;
    const routes = preloadSiteRoutes(router);
    routes.ready.then(() => { if (!disposed) ready("routes"); });
    preloadSiteImages().then(() => { if (!disposed) ready("images"); });
    preloadGenesisVideo().then(
      (source) => {
        if (disposed) return;
        setVideoSource(source);
        ready("video");
      },
      () => {
        if (disposed) return;
        // Leave normal streaming and the poster available if downloading fails.
        setVideoSource(GENESIS_VIDEO);
        ready("video");
      },
    );
    return () => {
      disposed = true;
      routes.dispose();
    };
  }, [entryPath, ready, router]);

  useEffect(() => {
    let disposed = false;
    let observer;
    let frame;
    const settle = (task) => {
      if (!disposed) ready(task);
    };

    document.fonts.ready.then(() => settle("fonts"), () => settle("fonts"));

    const preparePage = () => {
      const page = stageRef.current?.querySelector("main");
      if (!page) return;
      observer?.disconnect();

      frame = requestAnimationFrame(() => settle("page"));
    };

    // A directly opened route may still be arriving in the server stream.
    observer = new MutationObserver(preparePage);
    observer.observe(stageRef.current, { childList: true, subtree: true });
    preparePage();

    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ready]);

  useEffect(() => {
    const from = displayedRef.current;
    const start = performance.now();
    let frame;
    const update = (now) => {
      // A callback queued during a frame can receive that frame's earlier
      // timestamp; clamp it so the displayed percentage never moves backward.
      const fraction = Math.max(0, Math.min((now - start) / 180, 1));
      const value = Math.floor(from + (target - from) * fraction);
      displayedRef.current = value;
      setProgress(value);
      if (fraction < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  useEffect(() => {
    if (progress !== 100) return;
    // Paint 100% before fading the number and releasing the page animations.
    const frame = requestAnimationFrame(() => {
      setPhase("leaving");
    });
    return () => cancelAnimationFrame(frame);
  }, [progress]);

  useEffect(() => {
    if (phase !== "leaving") return;
    // animationend can be lost when styles change.
    // Never leave an invisible overlay intercepting input indefinitely.
    const timer = window.setTimeout(() => setPhase("done"), LEAVING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <EntryContext.Provider value={context}>
      <div
        ref={stageRef}
        className={styles.stage}
        data-entry-pending={pending}
        inert={pending}
        aria-busy={pending}
      >
        {children}
      </div>
      {pending && (
        <div
          className={styles.overlay}
          data-entry-overlay
          data-theme={entryPath === "/" ? "dark" : "light"}
          data-phase={phase}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && phase === "leaving") {
              setPhase("done");
            }
          }}
        >
          <span
            className={styles.progress}
            role="progressbar"
            aria-label="Preparing website"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            {progress}%
          </span>
        </div>
      )}
    </EntryContext.Provider>
  );
}
