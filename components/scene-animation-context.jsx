"use client";

import { createContext, useContext } from "react";

const SceneAnimationPausedContext = createContext(false);
const SceneChromeReadyContext = createContext(() => {});
const SceneEntranceContext = createContext("unfold");

export function SceneAnimationPauseProvider({
  paused,
  onChromeReady,
  entrance = "unfold",
  children,
}) {
  return (
    <SceneAnimationPausedContext.Provider value={paused}>
      <SceneChromeReadyContext.Provider value={onChromeReady}>
        <SceneEntranceContext.Provider value={entrance}>
          {children}
        </SceneEntranceContext.Provider>
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

export function useSceneEntrance() {
  return useContext(SceneEntranceContext);
}
