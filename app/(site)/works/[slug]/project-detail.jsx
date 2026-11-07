"use client";

import Image from "next/image";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import Reveal from "../../../../components/reveal";
import RollingText from "../../../../components/rolling-text";
import { usePageExiting } from "../../../../components/shell-context";
import { arriveProject, getProjectTransition } from "../project-transition";
import { PROJECT_DETAIL_IMAGE_SIZES, PROJECT_IMAGE_QUALITY } from "../projects";
import { motion } from "../../../../styles/animations.mjs";
import { NARROW_VIEWPORT_QUERY } from "../../../../styles/viewport.mjs";
import styles from "./project.module.css";

const ProjectArrivalContext = createContext(null);

export function useProjectArrival() {
  return useContext(ProjectArrivalContext);
}

export function ProjectImage({ project }) {
  const arrival = useProjectArrival();
  const imageRef = useRef(null);

  useLayoutEffect(() => {
    const image = imageRef.current;
    if (image.complete && image.naturalWidth > 0) arrival?.markMediaReady();
  }, [arrival]);

  return (
    <div
      className={[styles.videoFrame, project.cover ? styles.cover : ""].filter(Boolean).join(" ")}
      data-project-media
      data-project-crop={project.crop ? "true" : undefined}
    >
      <div className={styles.videoMask}>
        <div className={styles.image}>
          <Image
            ref={imageRef}
            className={styles.imageElement}
            src={project.image}
            alt={`${project.title} project preview`}
            width={project.width}
            height={project.height}
            sizes={PROJECT_DETAIL_IMAGE_SIZES}
            quality={PROJECT_IMAGE_QUALITY}
            priority
            onLoad={() => arrival?.markMediaReady()}
            onError={() => arrival?.markMediaReady()}
          />
        </div>
      </div>
    </div>
  );
}

export default function ProjectDetail({ project, children }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const layoutMeasureRef = useRef(null);
  const previousLayoutRef = useRef(null);
  const layoutChangedRef = useRef(false);
  const [arrival] = useState(getProjectTransition);
  const [stacked, setStacked] = useState(null);
  const exiting = usePageExiting();
  const mediaAspectRatio = project.width ? project.width / project.height : project.aspectRatio;
  const layoutReady = stacked !== null;
  const githubAction = (
    <RollingText
      key="github"
      as="a"
      href={`https://github.com/shanzhyilarionov/${project.repository}`}
      target="_blank"
      rel="noopener noreferrer"
      label="View project on GitHub"
    />
  );

  useLayoutEffect(() => {
    const content = contentRef.current;
    const layoutMeasure = layoutMeasureRef.current;
    const actions = content.querySelector(`.${styles.action}`);
    const buttons = Array.from(actions.querySelectorAll("a"));
    const narrowViewport = window.matchMedia(NARROW_VIEWPORT_QUERY);
    let disposed = false;

    const measure = () => {
      if (disposed) return;
      const mediaOffset = layoutMeasure.getBoundingClientRect().width;
      const buttonWidth = Math.max(...buttons.map((button) => button.getBoundingClientRect().width));
      const headingGap = parseFloat(getComputedStyle(layoutMeasure).paddingRight);

      setStacked(narrowViewport.matches || mediaOffset - buttonWidth < headingGap);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(layoutMeasure);
    buttons.forEach((button) => observer.observe(button));
    narrowViewport.addEventListener("change", measure);
    measure();
    document.fonts.ready.then(measure);

    return () => {
      disposed = true;
      observer.disconnect();
      narrowViewport.removeEventListener("change", measure);
    };
  }, [project.slug, stacked]);

  useLayoutEffect(() => {
    const previous = previousLayoutRef.current;
    previousLayoutRef.current = stacked;
    if (previous === null || stacked === null || previous === stacked) return;
    layoutChangedRef.current = true;
    containerRef.current.getAnimations({ subtree: true }).forEach((animation) => animation.finish());
    arrival?.dispose();
  }, [arrival, stacked]);

  useLayoutEffect(() => {
    if (!arrival || !layoutReady || layoutChangedRef.current) return;
    const container = containerRef.current;
    const elapsed = performance.now() - arrival.startedAt;
    container.style.setProperty("--project-enter-delay", `${motion.projectMedia - elapsed}ms`);
    return arriveProject(
      arrival,
      container.querySelector("[data-project-media]"),
    );
  }, [arrival, layoutReady, stacked]);

  return (
    <ProjectArrivalContext.Provider value={arrival}>
      <div ref={containerRef} style={{ display: "contents" }}>
        <main
          data-exiting={exiting}
          data-project-layout={stacked !== false ? "stacked" : "wide"}
          className={[
            styles.page,
            stacked !== false ? styles.stacked : "",
            exiting ? styles.exiting : "",
            arrival ? styles.fromWorks : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            "--project-media-aspect-ratio": mediaAspectRatio,
          }}
        >
          <article ref={contentRef} className={styles.content} aria-label={project.title}>
            <div className={styles.projectInfo}>
              <Reveal
                className={styles.projectBody}
                leadingActionsClassName={styles.backAction}
                leadingActions={stacked === false ? [
                  <RollingText
                    key="works"
                    as="a"
                    href="/works"
                    label="Back"
                  />,
                ] : []}
                blocksClassName={styles.description}
                blocks={[{ text: project.description, className: styles.descriptionParagraph }]}
                actionsClassName={styles.action}
                actions={stacked === false ? [githubAction] : []}
              />
              {stacked !== false && (
                <div className={styles.action}>{githubAction}</div>
              )}
            </div>

            {children}

            <div ref={layoutMeasureRef} className={styles.layoutMeasure} aria-hidden="true" />
          </article>
        </main>
      </div>
    </ProjectArrivalContext.Provider>
  );
}
