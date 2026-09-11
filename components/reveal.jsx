"use client";

import { useLayoutEffect, useRef, useState } from "react";
import styles from "./reveal.module.css";

function timing(index, count) {
  const duration = 200 + (300 * index) / Math.max(1, count - 1);

  return {
    "--duration": `${duration}ms`,
    "--delay": `${500 - duration}ms`,
  };
}

/** Apply Contact's original timing to each naturally wrapped text line. */
export default function Reveal({
  as: Element = "div",
  blocks,
  className,
  ...props
}) {
  const contentRef = useRef(null);
  const blockRefs = useRef([]);
  const [lines, setLines] = useState([]);
  const [entered, setEntered] = useState(false);
  const lineCount = lines.reduce((count, block) => count + block.length, 0);
  let lineIndex = 0;

  useLayoutEffect(() => {
    if (entered) return;
    let disposed = false;

    const measure = () => {
      if (disposed) return;

      const nextLines = blockRefs.current.map((block) => {
        const bounds = block.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(block.firstElementChild);
        const rects = Array.from(range.getClientRects()).filter(
          (rect) => rect.width > 0 && rect.height > 0,
        );

        return rects.map((rect, index) => ({
          top:
            index === 0
              ? Math.min(-1, rect.top - bounds.top - 1)
              : (rects[index - 1].bottom + rect.top) / 2 - bounds.top,
          bottom:
            index === rects.length - 1
              ? Math.min(-1, bounds.bottom - rect.bottom - 1)
              : bounds.bottom - (rect.bottom + rects[index + 1].top) / 2,
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
  }, [entered]);

  return (
    <Element
      {...props}
      ref={contentRef}
      className={[styles.content, className].filter(Boolean).join(" ")}
      data-entered={entered}
      onAnimationEnd={() => setEntered(true)}
    >
      {blocks.map(({ as: Tag = "p", id, text, className }, blockIndex) => (
        <Tag
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
                style={{
                  "--clip-top": `${line.top}px`,
                  "--clip-bottom": `${line.bottom}px`,
                  ...timing(lineIndex++, lineCount),
                }}
                key={index}
              >
                {text}
              </span>
            ))}
        </Tag>
      ))}
    </Element>
  );
}

/** Contact rows keep their original order, delays, durations and interactions. */
export function RevealItem({ index, count, className, children }) {
  return (
    <div
      className={[styles.moving, className].filter(Boolean).join(" ")}
      style={timing(index, count)}
    >
      {children}
    </div>
  );
}
