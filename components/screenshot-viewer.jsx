"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Chrome from "./chrome";
import { NavigationPanel } from "./navigation";
import RollingText from "./rolling-text";
import { PROJECT_IMAGE_QUALITY, PROJECT_PAGE_IMAGE_SIZES } from "../app/(site)/works/projects";
import styles from "./screenshot-viewer.module.css";

export default function ScreenshotViewer({ project, phase, anchor, onClose }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const [slide, setSlide] = useState({ index: 0, target: 0, phase: "idle" });
  const changing = slide.phase !== "idle";
  const exiting = phase !== "open";

  useLayoutEffect(() => {
    const alignClose = () => {
      const bounds = anchor.getBoundingClientRect();
      panelRef.current.style.setProperty("--screenshot-close-top", `${bounds.top + bounds.height / 2}px`);
    };
    alignClose();
    const observer = new ResizeObserver(alignClose);
    observer.observe(anchor.closest("article"));
    window.addEventListener("resize", alignClose);
    window.addEventListener("scroll", alignClose, true);
    closeRef.current.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", alignClose);
      window.removeEventListener("scroll", alignClose, true);
    };
  }, [anchor]);

  useEffect(() => () => anchor.focus({ preventScroll: true }), [anchor]);

  useLayoutEffect(() => {
    if (document.activeElement === document.body) {
      closeRef.current.focus({ preventScroll: true });
    }
  }, [slide.index]);

  useEffect(() => {
    if (!changing) return;
    const timer = window.setTimeout(() => {
      setSlide((current) => current.phase === "out"
        ? { ...current, index: current.target, phase: "in" }
        : { ...current, phase: "idle" });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [changing, slide.phase]);

  const move = (direction) => {
    if (exiting) return;
    setSlide((current) => {
      const target = current.index + direction;
      if (current.phase !== "idle" || target < 0 || target >= project.screenshots.length) return current;
      return { ...current, target, phase: "out" };
    });
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "Tab") {
      const buttons = [...panelRef.current.querySelectorAll("button:not(:disabled)")]
        .filter((button) => !button.closest("[inert]"));
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const control = (direction, label, available) => (
    <span
      className={[styles.control, available ? styles.available : ""].filter(Boolean).join(" ")}
      aria-hidden={!available}
      inert={!available}
    >
      <RollingText
        type="button"
        label={label}
        aria-disabled={changing || exiting}
        onClick={() => move(direction)}
      />
    </span>
  );

  return (
    <NavigationPanel
      phase={phase}
      enterSlide={false}
      exitSlide={false}
      role="dialog"
      aria-modal="true"
      aria-label={`${project.title} screenshots`}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        className={[styles.viewer, exiting ? styles.exiting : ""].filter(Boolean).join(" ")}
      >
        <div className={styles.viewport}>
          <div className={styles.frame} aria-live="polite" aria-busy={changing}>
            <div className={styles.mask}>
              <div className={styles.media}>
                {project.screenshots.map((screenshot, index) => (
                  <Image
                    key={screenshot.image}
                    className={[
                      styles.image,
                      index === slide.index ? styles.active : "",
                      index === slide.index && slide.phase === "out" ? styles.fadeOut : "",
                      index === slide.index && slide.phase === "in" ? styles.fadeIn : "",
                    ].filter(Boolean).join(" ")}
                    src={screenshot.image}
                    alt={screenshot.alt}
                    width={project.screenshotWidth}
                    height={project.screenshotHeight}
                    sizes={PROJECT_PAGE_IMAGE_SIZES}
                    quality={PROJECT_IMAGE_QUALITY}
                    loading="eager"
                    aria-hidden={index !== slide.index}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        <Chrome
          className={styles.controls}
          inert={exiting}
          left={control(-1, "Previous", slide.index > 0)}
          right={control(1, "Next", slide.index < project.screenshots.length - 1)}
        />
        <div className={styles.close} inert={exiting}>
          <RollingText ref={closeRef} type="button" label="Close" onClick={onClose} />
        </div>
      </div>
    </NavigationPanel>
  );
}
