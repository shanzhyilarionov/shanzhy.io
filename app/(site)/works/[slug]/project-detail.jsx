"use client";

import Image from "next/image";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import Reveal from "../../../../components/reveal";
import RollingText from "../../../../components/rolling-text";
import { usePageExiting, useScreenshots } from "../../../../components/shell-context";
import { arriveProject, getProjectTransition } from "../project-transition";
import { PROJECT_IMAGE_QUALITY, PROJECT_PAGE_IMAGE_SIZES } from "../projects";
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
            sizes={PROJECT_PAGE_IMAGE_SIZES}
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
  const [arrival] = useState(getProjectTransition);
  const exiting = usePageExiting();
  const openScreenshots = useScreenshots();
  const headingId = `${project.slug}-heading`;
  const blocks = [
    {
      as: "h1",
      id: headingId,
      text: project.title,
      className: styles.heading,
    },
    { text: project.description, className: styles.description },
  ];

  useLayoutEffect(() => {
    if (!arrival) return;
    const container = containerRef.current;
    const elapsed = performance.now() - arrival.startedAt;
    container.style.setProperty("--project-enter-delay", `${700 - elapsed}ms`);
    return arriveProject(
      arrival,
      container.querySelector("[data-project-media]"),
    );
  }, [arrival]);

  return (
    <ProjectArrivalContext.Provider value={arrival}>
      <div ref={containerRef} style={{ display: "contents" }}>
        <main
          className={[styles.page, exiting ? styles.exiting : "", arrival ? styles.fromWorks : ""]
            .filter(Boolean)
            .join(" ")}
        >
          <article className={styles.content} aria-labelledby={headingId}>
            <Reveal className={styles.intro} blocks={blocks} />

            {children}

            <div className={styles.action}>
              {project.screenshots?.length > 0 && (
                <RollingText
                  type="button"
                  label="View screenshots"
                  aria-haspopup="dialog"
                  onClick={(event) => openScreenshots(event.currentTarget)}
                />
              )}
              <RollingText
                as="a"
                href={`https://github.com/shanzhyilarionov/${project.repository}`}
                label="View project on GitHub"
                target="_blank"
                rel="noopener noreferrer"
              />
            </div>
          </article>
        </main>
      </div>
    </ProjectArrivalContext.Provider>
  );
}
