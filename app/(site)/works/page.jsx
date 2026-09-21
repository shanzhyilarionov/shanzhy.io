"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHoverEnabled } from "../../../components/hover-boundary";
import { usePageExiting } from "../../../components/page-exit-context";
import { warmRouteAssets } from "../../../components/preload-assets";
import { projects, PROJECT_IMAGE_SIZES } from "./projects";
import styles from "./works.module.css";

const EXIT_STEP_MS = 500;

export default function Works() {
  const router = useRouter();
  const hoverEnabled = useHoverEnabled();
  const [resizing, setResizing] = useState(true);
  const [transition, setTransition] = useState(null);
  const pageExiting = usePageExiting();
  const [wasPageExiting, setWasPageExiting] = useState(false);
  const headingRef = useRef(null);
  const projectsRef = useRef(null);

  // Menu and history departures use the same two legs as a project click.
  // The shell owns that navigation, so these transitions carry no href.
  if (wasPageExiting !== pageExiting) {
    setWasPageExiting(pageExiting);
    setTransition(pageExiting ? { phase: "settling", href: null } : null);
  }

  useLayoutEffect(() => {
    const heading = headingRef.current;
    const row = projectsRef.current;
    const range = document.createRange();
    range.selectNodeContents(heading.firstElementChild);
    let disposed = false;
    let settled = false;

    const measureHeading = () => {
      if (disposed) return;
      // A wrapped heading's box fills the available space. Its text ranges
      // give the actual line widths without changing its font size or wrap.
      const width = Math.max(...Array.from(range.getClientRects(), (rect) => rect.width));
      if (width > 0) {
        row.style.setProperty("--projects-width", `${width}px`);
        // Before this first measurement lands, the row falls back to 100%
        // width and tiles render oversized. Hold the flex-basis transition
        // off until then, so that correction snaps instead of animating.
        if (!settled) {
          settled = true;
          setResizing(false);
        }
      }
    };

    measureHeading();
    const observer = new ResizeObserver(measureHeading);
    observer.observe(heading);
    document.fonts.ready.then(measureHeading);

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!transition || (transition.phase === "exiting" && !transition.href)) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (transition.phase === "settling") {
        setTransition({ ...transition, phase: "exiting" });
      } else {
        router.push(transition.href);
      }
    }, EXIT_STEP_MS);

    return () => window.clearTimeout(timer);
  }, [transition, router]);

  useEffect(() => {
    let resizeTimer;

    const handleResize = () => {
      setResizing(true);
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => setResizing(false), 100);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.clearTimeout(resizeTimer);
    };
  }, []);

  const openProject = (event, slug) => {
    const href = `/works/${slug}`;
    router.prefetch(href);
    warmRouteAssets(href);
    if (
      !transition &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    event.preventDefault();
    setTransition((current) =>
      current ?? { href, phase: "settling" },
    );
  };

  return (
    <main
      className={[
        styles.page,
        transition?.phase === "exiting" ? styles.exiting : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--exit-duration": `${EXIT_STEP_MS}ms` }}
    >
      <section className={styles.content} aria-labelledby="works-heading">
        <h1 ref={headingRef} className={styles.heading} id="works-heading">
          <span className={styles.headingLabel}>Things I’ve built.</span>
        </h1>

        <div
          ref={projectsRef}
          className={[
            styles.projects,
            hoverEnabled && !transition ? styles.hoverEnabled : "",
            transition ? styles.departing : "",
            resizing ? styles.resizing : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {projects.map((project) => (
            <article
              className={styles.project}
              style={{
                "--reveal-duration": project.duration,
                "--image-ratio": project.aspectRatio,
              }}
              key={project.slug}
            >
              <Link
                className={styles.reveal}
                href={`/works/${project.slug}`}
                aria-label={project.title}
                onPointerEnter={() => warmRouteAssets(`/works/${project.slug}`)}
                onFocus={() => warmRouteAssets(`/works/${project.slug}`)}
                onTouchStart={() => warmRouteAssets(`/works/${project.slug}`)}
                onNavigate={(event) => openProject(event, project.slug)}
              >
                <div className={styles.revealContent}>
                  <div className={styles.imageFrame}>
                    <Image
                      className={styles.image}
                      src={project.image}
                      alt={`${project.title} project preview`}
                      fill
                      sizes={PROJECT_IMAGE_SIZES}
                      priority
                    />
                  </div>
                </div>
              </Link>

              <h2 className={styles.title}>{project.title}</h2>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
