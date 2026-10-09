"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import Reveal from "../../../../components/reveal";
import { usePageExiting } from "../../../../components/page-exit-context";
import RollingText from "../../../../components/rolling-text";
import { useProjectArrival } from "./project-arrival";
import { projects, PROJECT_IMAGE_QUALITY } from "../projects";
import styles from "./genesis.module.css";

const project = projects.find(({ slug }) => slug === "commissioning-workspace");
const blocks = [
  {
    as: "h1",
    id: "commissioning-workspace-heading",
    text: "Commissioning Workspace",
    className: `${styles.heading} ${styles.longHeading}`,
  },
  {
    text: "Commissioning Workspace is a desktop application for industrial commissioning management. It features a clean, visually refined, and responsive interface. Interactions are kept simple and direct, making common tasks faster to complete, while the workflow remains fully usable without an internet connection. It was developed as a lightweight alternative to traditional engineering software, with a smaller footprint and fewer layers of complexity while retaining the functionality needed for everyday commissioning work.",
    className: styles.description,
  },
];

export default function CommissioningWorkspace() {
  const exiting = usePageExiting();
  const arrival = useProjectArrival();
  const imageRef = useRef(null);

  useLayoutEffect(() => {
    const image = imageRef.current;
    if (image.complete && image.naturalWidth > 0) arrival?.markMediaReady();
  }, [arrival]);

  return (
    <main
      className={[styles.page, exiting ? styles.exiting : "", arrival ? styles.fromWorks : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <article className={styles.content} aria-labelledby="commissioning-workspace-heading">
        <Reveal className={styles.intro} blocks={blocks} />

        <div className={styles.videoFrame} data-project-media>
          <div className={styles.videoMask}>
            <div className={styles.image}>
              <Image
                ref={imageRef}
                className={styles.imageElement}
                src={project.image}
                alt="Commissioning Workspace desktop application"
                width={project.width}
                height={project.height}
                sizes="(max-width: 768px) 90vw, (max-width: 1058px) calc(90vw - 12rem), 40rem"
                quality={PROJECT_IMAGE_QUALITY}
                priority
                onLoad={() => arrival?.markMediaReady()}
                onError={() => arrival?.markMediaReady()}
              />
            </div>
          </div>
        </div>

        <div className={styles.action}>
          <RollingText
            as="a"
            href="https://github.com/shanzhyilarionov/commissioning-workspace"
            label="View project on GitHub"
            target="_blank"
            rel="noopener noreferrer"
          />
        </div>
      </article>
    </main>
  );
}
