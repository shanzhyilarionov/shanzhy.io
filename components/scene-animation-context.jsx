"use client";

import { createContext, useContext } from "react";

const SceneAnimationPausedContext = createContext(false);
const SceneChromeReadyContext = createContext(() => {});

export function SceneAnimationPauseProvider({ paused, onChromeReady, children }) {
  return (
    <SceneAnimationPausedContext.Provider value={paused}>
      <SceneChromeReadyContext.Provider value={onChromeReady}>
        {children}
      </SceneChromeReadyContext.Provider>
    </SceneAnimationPausedContext.Provider>
  );
}

export function useSceneAnimationPaused() {
  return useContext(SceneAnimationPausedContext);
}

export function useSceneChromeReady() {
  return useContext(SceneChromeReadyContext);
}
