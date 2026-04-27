"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Navigation from "../components/navigation";
import styles from "./page.module.css";

const Tesseract = dynamic(() => import("../components/tesseract"), {
  ssr: false,
});

export default function Page() {
  const [buttonMotion, setButtonMotion] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  const buttonClassName = [
    styles.homeStart,
    buttonMotion === "enter" ? styles.homeStartEnter : "",
    buttonMotion === "leave" ? styles.homeStartLeave : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <main className={styles.home}>
        <p className={styles.homeTopText}>Independent Developer</p>

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

        <button
          className={buttonClassName}
          type="button"
          aria-label="Click here to start"
          onClick={() => {
            setNavOpen(true);
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") {
              setButtonMotion("enter");
            }
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") {
              setButtonMotion("leave");
            }
          }}
        >
          <span className={styles.homeStartMask} aria-hidden="true">
            <span
              className={styles.homeStartTrack}
              onAnimationEnd={() => {
                if (buttonMotion === "leave") {
                  setButtonMotion("");
                }
              }}
            >
              <span className={styles.homeStartLine}>Click here to start</span>
              <span className={styles.homeStartLine}>Click here to start</span>
              <span className={styles.homeStartLine}>Click here to start</span>
            </span>
          </span>
        </button>

        <p className={styles.homeBottomText}>Edmonton, Canada</p>
      </main>

      <Navigation open={navOpen} onClose={() => setNavOpen(false)} />
    </>
  );
}