"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { flushSync } from "react-dom";

/** Let the visible page finish leaving before the router handles traversal. */
export function useHistoryExit(pathname, enabled, duration) {
  const [transition, setTransition] = useState(null);

  if (transition !== null && transition.from !== pathname) {
    setTransition(null);
  }

  const getExit = useEffectEvent(() =>
    enabled &&
    window.location.pathname !== pathname &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? { from: pathname, to: window.location.pathname, duration }
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

      // History has already moved. Defer only the router's notification;
      // forwarding the original state preserves the back/forward stack.
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

    // Register once, before the parent router's effect. Reattaching on route
    // or menu changes would move this listener behind the router's listener.
    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("popstate", onPopState, true);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return transition?.from === pathname ? transition : null;
}
