"use client";

import { useEffect, useRef, useState } from "react";
import { useEntryLoading } from "../../../../components/entry-loading";
import styles from "./genesis.module.css";

export default function GenesisVideo() {
  const { pending } = useEntryLoading();
  const videoRef = useRef(null);
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    let frameCallback;

    const cancelFrame = () => {
      if (frameCallback !== undefined) {
        video.cancelVideoFrameCallback(frameCallback);
        frameCallback = undefined;
      }
    };

    const revealFrame = () => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      cancelFrame();

      if (video.requestVideoFrameCallback) {
        frameCallback = video.requestVideoFrameCallback(() => {
          frameCallback = undefined;
          setHasFrame(true);
        });
      } else {
        setHasFrame(true);
      }
    };

    // Cover loading and the loop's seek with the matching first frame.
    const showPoster = () => {
      cancelFrame();
      setHasFrame(false);
    };

    const readyEvents = ["loadeddata", "playing", "seeked"];
    const resetEvents = ["seeking", "emptied"];
    video.addEventListener("error", showPoster);
    readyEvents.forEach((event) => video.addEventListener(event, revealFrame));
    resetEvents.forEach((event) => video.addEventListener(event, showPoster));
    revealFrame();
    if (video.error) showPoster();

    return () => {
      cancelFrame();
      video.removeEventListener("error", showPoster);
      readyEvents.forEach((event) => video.removeEventListener(event, revealFrame));
      resetEvents.forEach((event) => video.removeEventListener(event, showPoster));
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (pending) video.pause();
    else video.play().catch(() => {});
  }, [pending]);

  return (
    <div className={styles.videoFrame}>
      <div className={styles.videoMask}>
        <div className={styles.video}>
          <video
            ref={videoRef}
            className={styles.videoElement}
            data-ready={hasFrame}
            src="/videos/genesis.mp4"
            poster="/images/genesis-poster.jpg"
            width="1600"
            height="900"
            autoPlay={!pending}
            muted
            loop
            playsInline
            preload={pending ? "none" : "auto"}
            aria-label="Genesis ecosystem simulation demo"
          />
        </div>
      </div>
    </div>
  );
}
