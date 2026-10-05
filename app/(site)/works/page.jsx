"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHoverEnabled } from "../../../components/hover-boundary";
import { usePageExiting, usePageExitSettleMs } from "../../../components/page-exit-context";
import { warmRouteAssets } from "../../../components/preload-assets";
import { projects, PROJECT_IMAGE_SIZES, PROJECT_IMAGE_QUALITY } from "./projects";
import { arriveWorks, getProjectReturn, startProjectTransition } from "./project-transition";
import styles from "./works.module.css";

const EXIT_STEP_MS = 500;

export default function Works() {
  const router = useRouter();
  const hoverEnabled = useHoverEnabled();
  const [resizing, setResizing] = useState(true);
  const [transition, setTransition] = useState(null);
  const [projectReturn] = useState(getProjectReturn);
  const pageExiting = usePageExiting();
  const exitSettleMs = usePageExitSettleMs();
  const [wasPageExiting, setWasPageExiting] = useState(false);
  const headingRef = useRef(null);
  const projectsRef = useRef(null);

  if (wasPageExiting !== pageExiting) {
    setWasPageExiting(pageExiting);
    setTransition(pageExiting ? { phase: exitSettleMs > 0 ? "settling" : "exiting" } : null);
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
      const width = Math.max(...Array.from(range.getClientRects(), (rect) => rect.width));
      if (width > 0) {
        row.style.setProperty("--projects-width", `${width}px`);
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

  useLayoutEffect(() => {
    if (!projectReturn) return;
    const target = projectsRef.current.querySelector(`[data-project-thumbnail="${projectReturn.slug}"]`);
    return arriveWorks(projectReturn, headingRef.current.closest("main"), target);
  }, [projectReturn]);

  useEffect(() => {
    if (transition?.phase !== "settling") return;

    const timer = window.setTimeout(() => {
      setTransition({ phase: "exiting" });
    }, exitSettleMs);

    return () => window.clearTimeout(timer);
  }, [transition, exitSettleMs]);

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

  const openProject = (event, project) => {
    const href = `/works/${project.slug}`;
    router.prefetch(href);
    warmRouteAssets(href);

    event.preventDefault();
    if (transition) return;
    const page = headingRef.current.closest("main");
    const image = projectsRef.current.querySelector(
      `a[href="${href}"] .${styles.imageFrame}`,
    );
    startProjectTransition(page, image);
    setTransition({ phase: "project" });
    router.push(href);
  };

  return (
    <main
      className={[
        styles.page,
        projectReturn ? styles.returning : "",
        transition?.phase === "exiting" ? styles.exiting : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--exit-duration": `${EXIT_STEP_MS}ms` }}
    >
      <section className={styles.content} aria-labelledby="works-heading">
        <h1 ref={headingRef} className={styles.heading} id="works-heading" data-works-heading>
          <span className={styles.headingLabel}>Things I’ve built.</span>
        </h1>

        <div
          ref={projectsRef}
          data-works-projects
          data-hover-enabled={hoverEnabled && !transition}
          className={[
            styles.projects,
            hoverEnabled && !transition ? styles.hoverEnabled : "",
            transition ? styles.departing : "",
            resizing ? styles.resizing : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {projects.map((project) => {
            const clickable = project.slug === "genesis" || project.slug === "shanzhy-io";
            const Preview = clickable ? Link : "div";
            const linkProps = clickable ? {
              href: `/works/${project.slug}`,
              "aria-label": project.title,
              onPointerEnter: () => warmRouteAssets(`/works/${project.slug}`),
              onFocus: () => warmRouteAssets(`/works/${project.slug}`),
              onTouchStart: () => warmRouteAssets(`/works/${project.slug}`),
              onNavigate: (event) => openProject(event, project),
            } : {};

            return (
              <article
                className={styles.project}
                data-project-preview
                style={{
                  "--reveal-duration": project.duration,
                  "--image-ratio": project.aspectRatio,
                }}
                key={project.slug}
              >
                <Preview
                  {...linkProps}
                  className={styles.reveal}
                >
                  <div className={styles.revealContent}>
                    <div
                      className={styles.imageFrame}
                      data-project-thumbnail={project.slug}
                      data-project-crop={project.crop ? "true" : undefined}
                    >
                      <div
                        className={project.crop ? styles.screenCrop : styles.imageContent}
                        style={project.crop ? { aspectRatio: project.aspectRatio } : undefined}
                      >
                        <Image
                          className={styles.image}
                          src={project.image}
                          alt={`${project.title} project preview`}
                          fill={!project.crop}
                          width={project.crop ? project.width : undefined}
                          height={project.crop ? project.height : undefined}
                          sizes={PROJECT_IMAGE_SIZES}
                          quality={PROJECT_IMAGE_QUALITY}
                          priority
                          style={project.crop ? {
                            position: "absolute",
                            width: `${project.width / project.crop.width * 100}%`,
                            height: `${project.height / project.crop.height * 100}%`,
                            left: `${-project.crop.x / project.crop.width * 100}%`,
                            top: `${-project.crop.y / project.crop.height * 100}%`,
                            right: "auto",
                            bottom: "auto",
                            maxWidth: "none",
                            objectFit: "fill",
                          } : undefined}
                        />
                      </div>
                    </div>
                  </div>
                </Preview>

                <h2 className={styles.title}>{project.title}</h2>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
