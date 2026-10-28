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
import { preloadGenesisVideo, preloadRouteImages, preloadSiteAssets, waitForVideoBuffer } from "./preload-assets";
import styles from "./entry-loading.module.css";

const EntryContext = createContext({ pending: false, ready: () => {} });
const LEAVING_TIMEOUT_MS = 600;

export function useEntryLoading() {
  return useContext(EntryContext);
}

export default function EntryLoading({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [entryPath] = useState(pathname);
  const [completed, setCompleted] = useState([]);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("loading");
  const stageRef = useRef(null);
  const displayedRef = useRef(0);
  const tasks = useMemo(() => [
    "page", "fonts", "images",
    ...(entryPath === "/" ? ["scene"] : []),
    ...(entryPath === "/works/genesis" ? ["video"] : []),
  ], [entryPath]);
  const target = Math.round(
    (tasks.filter((task) => completed.includes(task)).length / tasks.length) * 100,
  );
  const pending = phase !== "done";

  const ready = useCallback((task) => {
    setCompleted((current) => current.includes(task) ? current : [...current, task]);
  }, []);
  const context = useMemo(() => ({ pending, ready }), [pending, ready]);

  useEffect(() => {
    let disposed = false;
    preloadRouteImages(entryPath).then(() => { if (!disposed) ready("images"); });
    return () => {
      disposed = true;
    };
  }, [entryPath, ready]);

  useEffect(() => {
    if (entryPath !== "/works/genesis") return;
    const controller = new AbortController();
    waitForVideoBuffer(preloadGenesisVideo(), { signal: controller.signal }).then(() => {
      if (!controller.signal.aborted) ready("video");
    });
    return () => controller.abort();
  }, [entryPath, ready]);

  useEffect(() => {
    if (pending) return;
    return preloadSiteAssets(router, pathname);
  }, [pending, pathname, router]);

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
    const frame = requestAnimationFrame(() => {
      setPhase("leaving");
    });
    return () => cancelAnimationFrame(frame);
  }, [progress]);

  useEffect(() => {
    if (phase !== "leaving") return;
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
