"use client";

import { useEffect, useRef, useState } from "react";
import { useEntryLoading } from "../../../../components/entry-loading";
import { useProjectArrival } from "./project-arrival";
import styles from "./genesis.module.css";

export default function GenesisVideo() {
  const { ready, videoSource } = useEntryLoading();
  const arrival = useProjectArrival();
  const videoRef = useRef(null);
  const [playback, setPlayback] = useState("loading");

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
      // Retain the rendered video through buffering and loop seeks.
      if (presented) return;
      cancelFrame();
      if (video.requestVideoFrameCallback) {
        frameCallback = video.requestVideoFrameCallback(() => {
          frameCallback = undefined;
          revealFrame();
        });
      } else {
        // Older browsers still need a paint between playback and the reveal.
        paintFrame = requestAnimationFrame(() => {
          paintFrame = requestAnimationFrame(revealFrame);
        });
      }
    };

    const showPoster = () => {
      cancelFrame();
      setPlayback("error");
      // A failed video should not trap the entire page behind its loader.
      ready("video-frame");
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", showPoster);
    if (video.error) showPoster();
    else {
      // The initial site loader already downloaded the complete local source.
      // Decode behind the closed video mask before its entrance starts.
      const play = () => video.play().catch(() => {
        if (disposed || video.error) return;
        cancelFrame();
        // A browser that blocks playback must leave a usable play control.
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
            poster="/images/genesis-poster.jpg"
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
