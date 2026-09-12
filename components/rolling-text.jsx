"use client";

import { useState } from "react";
import { useHoverEnabled } from "./hover-boundary";
import styles from "./rolling-text.module.css";

/**
 * A label with two behaviours.
 *
 * On hover it rolls: the mask is one line tall and the track holds three
 * copies of the word, so sliding the track up by a third reads as the label
 * refreshing itself.
 *
 * When the label is *replaced* — Menu becoming Close, say — it does not roll.
 * The old word fades out, and only once it is gone does the new one fade in.
 *
 * `as` picks the element — a button by default, `"a"` for an outbound link.
 */
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

  /* The label was replaced under us; take the old one out first. */
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
        /* The roll finishing on the track inside is not our business. */
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
      onPointerMove={(event) => {
        // The first movement may happen inside a control already under the
        // cursor, so it must start the roll without another pointerenter.
        if (
          !hoverEnabled &&
          event.pointerType === "mouse" &&
          (event.movementX !== 0 || event.movementY !== 0)
        ) {
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
