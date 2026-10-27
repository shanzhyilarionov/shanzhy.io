"use client";

import { useImperativeHandle, useLayoutEffect, useRef } from "react";

export default function FitText({ as: Element = "span", text, children, ref, ...props }) {
  const elementRef = useRef(null);
  useImperativeHandle(ref, () => elementRef.current);

  useLayoutEffect(() => {
    const element = elementRef.current;
    const originalSize = element.style.fontSize;
    let disposed = false;

    const restore = () => {
      if (originalSize) element.style.fontSize = originalSize;
      else element.style.removeProperty("font-size");
    };

    const measure = () => {
      if (disposed) return;
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
        let lower = 0;
        let upper = fontSize;
        while (upper - lower > 0.01) {
          const candidate = (lower + upper) / 2;
          element.style.fontSize = `${candidate}px`;
          if (probe.getBoundingClientRect().width <= available) lower = candidate;
          else upper = candidate;
        }
        element.style.fontSize = `${lower}px`;
      }
      probe.remove();
    };

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.parentElement) observer.observe(element.parentElement);
    const stylesObserver = new MutationObserver(measure);
    stylesObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    stylesObserver.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
    window.addEventListener("resize", measure);
    document.fonts.addEventListener("loadingdone", measure);
    measure();
    document.fonts.ready.then(measure);

    return () => {
      disposed = true;
      observer.disconnect();
      stylesObserver.disconnect();
      window.removeEventListener("resize", measure);
      document.fonts.removeEventListener("loadingdone", measure);
      restore();
    };
  }, [Element, text]);

  return <Element {...props} ref={elementRef}>{children ?? text}</Element>;
}
