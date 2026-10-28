"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { preloadGenesisVideo, preloadRouteImages, waitForVideoBuffer } from "../../../../components/preload-assets";
import { useEntryLoading } from "../../../../components/entry-loading";
import { useProjectArrival } from "./project-detail";
import styles from "./project.module.css";

export default function GenesisVideo({ project }) {
  const arrival = useProjectArrival();
  const { pending: entryPending } = useEntryLoading();
  const videoHostRef = useRef(null);
  const videoRef = useRef(null);
  const [bufferSettled, setBufferSettled] = useState(false);
  const [posterReady, setPosterReady] = useState(false);
  const [playback, setPlayback] = useState("loading");

  useLayoutEffect(() => {
    if (posterReady || playback !== "loading") arrival?.markMediaReady();
  }, [arrival, playback, posterReady]);

  useEffect(() => {
    let disposed = false;
    preloadRouteImages("/works/genesis").then(() => {
      if (!disposed) setPosterReady(true);
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    const host = videoHostRef.current;
    const video = preloadGenesisVideo();
    const controller = new AbortController();
    videoRef.current = video;
    video.pause();
    if (video.readyState >= 1 && video.currentTime !== 0) video.currentTime = 0;
    video.className = styles.videoElement;
    video.width = project.width;
    video.height = project.height;
    video.controls = false;
    video.dataset.ready = "false";
    host.append(video);
    let disposed = false;
    let presented = false;
    let frameCallback;
    let paintFrame;

    const cancelFrame = () => {
      if (frameCallback !== undefined) {
        video.cancelVideoFrameCallback(frameCallback);
        frameCallback = undefined;
      }
      cancelAnimationFrame(paintFrame);
    };

    const revealFrame = () => {
      if (
        disposed || video.paused ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) return;
      presented = true;
      setPlayback("playing");
    };

    const onPlaying = () => {
      if (presented) return;
      cancelFrame();
      if (video.requestVideoFrameCallback) {
        frameCallback = video.requestVideoFrameCallback(() => {
          frameCallback = undefined;
          revealFrame();
        });
      } else {
        paintFrame = requestAnimationFrame(() => {
          paintFrame = requestAnimationFrame(revealFrame);
        });
      }
    };

    const showPoster = () => {
      cancelFrame();
      setPlayback("error");
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", showPoster);
    if (video.error) showPoster();
    waitForVideoBuffer(video, { signal: controller.signal }).then(() => {
      if (!disposed) setBufferSettled(true);
    });

    return () => {
      disposed = true;
      controller.abort();
      cancelFrame();
      video.pause();
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", showPoster);
      if (video.parentNode === host) video.remove();
      videoRef.current = null;
    };
  }, [project.height, project.width]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || entryPending || !bufferSettled) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      video.play().catch((error) => {
        if (!disposed && !video.error && error.name !== "AbortError") setPlayback("blocked");
      });
    }, arrival ? Math.max(0, 900 - (performance.now() - arrival.startedAt)) : 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      video.pause();
    };
  }, [arrival, bufferSettled, entryPending]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.dataset.ready = String(playback === "playing" || playback === "blocked");
    video.controls = playback === "blocked";
  }, [playback]);

  return (
    <div
      className={[styles.videoFrame, project.cover ? styles.cover : ""].filter(Boolean).join(" ")}
      data-project-media
      data-project-crop={project.crop ? "true" : undefined}
    >
      <div className={styles.videoMask}>
        <div ref={videoHostRef} className={styles.video} />
      </div>
    </div>
  );
}
