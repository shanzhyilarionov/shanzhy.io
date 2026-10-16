"use client";

import { createContext, useContext } from "react";

const PageExitContext = createContext({ exiting: false, settleMs: 0 });
const SceneAnimationPausedContext = createContext(false);
const SceneChromeReadyContext = createContext(() => {});
const SceneEntranceContext = createContext("unfold");
const ScreenshotsContext = createContext(null);

export function ScreenshotsProvider({ onOpen, children }) {
  return (
    <ScreenshotsContext.Provider value={onOpen}>
      {children}
    </ScreenshotsContext.Provider>
  );
}

export function useScreenshots() {
  return useContext(ScreenshotsContext);
}

export function PageExitProvider({ exiting, settleMs = 0, children }) {
  return (
    <PageExitContext.Provider value={{ exiting, settleMs }}>
      {children}
    </PageExitContext.Provider>
  );
}

export function usePageExiting() {
  return useContext(PageExitContext).exiting;
}

export function usePageExitSettleMs() {
  return useContext(PageExitContext).settleMs;
}

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
