"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHoverEnabled } from "../../../components/hover-boundary";
import { usePageExiting, usePageExitSettleMs } from "../../../components/shell-context";
import { warmRouteAssets } from "../../../components/preload-assets";
import { projects, projectThumbnailProps } from "./projects";
import ProjectTitleText from "./project-title";
import { arriveWorks, getProjectReturn } from "./project-transition";
import { bindMobileWorksHover } from "./mobile-hover";
import styles from "./works.module.css";

const EXIT_STEP_MS = 500;

function ProjectTitle({ slug, title, lines, aspectRatio, active }) {
  return (
    <span className={styles.headingMask} style={{ "--image-ratio": aspectRatio }} aria-hidden="true">
      <span className={styles.headingLabel} data-project-title={slug} data-active={active}>
        <ProjectTitleText title={title} lines={lines} />
      </span>
    </span>
  );
}

export default function Works() {
  const hoverEnabled = useHoverEnabled();
  const [resizing, setResizing] = useState(false);
  const [transition, setTransition] = useState(null);
  const [hoveredProject, setHoveredProject] = useState(null);
  const [mobileHoveredProject, setMobileHoveredProject] = useState(null);
  const [projectReturn] = useState(getProjectReturn);
  const pageExiting = usePageExiting();
  const exitSettleMs = usePageExitSettleMs();
  const [wasPageExiting, setWasPageExiting] = useState(false);
  const headingRef = useRef(null);
  const projectsRef = useRef(null);
  const pageRef = useRef(null);
  const activeProject = !transition ? mobileHoveredProject ?? (hoverEnabled ? hoveredProject : null) : null;

  if (wasPageExiting !== pageExiting) {
    setWasPageExiting(pageExiting);
    setMobileHoveredProject(null);
    setTransition(pageExiting ? { phase: exitSettleMs > 0 ? "settling" : "exiting" } : null);
  }

  useLayoutEffect(() => {
    if (!projectReturn) return;
    const target = projectsRef.current.querySelector(`[data-project-thumbnail="${projectReturn.slug}"]`);
    return arriveWorks(projectReturn, headingRef.current.closest("main"), target);
  }, [projectReturn]);

  useEffect(() => {
    if (transition) return;
    return bindMobileWorksHover(pageRef.current, setMobileHoveredProject);
  }, [transition]);

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

  return (
    <main
      ref={pageRef}
      className={[
        styles.page,
        resizing ? styles.resizing : "",
        projectReturn ? styles.returning : "",
        transition?.phase === "exiting" ? styles.exiting : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--exit-duration": `${EXIT_STEP_MS}ms` }}
    >
      <section className={styles.content} aria-labelledby="works-heading">
        <h1 ref={headingRef} className={styles.heading} id="works-heading" aria-label="Works" data-works-heading>
          {projects.map((project) => (
            <ProjectTitle
              key={project.slug}
              slug={project.slug}
              title={project.title}
              lines={project.titleLines}
              aspectRatio={project.aspectRatio}
              active={activeProject === project.slug}
            />
          ))}
        </h1>

        <div
          ref={projectsRef}
          data-works-projects
          data-hover-enabled={hoverEnabled && !transition}
          style={{ "--mobile-image-ratio": projects.find((project) => project.slug === mobileHoveredProject)?.aspectRatio }}
          className={[
            styles.projects,
            hoverEnabled && !transition ? styles.hoverEnabled : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {projects.map((project) => {
            const href = `/works/${project.slug}`;

            return (
              <article
                className={styles.project}
                data-project-preview
                data-mobile-active={!transition && mobileHoveredProject === project.slug}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setHoveredProject(project.slug);
                }}
                onPointerLeave={() => setHoveredProject((current) => current === project.slug ? null : current)}
                style={{
                  "--reveal-duration": project.duration,
                  "--image-ratio": project.aspectRatio,
                }}
                key={project.slug}
              >
                <Link
                  href={href}
                  aria-label={project.title}
                  className={styles.reveal}
                  onPointerEnter={() => warmRouteAssets(href)}
                  onFocus={() => warmRouteAssets(href)}
                  onTouchStart={() => warmRouteAssets(href)}
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
                          {...projectThumbnailProps(project)}
                          className={styles.image}
                          alt={`${project.title} project preview`}
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
                </Link>
              </article>
            );
          })}
        </div>

        <p className={styles.summary} aria-hidden="true">
          {projects.map((project) => (
            <span
              key={project.slug}
              className={styles.summaryLabel}
              style={{ "--image-ratio": project.aspectRatio }}
              data-active={activeProject === project.slug}
            >
              {project.summary}
            </span>
          ))}
        </p>
      </section>
    </main>
  );
}
