"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  useSceneAnimationPaused,
  useSceneChromeReady,
  useSceneEntrance,
} from "../scene-animation-context";
import { useEntryLoading } from "../entry-loading";
import {
  buildEdges4D,
  buildFaces4D,
  buildVertices4D,
  clamp,
} from "./geometry.mjs";
import { createRenderer } from "./renderer.js";
import { createHomeScene, ENTRANCE_DURATION, CHROME_REVEAL_TIME } from "./entrance.js";
import { createScene } from "./scene.js";
import styles from "./tesseract.module.css";

const RETURN_ENTRANCE_DURATION = 1;

export default function GlassTesseract() {
  const { ready } = useEntryLoading();
  const paused = useSceneAnimationPaused();
  const onChromeReady = useSceneChromeReady();
  const entrance = useSceneEntrance();
  const returning = entrance === "rise";
  const pausedRef = useRef(paused);
  const animationControlRef = useRef(null);
  const canvasRef = useRef(null);

  const vertices = useMemo(() => buildVertices4D(), []);
  const edges = useMemo(() => buildEdges4D(vertices), [vertices]);
  const faces = useMemo(() => buildFaces4D(vertices), [vertices]);

  useLayoutEffect(() => {
    pausedRef.current = paused;
    animationControlRef.current?.sync();
  }, [paused]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const entranceDuration = returning ? RETURN_ENTRANCE_DURATION : ENTRANCE_DURATION;
    const createFrame = returning ? createScene : createHomeScene;
    let renderer = createRenderer(canvas);
    let frameId = 0;
    let pointerFrameId = 0;
    let running = false;
    let elapsedTime = 0;
    let entranceTime = 0;
    let chromeReported = false;
    let lastFrameTime = null;

    const temporalState = { pointer: { x: 0, y: 0 } };
    const viewport = { width: 1, height: 1 };
    const pointer = { x: 0, y: 0 };
    let pointerOrigin = null;
    let bounds = canvas.getBoundingClientRect();

    function renderFrame(time, deltaTime) {
      if (!chromeReported && (returning || entranceTime >= CHROME_REVEAL_TIME || !renderer)) {
        chromeReported = true;
        onChromeReady?.();
      }
      if (!renderer) return;

      const scene = createFrame(
        vertices,
        edges,
        faces,
        viewport,
        pointer,
        entranceTime + time,
        deltaTime,
        temporalState,
      );
      canvas.style.opacity = String(scene.opacity ?? 1);
      renderer.render(scene);
    }

    const measure = () => {
      bounds = canvas.getBoundingClientRect();
      viewport.width = Math.max(bounds.width, 1);
      viewport.height = Math.max(bounds.height, 1);
    };

    const handleViewportChange = () => {
      measure();
      if (!running) renderFrame(elapsedTime, 1 / 60);
    };

    const handlePointerMove = (event) => {
      if (pausedRef.current || document.hidden || entranceTime < entranceDuration) return;
      if (
        event.pointerType === "mouse" &&
        event.movementX === 0 && event.movementY === 0
      ) {
        return;
      }

      if (!pointerOrigin) {
        pointerOrigin = { x: event.clientX, y: event.clientY };
        return;
      }

      const width = bounds.width || 1;
      const height = bounds.height || 1;
      pointer.x = clamp(((event.clientX - pointerOrigin.x) / width) * 2, -1, 1);
      pointer.y = clamp(((event.clientY - pointerOrigin.y) / height) * 2, -1, 1);

      if (!running && !pointerFrameId) {
        pointerFrameId = requestAnimationFrame(() => {
          pointerFrameId = 0;
          renderFrame(elapsedTime, 1 / 60);
        });
      }
    };

    const handleContextLost = (event) => {
      event.preventDefault();
      renderer?.destroy?.();
      renderer = null;
    };

    const handleContextRestored = () => {
      renderer = createRenderer(canvas);
      lastFrameTime = null;
      if (!running) renderFrame(elapsedTime, 1 / 60);
    };

    const animate = (now) => {
      if (!running) return;

      const visibleDelta = lastFrameTime == null ? 0 : Math.max(0, (now - lastFrameTime) / 1000);
      const deltaTime =
        lastFrameTime == null
          ? 1 / 60
          : clamp((now - lastFrameTime) / 1000, 1 / 240, 0.05);

      lastFrameTime = now;
      if (entranceTime < entranceDuration) {
        entranceTime = Math.min(entranceDuration, entranceTime + visibleDelta);
        if (returning && entranceTime === entranceDuration) measure();
      } else {
        elapsedTime += deltaTime;
      }
      renderFrame(elapsedTime, deltaTime);
      frameId = requestAnimationFrame(animate);
    };

    const syncAnimation = () => {
      const shouldRun =
        Boolean(renderer) && !pausedRef.current && !document.hidden;

      if (shouldRun === running) {
        if (!running) renderFrame(elapsedTime, 1 / 60);
        return;
      }

      running = shouldRun;
      lastFrameTime = null;

      if (running) {
        frameId = requestAnimationFrame(animate);
      } else {
        cancelAnimationFrame(frameId);
        renderFrame(elapsedTime, 1 / 60);
      }
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(handleViewportChange);

    measure();
    renderFrame(elapsedTime, 1 / 60);
    ready("scene");
    animationControlRef.current = { sync: syncAnimation };
    syncAnimation();

    resizeObserver?.observe(canvas);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    document.addEventListener("visibilitychange", syncAnimation);
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    return () => {
      running = false;
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(pointerFrameId);
      animationControlRef.current = null;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", syncAnimation);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      renderer?.destroy();
    };
  }, [edges, faces, vertices, ready, onChromeReady, returning]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={returning ? styles.returning : undefined}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        background: "transparent",
        "--return-duration": `${RETURN_ENTRANCE_DURATION}s`,
      }}
    />
  );
}
