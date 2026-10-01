"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Chrome, { Brand, HomeTitle } from "./chrome";
import Navigation from "./navigation";
import RollingText from "./rolling-text";
import { HoverBoundary } from "./hover-boundary";
import { SceneAnimationPauseProvider } from "./scene-animation-context";
import { PageExitProvider } from "./page-exit-context";
import { useHistoryExit } from "./use-history-exit";
import { useEntryLoading } from "./entry-loading";
import { warmRouteAssets } from "./preload-assets";
import { startProjectReturn } from "../app/(site)/works/project-transition";
import styles from "./shell.module.css";

const PANEL_MS = 1000;
const CONTENT_MS = 500;
const OVERLAP_MS = 300;

const closeMs = (slide) =>
  CONTENT_MS + (slide ? PANEL_MS - OVERLAP_MS : CONTENT_MS);

export default function Shell({ children }) {
  const { pending: entryPending } = useEntryLoading();
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isWorks = pathname === "/works";
  const isGenesis = pathname === "/works/genesis";
  const isRevealPage = pathname === "/about" || pathname === "/contact";
  const hasPageExit = !isHome;
  const pageExitMs = isWorks ? CONTENT_MS * 2 : CONTENT_MS;
  const chromeEnterDelayMs = isWorks || isGenesis ? CONTENT_MS : 0;
  const menuEnterDelayMs = isWorks ? 0 : chromeEnterDelayMs;

  const [phase, setPhase] = useState("closed");
  const [target, setTarget] = useState(null);
  const [covered, setCovered] = useState(false);
  const [enterSlide, setEnterSlide] = useState(false);
  const [exitSlide, setExitSlide] = useState(false);
  const [homeRevealing, setHomeRevealing] = useState(false);
  const [homeEntranceWaiting, setHomeEntranceWaiting] = useState(false);
  const [homeEntrance, setHomeEntrance] = useState("unfold");
  const [homeChromeReady, setHomeChromeReady] = useState(false);
  const revealHomeChrome = useCallback(() => setHomeChromeReady(true), []);
  const [viewPath, setViewPath] = useState(pathname);
  const [chromeEntering, setChromeEntering] = useState(true);
  const [menuEntry, setMenuEntry] = useState({ key: 0, animate: false });
  const [projectReturning, setProjectReturning] = useState(false);
  const scenePaused = covered || entryPending || homeEntranceWaiting;
  const homeAnimationPaused =
    covered || entryPending || (homeEntrance === "rise" && !homeChromeReady);
  const menuVisible = ["open", "closing", "leaving", "waiting"].includes(phase);
  const returningToWorks = isGenesis && !menuVisible && target === "/works";
  const routeExitMs = returningToWorks ? 0 : isHome && !menuVisible ? PANEL_MS : pageExitMs;
  const historyExit = useHistoryExit(pathname, (to) =>
    isGenesis && !menuVisible && to === "/works" ? 0 : routeExitMs,
  );
  const historyExiting = Boolean(historyExit);
  const destination = historyExit?.to ?? target?.split(/[?#]/)[0] ?? pathname;
  const pageExiting =
    hasPageExit && (historyExiting || Boolean(target));
  const leavingForHome = pageExiting && destination === "/";
  const leavingHome =
    isHome && !menuVisible && (historyExiting || Boolean(target));
  const projectReturnStarting = isGenesis && pageExiting && destination === "/works" && !menuVisible;
  if (projectReturnStarting && !projectReturning) setProjectReturning(true);

  useLayoutEffect(() => {
    if (!projectReturnStarting) return;
    const media = document.querySelector("[data-project-media]");
    if (!media) return;
    const transition = startProjectReturn(media.closest("main"), media, "genesis");
    transition.onComplete = () => setProjectReturning(false);
  }, [projectReturnStarting]);

  if (viewPath !== pathname) {
    setChromeEntering(viewPath === "/" && !menuVisible);
    setViewPath(pathname);
    setMenuEntry({
      key: menuEntry.key + (menuVisible ? 1 : 0),
      animate: menuVisible,
    });
    setPhase("closed");
    setTarget(null);
    setCovered(false);
    setHomeRevealing(isHome);
    setHomeEntranceWaiting(isHome);
    setHomeEntrance(isHome ? "rise" : "unfold");
    setHomeChromeReady(false);
  }

  useEffect(() => {
    const after = (ms, next) => {
      const timer = window.setTimeout(next, ms);
      return () => window.clearTimeout(timer);
    };

    if (homeRevealing) {
      if (!homeChromeReady) return undefined;
      return after(PANEL_MS - OVERLAP_MS, () =>
        setHomeEntranceWaiting(false),
      );
    }

    if (historyExiting) return undefined;

    if (phase === "open") {
      return after(enterSlide ? PANEL_MS : CONTENT_MS, () => setCovered(true));
    }

    if (phase === "leaving" || phase === "departing") {
      return after(routeExitMs, () => {
        setPhase(phase === "leaving" ? "waiting" : "routing");
        router.push(target);
      });
    }

    if (phase === "closing") {
      return after(closeMs(exitSlide), () => setPhase("closed"));
    }

    return undefined;
  }, [
    phase,
    target,
    enterSlide,
    exitSlide,
    routeExitMs,
    historyExiting,
    homeRevealing,
    homeChromeReady,
    router,
  ]);

  const leaveNavigation = (href = null) => {
    if (phase !== "open" || historyExiting) {
      return;
    }

    const next = href && href !== pathname ? href : null;
    const home = next ? next.split(/[?#]/)[0] === "/" : isHome;

    setCovered(false);
    setExitSlide(home);

    if (!next) {
      setPhase("closing");
      return;
    }

    router.prefetch(next);
    warmRouteAssets(next);
    setTarget(next);
    setPhase("leaving");
  };

  const toggleNavigation = () => {
    if (historyExiting || homeRevealing) return;

    if (phase === "closed") {
      setEnterSlide(isHome);
      setPhase("open");
    } else if (phase === "open") {
      leaveNavigation();
    }
  };

  const followPageLink = (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    ) {
      return;
    }

    const link = event.target.closest("a[href]");
    if (
      !link ||
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self")
    ) {
      return;
    }
    const url = new URL(link.href, window.location.href);
    if (
      url.origin !== window.location.origin ||
      url.pathname === pathname ||
      (!isHome && url.pathname !== "/" && !(isGenesis && url.pathname === "/works"))
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (historyExiting || homeRevealing) return;

    const href = `${url.pathname}${url.search}${url.hash}`;
    if (phase === "open") {
      leaveNavigation(href);
    } else if (phase === "closed") {
      router.prefetch(href);
      warmRouteAssets(href);
      setTarget(href);
      setPhase("departing");
    }
  };

  const navigationPhase = menuVisible
    ? historyExiting ? "leaving" : phase
    : "closed";
  const navigationLeaving =
    navigationPhase === "leaving" || navigationPhase === "waiting";
  const chromeLabel =
    isHome
      ? "Click here to explore"
      : navigationPhase === "open" || navigationLeaving
        ? "Close"
        : "Menu";

  return (
    <SceneAnimationPauseProvider
      paused={scenePaused}
      onChromeReady={revealHomeChrome}
      entrance={homeEntrance}
    >
      <HoverBoundary
        viewKey={`${pathname}:${phase}`}
        blocked={projectReturning}
        className={styles.shell}
        style={{
          "--chrome-enter-delay": `${chromeEnterDelayMs}ms`,
          "--menu-enter-delay": `${menuEnterDelayMs}ms`,
          "--chrome-exit-duration": `${navigationLeaving ? CONTENT_MS : pageExitMs}ms`,
          "--home-animation-play-state": homeAnimationPaused ? "paused" : "running",
        }}
        onClickCapture={followPageLink}
      >
        <Chrome
          key={isHome ? "home" : "page"}
          inert={leavingHome || (isHome && !homeChromeReady)}
          className={[
            isHome ? styles.chromeOnDark : styles.chromeAbovePanel,
            isHome
              ? homeChromeReady
                ? homeEntrance === "rise" ? styles.homeChromeReturning : styles.homeChromeEntering
                : styles.homeChromeWaiting
              : chromeEntering ? styles.chromeEntering : "",
            leavingForHome ? styles.chromeLeavingHome : "",
          ]
            .filter(Boolean)
            .join(" ")}
          left={isHome ? <HomeTitle key={pathname} /> : <Brand />}
          right={
            <span
              key={isHome ? "home" : menuEntry.key}
              className={
                isHome
                  ? undefined
                  : navigationLeaving && !leavingForHome
                    ? styles.menuLeaving
                    : menuEntry.animate
                      ? styles.menuEntering
                      : undefined
              }
            >
              <RollingText
                animateLabelChange={!navigationLeaving}
                type="button"
                label={chromeLabel}
                aria-label={
                  chromeLabel === "Close"
                    ? "Close navigation"
                    : "Open navigation"
                }
                onClick={toggleNavigation}
              />
            </span>
          }
        />

        <div
          className={[
            styles.content,
            isHome ||
            isWorks ||
            isGenesis ||
            isRevealPage
              ? ""
              : styles.contentEntering,
          ]
            .filter(Boolean)
            .join(" ")}
          key={pathname}
          inert={
            homeRevealing ||
            leavingHome ||
            (hasPageExit && (phase !== "closed" || historyExiting))
          }
        >
          <PageExitProvider exiting={pageExiting}>
            {children}
          </PageExitProvider>
        </div>

        <Navigation
          phase={navigationPhase}
          enterSlide={enterSlide}
          exitSlide={exitSlide}
          chrome={isHome}
          onToggle={toggleNavigation}
          onLeave={leaveNavigation}
        />

        {leavingHome && <div className={styles.homeCover} aria-hidden="true" />}
        {homeRevealing && (
          <div
            className={styles.homeReveal}
            aria-hidden="true"
            onAnimationEnd={() => {
              setHomeRevealing(false);
              setHomeEntranceWaiting(false);
            }}
          />
        )}
      </HoverBoundary>
    </SceneAnimationPauseProvider>
  );
}
