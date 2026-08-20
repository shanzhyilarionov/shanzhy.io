"use client";

import dynamic from "next/dynamic";
import styles from "./page.module.css";

const Tesseract = dynamic(() => import("../components/tesseract"), {
  ssr: false,
});

export default function Page() {
  return (
    <main className={styles.home}>
      <div className={styles.tesseractLayer}>
        <Tesseract />
      </div>

      <h1 className={styles.homeTitle} aria-label="Shanzhy">
        {"Shanzhy".split("").map((letter, index) => (
          <span
            className={styles.titleLetterMask}
            aria-hidden="true"
            key={index}
          >
            <span className={styles.titleLetter}>{letter}</span>
          </span>
        ))}
      </h1>

      <p className={styles.homeRole}>Independent Developer</p>
    </main>
  );
}
