"use client";

import Image from "next/image";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import Reveal from "../../../../components/reveal";
import RollingText from "../../../../components/rolling-text";
import { usePageExiting } from "../../../../components/shell-context";
import { arriveProject, getProjectTransition } from "../project-transition";
import { PROJECT_DETAIL_IMAGE_SIZES, PROJECT_IMAGE_QUALITY } from "../projects";
import styles from "./project.module.css";

const ProjectArrivalContext = createContext(null);

function ProjectArrow({ back = false }) {
  return (
    <svg
      className={styles.arrow}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 12 12 4M5 4h7v7" transform={back ? "translate(16 0) scale(-1 1)" : undefined} />
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
  const [arrival] = useState(getProjectTransition);
  const exiting = usePageExiting();
  const mediaRight = project.slug === "commissioning-workspace";
  const headingId = `${project.slug}-heading`;

  useLayoutEffect(() => {
    if (!arrival) return;
    const container = containerRef.current;
    const elapsed = performance.now() - arrival.startedAt;
    container.style.setProperty("--project-enter-delay", `${700 - elapsed}ms`);
    return arriveProject(
      arrival,
      container.querySelector("[data-project-media]"),
      container.querySelector("[data-project-heading]"),
    );
  }, [arrival]);

  return (
    <ProjectArrivalContext.Provider value={arrival}>
      <div ref={containerRef} style={{ display: "contents" }}>
        <main
          className={[
            styles.page,
            mediaRight ? styles.mediaRight : "",
            exiting ? styles.exiting : "",
            arrival ? styles.fromWorks : "",
            arrival?.title ? styles.titleFromWorks : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            "--project-media-aspect-ratio": project.width
              ? project.width / project.height
              : project.aspectRatio,
          }}
        >
          <article className={styles.content} aria-labelledby={headingId}>
            <h1 id={headingId} className={styles.heading} data-project-heading>
              {project.title}
            </h1>

            {children}

            <Reveal
              className={styles.projectInfo}
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
          </article>
        </main>
      </div>
    </ProjectArrivalContext.Provider>
  );
}
