"use client";

import Image from "next/image";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import Reveal from "../../../../components/reveal";
import RollingText from "../../../../components/rolling-text";
import { usePageExiting } from "../../../../components/shell-context";
import { arriveProject, getProjectTransition } from "../project-transition";
import { PROJECT_DETAIL_IMAGE_SIZES, PROJECT_IMAGE_QUALITY } from "../projects";
import ProjectTitle from "../project-title";
import styles from "./project.module.css";

const ProjectArrivalContext = createContext(null);

function ProjectArrow({ back = false }) {
  return (
    <svg
      className={styles.arrow}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M1 1h14v14M1 15 15 1" transform={back ? "translate(16 0) scale(-1 1)" : undefined} />
    </svg>
  );
}

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
      className={styles.videoFrame}
      data-project-media
      data-project-crop={project.crop ? "true" : undefined}
    >
      <div className={styles.videoMask}>
        <div className={styles.image}>
          <Image
            ref={imageRef}
            className={styles.imageElement}
            src={project.image}
            alt={project.alt}
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
  const descriptionMeasureRef = useRef(null);
  const [arrival] = useState(getProjectTransition);
  const [stacked, setStacked] = useState(null);
  const exiting = usePageExiting();
  const headingId = `${project.slug}-heading`;
  const mediaAspectRatio = project.width ? project.width / project.height : project.aspectRatio;
  const layoutReady = stacked !== null;

  useLayoutEffect(() => {
    const content = contentRef.current;
    const description = descriptionMeasureRef.current;
    const actions = content.querySelector(`.${styles.action}`);
    const narrowScreen = window.matchMedia("(max-width: 768px)");
    let disposed = false;

    const measure = () => {
      if (disposed) return;
      const mediaHeight = content.getBoundingClientRect().width * 2 / 3 / mediaAspectRatio;
      const descriptionHeight = description.getBoundingClientRect().height;
      const actionsHeight = actions.getBoundingClientRect().height;
      const buttonGap = parseFloat(getComputedStyle(actions).rowGap);

      setStacked(narrowScreen.matches || mediaHeight - descriptionHeight - actionsHeight < buttonGap);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(description);
    observer.observe(actions);
    narrowScreen.addEventListener("change", measure);
    measure();
    document.fonts.ready.then(measure);

    return () => {
      disposed = true;
      observer.disconnect();
      narrowScreen.removeEventListener("change", measure);
    };
  }, [mediaAspectRatio, project.description]);

  useLayoutEffect(() => {
    if (!arrival || !layoutReady) return;
    const container = containerRef.current;
    const elapsed = performance.now() - arrival.startedAt;
    container.style.setProperty("--project-enter-delay", `${700 - elapsed}ms`);
    return arriveProject(
      arrival,
      container.querySelector("[data-project-media]"),
      container.querySelector("[data-project-heading]"),
    );
  }, [arrival, layoutReady]);

  return (
    <ProjectArrivalContext.Provider value={arrival}>
      <div ref={containerRef} style={{ display: "contents" }}>
        <main
          className={[
            styles.page,
            stacked !== false ? styles.stacked : "",
            exiting ? styles.exiting : "",
            arrival ? styles.fromWorks : "",
            arrival?.title ? styles.titleFromWorks : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            "--project-media-aspect-ratio": mediaAspectRatio,
          }}
        >
          <article ref={contentRef} className={styles.content} aria-labelledby={headingId}>
            <h1
              id={headingId}
              className={styles.heading}
              data-project-heading
            >
              <ProjectTitle title={project.title} lines={project.titleLines} />
            </h1>

            <div className={styles.projectInfo}>
              <Reveal
                className={styles.projectBody}
                blocksClassName={styles.description}
                blocks={[{ text: project.description, className: styles.descriptionParagraph }]}
                actionsClassName={styles.action}
                actions={[
                  <RollingText
                    key="github"
                    as="a"
                    href={`https://github.com/shanzhyilarionov/${project.repository}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    label="View project on GitHub"
                    suffix={<ProjectArrow />}
                  />,
                  <RollingText
                    key="works"
                    as="a"
                    href="/works"
                    label="Back to works"
                    suffix={<ProjectArrow back />}
                  />,
                ]}
              />
            </div>

            {children}

            <div className={styles.layoutMeasure} aria-hidden="true">
              <p
                ref={descriptionMeasureRef}
                className={`${styles.description} ${styles.descriptionParagraph}`}
              >
                {project.description}
              </p>
            </div>
          </article>
        </main>
      </div>
    </ProjectArrivalContext.Provider>
  );
}
