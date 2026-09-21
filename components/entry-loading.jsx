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
import { usePathname } from "next/navigation";
import styles from "./entry-loading.module.css";

const EntryContext = createContext({ pending: false, ready: () => {} });
const LEAVING_TIMEOUT_MS = 600;

export function useEntryLoading() {
  return useContext(EntryContext);
}

/** One preparation screen per document; client-side navigation keeps it settled. */
export default function EntryLoading({ children }) {
  const pathname = usePathname();
  const [entryPath] = useState(pathname);
  const [completed, setCompleted] = useState([]);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("loading");
  const stageRef = useRef(null);
  const displayedRef = useRef(0);
  const tasks = useMemo(() => [
    "page", "fonts", "images",
    ...(entryPath === "/" ? ["scene"] : []),
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

      // Only the initial viewport should hold up entry. Offscreen media can
      // finish loading while the visitor is already using the page.
      const visible = (element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 &&
          bounds.bottom > 0 && bounds.top < window.innerHeight &&
          bounds.right > 0 && bounds.left < window.innerWidth;
      };
      const images = [...page.querySelectorAll("img")].filter(visible);
      // Video posters are not img elements, but belong to the visible page.
      page.querySelectorAll("video[poster]").forEach((video) => {
        if (!visible(video)) return;
        const poster = new Image();
        poster.src = video.poster;
        images.push(poster);
      });
      Promise.allSettled(images.map((image) => image.decode()))
        .then(() => settle("images"));
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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame;
    const update = (now) => {
      // A callback queued during a frame can receive that frame's earlier
      // timestamp; clamp it so the displayed percentage never moves backward.
      const fraction = reducedMotion ? 1 : Math.max(0, Math.min((now - start) / 180, 1));
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
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finishWithoutMotion = () => {
      if (motion.matches) setPhase("done");
    };
    const frame = requestAnimationFrame(() => {
      setPhase(motion.matches ? "done" : "leaving");
    });
    motion.addEventListener("change", finishWithoutMotion);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", finishWithoutMotion);
    };
  }, [progress]);

  useEffect(() => {
    if (phase !== "leaving") return;
    // animationend can be lost when styles or motion preferences change.
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
