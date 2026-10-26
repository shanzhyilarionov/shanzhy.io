"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GENESIS_VIDEO, preloadGenesisVideo, preloadRouteImages } from "../../../../components/preload-assets";
import { useProjectArrival } from "./project-detail";
import styles from "./project.module.css";

export default function GenesisVideo({ project }) {
  const arrival = useProjectArrival();
  const videoRef = useRef(null);
  const [videoSource, setVideoSource] = useState(null);
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
    preloadGenesisVideo().then(
      (source) => { if (!disposed) setVideoSource(source); },
      () => { if (!disposed) setVideoSource(GENESIS_VIDEO); },
    );
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!videoSource) return;
    let disposed = false;
    let presented = false;
    let frameCallback;
    let paintFrame;
    let playTimer;
    let frameTimer;

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
      window.clearTimeout(frameTimer);
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
      window.clearTimeout(frameTimer);
      cancelFrame();
      setPlayback("error");
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", showPoster);
    frameTimer = window.setTimeout(showPoster, 8000);
    if (video.error) showPoster();
    else {
      const play = () => video.play().catch(() => {
        if (disposed || video.error) return;
        cancelFrame();
        window.clearTimeout(frameTimer);
        setPlayback("blocked");
      });
      if (arrival) {
        playTimer = window.setTimeout(play, Math.max(0, 900 - (performance.now() - arrival.startedAt)));
      } else {
        play();
      }
    }

    return () => {
      disposed = true;
      window.clearTimeout(playTimer);
      window.clearTimeout(frameTimer);
      cancelFrame();
      video.pause();
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", showPoster);
    };
  }, [arrival, videoSource]);

  return (
    <div
      className={[styles.videoFrame, project.cover ? styles.cover : ""].filter(Boolean).join(" ")}
      data-project-media
      data-project-crop={project.crop ? "true" : undefined}
    >
      <div className={styles.videoMask}>
        <div className={styles.video}>
          <video
            ref={videoRef}
            className={styles.videoElement}
            data-ready={playback === "playing" || playback === "blocked"}
            src={videoSource ?? undefined}
            poster="/images/genesis.jpg"
            width={project.width}
            height={project.height}
            controls={playback === "blocked"}
            muted
            loop
            playsInline
            preload="auto"
            aria-label="Genesis ecosystem simulation demo"
          />
        </div>
      </div>
    </div>
  );
}
