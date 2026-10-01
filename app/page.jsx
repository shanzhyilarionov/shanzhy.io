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
    </main>
  );
}
