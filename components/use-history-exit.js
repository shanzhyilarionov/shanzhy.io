"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { flushSync } from "react-dom";

export function useHistoryExit(pathname, duration) {
  const [transition, setTransition] = useState(null);

  if (transition !== null && transition.from !== pathname) {
    setTransition(null);
  }

  const getExit = useEffectEvent(() =>
    window.location.pathname !== pathname
      ? {
          from: pathname,
          to: window.location.pathname,
          duration: typeof duration === "function" ? duration(window.location.pathname) : duration,
        }
      : null,
  );

  useEffect(() => {
    let timer = null;
    let pendingEvent = null;
    let replaying = false;

    const onPopState = (event) => {
      if (replaying) return;

      const exit = getExit();
      if (!event.state || exit === null) {
        if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
        pendingEvent = null;
        setTransition(null);
        return;
      }

      event.stopImmediatePropagation();
      pendingEvent = new PopStateEvent("popstate", { state: event.state });
      if (timer !== null) window.clearTimeout(timer);

      flushSync(() => setTransition(exit));
      timer = window.setTimeout(() => {
        timer = null;
        replaying = true;
        window.dispatchEvent(pendingEvent);
        replaying = false;
        pendingEvent = null;
      }, exit.duration);
    };

    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("popstate", onPopState, true);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return transition?.from === pathname ? transition : null;
}
