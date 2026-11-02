"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { usePageExiting } from "./shell-context";
import FitText from "./fit-text";
import styles from "../styles/text-fade.module.css";

function timing(index, count) {
  return {
    "--reveal-progress": index / Math.max(1, count - 1),
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
    if (entered) return;
    let disposed = false;

    const measure = () => {
      if (disposed) return;

      const nextLines = blockRefs.current.map((block) => {
        const node = block.firstElementChild.firstChild;
        const length = node?.textContent.length ?? 0;
        const range = document.createRange();
        const starts = [];
        let previousTop = null;

        for (let index = 0; index < length; index++) {
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const rect = Array.from(range.getClientRects()).find(
            (candidate) => candidate.width > 0 && candidate.height > 0,
          );
          if (!rect) continue;
          if (previousTop === null || Math.abs(rect.top - previousTop) > rect.height / 2) {
            starts.push(starts.length === 0 ? 0 : index);
          }
          previousTop = rect.top;
        }

        return starts.map((start, index) => ({
          start,
          end: starts[index + 1] ?? length,
        }));
      });

      setLines((current) =>
        JSON.stringify(current) === JSON.stringify(nextLines)
          ? current
          : nextLines,
      );
    };

    const observer = new ResizeObserver(measure);
    observer.observe(contentRef.current);
    measure();
    document.fonts.ready.then(measure);

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [entered, exiting]);

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
        {!entered &&
          lines[blockIndex]?.map((line, index) => (
            <span
              className={`${styles.line} ${styles.moving}`}
              aria-hidden="true"
              style={timing(lineIndex++, lineCount)}
              key={index}
            >
              <span className={styles.hidden}>{text.slice(0, line.start)}</span>
              {text.slice(line.start, line.end)}
              <span className={styles.hidden}>{text.slice(line.end)}</span>
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
        if (!exiting && event.target.classList.contains(styles.moving)) setEntered(true);
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

  return (
    <div
      className={[styles.moving, className].filter(Boolean).join(" ")}
      style={timing(index, count)}
      data-exiting={exiting}
    >
      {children}
    </div>
  );
}
