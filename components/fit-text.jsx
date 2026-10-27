"use client";

import { useImperativeHandle, useLayoutEffect, useRef } from "react";

export default function FitText({ as: Element = "span", text, children, ref, ...props }) {
  const elementRef = useRef(null);
  useImperativeHandle(ref, () => elementRef.current);

  useLayoutEffect(() => {
    const element = elementRef.current;
    const originalSize = element.style.fontSize;
    let disposed = false;
    let measuredWidth = null;

    const restore = () => {
      if (originalSize) element.style.fontSize = originalSize;
      else element.style.removeProperty("font-size");
    };

    const measure = () => {
      if (disposed) return;
      const width = element.getBoundingClientRect().width;
      if (measuredWidth !== null && Math.abs(width - measuredWidth) < 0.01) return;
      restore();

      const computed = getComputedStyle(element);
      const available = element.getBoundingClientRect().width -
        parseFloat(computed.paddingLeft) - parseFloat(computed.paddingRight) -
        parseFloat(computed.borderLeftWidth) - parseFloat(computed.borderRightWidth);
      if (available <= 0) return;

      const fontSize = parseFloat(computed.fontSize);
      const probe = document.createElement("span");
      probe.textContent = text;
      probe.setAttribute("aria-hidden", "true");
      Object.assign(probe.style, {
        position: "absolute",
        visibility: "hidden",
        pointerEvents: "none",
        width: "min-content",
        maxWidth: "none",
        font: "inherit",
        letterSpacing: "inherit",
        whiteSpace: "normal",
        overflowWrap: "normal",
        wordBreak: "normal",
      });
      element.append(probe);

      const wordWidth = probe.getBoundingClientRect().width;
      if (wordWidth > available) {
        const fittedSize = Math.max(0, fontSize * available / wordWidth - 0.02);
        element.style.fontSize = `${fittedSize}px`;
        const fittedWidth = probe.getBoundingClientRect().width;
        if (fittedWidth > available) {
          element.style.fontSize = `${Math.max(0, fittedSize * available / fittedWidth - 0.02)}px`;
        }
      }
      probe.remove();
      measuredWidth = element.getBoundingClientRect().width;
    };

    const invalidate = () => {
      measuredWidth = null;
      measure();
    };

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.parentElement) observer.observe(element.parentElement);
    const stylesObserver = new MutationObserver(invalidate);
    stylesObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    stylesObserver.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
    window.addEventListener("resize", invalidate);
    document.fonts.addEventListener("loadingdone", invalidate);
    measure();
    document.fonts.ready.then(invalidate);

    return () => {
      disposed = true;
      observer.disconnect();
      stylesObserver.disconnect();
      window.removeEventListener("resize", invalidate);
      document.fonts.removeEventListener("loadingdone", invalidate);
      restore();
    };
  }, [Element, text]);

  return <Element {...props} ref={elementRef}>{children ?? text}</Element>;
}
