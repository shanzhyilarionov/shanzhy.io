"use client";

import dynamic from "next/dynamic";
import styles from "./page.module.css";

const Tesseract = dynamic(() => import("../components/tesseract"), {
  ssr: false,
});

const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Shanzhy",
  url: "https://shanzhy.io/",
};

export default function Page() {
  return (
    <main className={styles.home}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
      <div className={styles.tesseractLayer}>
        <Tesseract />
      </div>
    </main>
  );
}
