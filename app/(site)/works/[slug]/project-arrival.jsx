"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { arriveProject, getProjectTransition } from "../project-transition";

const ProjectArrivalContext = createContext(null);

export function useProjectArrival() {
  return useContext(ProjectArrivalContext);
}

export default function ProjectArrival({ children }) {
  const containerRef = useRef(null);
  const [transition] = useState(getProjectTransition);

  useLayoutEffect(() => {
    if (!transition) return;
    const container = containerRef.current;
    const elapsed = performance.now() - transition.startedAt;
    container.style.setProperty("--project-enter-delay", `${700 - elapsed}ms`);
    container.style.setProperty("--project-media-delay", `${Math.max(0, 900 - elapsed)}ms`);
    return arriveProject(
      transition,
      container.querySelector("[data-project-media]"),
    );
  }, [transition]);

  return (
    <ProjectArrivalContext.Provider value={transition}>
      <div ref={containerRef} style={{ display: "contents" }}>
        {children}
      </div>
    </ProjectArrivalContext.Provider>
  );
}
