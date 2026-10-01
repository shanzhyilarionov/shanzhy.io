"use client";

import { createContext, useContext, useEffect, useState } from "react";

const HoverEnabledContext = createContext(false);

export function useHoverEnabled() {
  return useContext(HoverEnabledContext);
}

export function HoverBoundary({ viewKey, blocked = false, children, ...props }) {
  const [view, setView] = useState(viewKey);
  const [enabled, setEnabled] = useState(false);

  if (view !== viewKey || (blocked && enabled)) {
    setView(viewKey);
    setEnabled(false);
  }

  useEffect(() => {
    const handlePageShow = (event) => {
      if (event.persisted) setEnabled(false);
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return (
    <HoverEnabledContext.Provider value={enabled && !blocked}>
      <div
        {...props}
        data-hover-enabled={enabled && !blocked}
        onPointerMoveCapture={(event) => {
          if (
            !blocked && !enabled &&
            event.pointerType === "mouse" &&
            (event.movementX !== 0 || event.movementY !== 0)
          ) {
            setEnabled(true);
          }
        }}
      >
        {children}
      </div>
    </HoverEnabledContext.Provider>
  );
}
