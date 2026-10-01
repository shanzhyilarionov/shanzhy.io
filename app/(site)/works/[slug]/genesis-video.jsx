"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEntryLoading } from "../../../../components/entry-loading";
import { useProjectArrival } from "./project-arrival";
import styles from "./genesis.module.css";

export default function GenesisVideo() {
  const { ready, videoSource } = useEntryLoading();
  const arrival = useProjectArrival();
  const videoRef = useRef(null);
  const [playback, setPlayback] = useState("loading");

  useLayoutEffect(() => {
    if (playback !== "loading") arrival?.markMediaReady();
  }, [arrival, playback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!videoSource) return;
    let disposed = false;
    let presented = false;
    let frameCallback;
    let paintFrame;
    let playTimer;

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
      ready("video-frame");
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
      ready("video-frame");
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", showPoster);
    if (video.error) showPoster();
    else {
      const play = () => video.play().catch(() => {
        if (disposed || video.error) return;
        cancelFrame();
        setPlayback("blocked");
        ready("video-frame");
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
      cancelFrame();
      video.pause();
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", showPoster);
    };
  }, [arrival, ready, videoSource]);

  return (
    <div className={styles.videoFrame} data-project-media data-preparing={playback === "loading"}>
      <div className={styles.videoMask}>
        <div className={styles.video}>
          <video
            ref={videoRef}
            className={styles.videoElement}
            data-ready={playback === "playing" || playback === "blocked"}
            src={videoSource ?? undefined}
            poster="/images/genesis.jpg"
            width="1600"
            height="900"
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
