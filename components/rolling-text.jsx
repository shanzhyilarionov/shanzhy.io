"use client";

import { useState } from "react";
import { useHoverEnabled } from "./hover-boundary";
import styles from "./rolling-text.module.css";

export default function RollingText({
  as: Element = "button",
  label,
  className,
  animateLabelChange = true,
  ...props
}) {
  const hoverEnabled = useHoverEnabled();
  const [shown, setShown] = useState(label);
  const [swap, setSwap] = useState("");
  const [rolling, setRolling] = useState(false);

  if (!hoverEnabled && rolling) {
    setRolling(false);
  }

  if (!animateLabelChange && (label !== shown || swap)) {
    setShown(label);
    setSwap("");
  } else if (label !== shown && !swap) {
    setSwap("leaving");
  }

  return (
    <Element
      className={[
        styles.control,
        swap === "leaving" ? styles.leaving : "",
        swap === "arriving" ? styles.arriving : "",
        rolling ? styles.rolling : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        if (swap === "leaving") {
          setShown(label);
          setSwap("arriving");
        } else if (swap === "arriving") {
          setSwap("");
        }
      }}
      onPointerEnter={(event) => {
        if (hoverEnabled && event.pointerType === "mouse") {
          setRolling(true);
        }
      }}
      {...props}
    >
      <span className={styles.mask} aria-hidden="true">
        <span className={styles.track} onAnimationEnd={() => setRolling(false)}>
          <span className={styles.line}>{shown}</span>
          <span className={styles.line}>{shown}</span>
          <span className={styles.line}>{shown}</span>
        </span>
      </span>
    </Element>
  );
}
