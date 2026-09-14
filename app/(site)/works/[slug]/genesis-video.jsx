"use client";

import { useEffect, useRef, useState } from "react";
import { useEntryLoading } from "../../../../components/entry-loading";
import { getGenesisVideoSource, stopVideoWarmup } from "../../../../components/preload-assets";
import styles from "./genesis.module.css";

export default function GenesisVideo() {
  const { pending, ready } = useEntryLoading();
  const [source] = useState(getGenesisVideoSource);
  const videoRef = useRef(null);
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    stopVideoWarmup();
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
      ready("video");
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

    const handleError = () => {
      showPoster();
      ready("video");
    };

    const readyEvents = ["loadeddata", "playing", "seeked"];
    const resetEvents = ["seeking", "emptied"];
    video.addEventListener("error", handleError);
    readyEvents.forEach((event) => video.addEventListener(event, revealFrame));
    resetEvents.forEach((event) => video.addEventListener(event, showPoster));
    revealFrame();
    if (video.error) handleError();

    return () => {
      cancelFrame();
      video.removeEventListener("error", handleError);
      readyEvents.forEach((event) => video.removeEventListener(event, revealFrame));
      resetEvents.forEach((event) => video.removeEventListener(event, showPoster));
    };
  }, [ready]);

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
            src={source}
            poster="/images/genesis-poster.jpg"
            width="1600"
            height="900"
            autoPlay={!pending}
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
