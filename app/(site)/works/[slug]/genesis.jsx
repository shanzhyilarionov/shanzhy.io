"use client";

import Reveal from "../../../../components/reveal";
import { usePageExiting } from "../../../../components/page-exit-context";
import RollingText from "../../../../components/rolling-text";
import GenesisVideo from "./genesis-video";
import styles from "./genesis.module.css";

const blocks = [
  {
    as: "h1",
    id: "genesis-heading",
    text: "Genesis",
    className: styles.heading,
  },
  {
    text: "Genesis is an experimental multi-agent ecosystem simulation built around a simple idea: small local decisions can accumulate into complex system-wide behaviour. Individual agents respond to resources, environmental conditions, and one another through a compact set of rules, while reproduction and mutation shape populations over time. The project aims to examine adaptation, resilience, and coordination across both natural and distributed systems.",
    className: styles.description,
  },
];

export default function Genesis() {
  const exiting = usePageExiting();

  return (
    <main
      className={[styles.page, exiting ? styles.exiting : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <article className={styles.content} aria-labelledby="genesis-heading">
        <Reveal className={styles.intro} blocks={blocks} />

        <GenesisVideo />

        <div className={styles.action}>
          <RollingText
            as="a"
            href="https://github.com/shanzhyilarionov/genesis"
            label="View project on GitHub"
            target="_blank"
            rel="noopener noreferrer"
          />
        </div>
      </article>
    </main>
  );
}
