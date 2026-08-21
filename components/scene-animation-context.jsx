"use client";

import { createContext, useContext } from "react";

const SceneAnimationPausedContext = createContext(false);

export function SceneAnimationPauseProvider({ paused, children }) {
  return (
    <SceneAnimationPausedContext.Provider value={paused}>
      {children}
    </SceneAnimationPausedContext.Provider>
  );
}

export function useSceneAnimationPaused() {
  return useContext(SceneAnimationPausedContext);
}
