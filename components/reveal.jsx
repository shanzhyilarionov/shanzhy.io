"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { usePageExiting } from "./shell-context";
import FitText from "./fit-text";
import { measureRevealLines } from "./reveal-lines";
import styles from "./reveal.module.css";

function timing(index, count) {
  const duration = 200 + (300 * index) / Math.max(1, count - 1);
  return {
    "--duration": `${duration}ms`,
    "--delay": `${500 - duration}ms`,
  };
}

export default function Reveal({
  as: Element = "div",
  blocks,
  blocksClassName,
  leadingActions = [],
  leadingActionsClassName,
  actions = [],
  actionsClassName,
  className,
  ...props
}) {
  const contentRef = useRef(null);
  const blockRefs = useRef([]);
  const [lines, setLines] = useState([]);
  const [entered, setEntered] = useState(false);
  const exiting = usePageExiting();
  const [wasExiting, setWasExiting] = useState(exiting);
  const textLineCount = lines.reduce((count, block) => count + block.length, 0);
  const lineCount = leadingActions.length + textLineCount + actions.length;
  let lineIndex = leadingActions.length;

  if (wasExiting !== exiting) {
    setWasExiting(exiting);
    setEntered(false);
  }

  useLayoutEffect(() => {
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const nextLines = blockRefs.current.map(measureRevealLines);
      setLines((current) => JSON.stringify(current) === JSON.stringify(nextLines) ? current : nextLines);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(contentRef.current);
    blockRefs.current.forEach((block) => observer.observe(block));
    measure();
    document.fonts.ready.then(measure);
    document.fonts.addEventListener("loadingdone", measure);
    return () => {
      disposed = true;
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, []);

  const blockContent = blocks.map(
    ({ as: Tag = "p", id, text, className }, blockIndex) => (
      <FitText
        as={Tag}
        text={text}
        id={id}
        className={[styles.block, className].filter(Boolean).join(" ")}
        ref={(element) => {
          blockRefs.current[blockIndex] = element;
        }}
        key={blockIndex}
      >
        <span className={styles.source}>{text}</span>
        {!entered && lines[blockIndex]?.map((line, index) => (
          <span
            className={`${styles.line} ${styles.moving}`}
            data-reveal-line
            aria-hidden="true"
            style={{
              "--line-top": `${line.top}px`,
              "--line-left": `${line.left}px`,
              ...timing(lineIndex++, lineCount),
            }}
            key={index}
          >
            {line.text}
          </span>
        ))}
      </FitText>
    ),
  );

  return (
    <Element
      {...props}
      ref={contentRef}
      className={[styles.content, className].filter(Boolean).join(" ")}
      data-entered={entered}
      data-exiting={exiting}
      onAnimationEnd={(event) => {
        if (exiting || !event.target.classList.contains(styles.moving)) return;
        const running = event.currentTarget.getAnimations({ subtree: true }).some((animation) =>
          animation.effect?.target?.classList.contains(styles.moving) &&
          (animation.playState === "running" || animation.pending),
        );
        if (!running) setEntered(true);
      }}
    >
      {leadingActions.length > 0 && (
        <div className={leadingActionsClassName}>
          {leadingActions.map((action, index) => (
            <div
              className={styles.moving}
              style={timing(index, lineCount)}
              key={action.key ?? index}
            >
              {action}
            </div>
          ))}
        </div>
      )}
      {blocksClassName ? <div className={blocksClassName}>{blockContent}</div> : blockContent}
      {actions.length > 0 && (
        <div className={actionsClassName}>
          {actions.map((action, index) => (
            <div
              className={styles.moving}
              style={timing(leadingActions.length + textLineCount + index, lineCount)}
              key={action.key ?? index}
            >
              {action}
            </div>
          ))}
        </div>
      )}
    </Element>
  );
}

export function RevealItem({ index, count, className, children }) {
  const exiting = usePageExiting();
  const [entered, setEntered] = useState(false);
  const [wasExiting, setWasExiting] = useState(exiting);
  if (wasExiting !== exiting) {
    setWasExiting(exiting);
    setEntered(false);
  }

  return (
    <div
      className={[styles.moving, className].filter(Boolean).join(" ")}
      style={timing(index, count)}
      data-entered={entered}
      data-exiting={exiting}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !exiting) setEntered(true);
      }}
    >
      {children}
    </div>
  );
}
