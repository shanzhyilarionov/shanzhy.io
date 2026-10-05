"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import Reveal from "../../../../components/reveal";
import { usePageExiting } from "../../../../components/page-exit-context";
import RollingText from "../../../../components/rolling-text";
import { useProjectArrival } from "./project-arrival";
import { projects, PROJECT_IMAGE_QUALITY } from "../projects";
import styles from "./genesis.module.css";

const project = projects.find(({ slug }) => slug === "shanzhy-io");
const blocks = [
  {
    as: "h1",
    id: "shanzhy-io-heading",
    text: "shanzhy.io",
    className: styles.heading,
  },
  {
    text: "shanzhy.io is the website you are currently visiting—a personal portfolio created entirely from scratch without the use of templates. Rooted in minimalism, it focuses on essential content, typography, interaction, motion, and adaptability across different screens. At the centre of the homepage is a four-dimensional cube built in JavaScript, conceived as a distinctive visual element and brought to life through geometry, depth, and responsive behaviour. The site functions both as a presentation of my work and an ongoing exploration of frontend engineering.",
    className: styles.description,
  },
];

export default function ShanzhyIo() {
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
      <article className={styles.content} aria-labelledby="shanzhy-io-heading">
        <Reveal className={styles.intro} blocks={blocks} />

        <div className={styles.videoFrame} data-project-media data-project-crop="true">
          <div className={styles.videoMask}>
            <div className={styles.image}>
              <Image
                ref={imageRef}
                className={styles.imageElement}
                src={project.image}
                alt="shanzhy.io portfolio displayed on a MacBook Pro"
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
            href="https://github.com/shanzhyilarionov/shanzhy.io"
            label="View project on GitHub"
            target="_blank"
            rel="noopener noreferrer"
          />
        </div>
      </article>
    </main>
  );
}
