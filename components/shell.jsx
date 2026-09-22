"use client";

import { useCallback, useEffect, useState } from "react";
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
import styles from "./shell.module.css";

/* Mirrors --motion-panel, --motion-content and --motion-overlap in globals.css. */
const PANEL_MS = 1000;
const CONTENT_MS = 500;
const OVERLAP_MS = 300;

/** How long a close takes, contents and panel together. */
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
  // Works first settles its hover expansion, then closes the image masks.
  const pageExitMs = isWorks ? CONTENT_MS * 2 : CONTENT_MS;
  // Works and Genesis bring new controls in during the second half of entry.
  const chromeEnterDelayMs = isWorks || isGenesis ? CONTENT_MS : 0;

  /**
   * Menu route transitions run through the navigation panel.
   * Because the panel is opaque, the page swap itself is never seen:
   *
   *   open      the panel arrives, then its contents arrive
   *   closing   the contents leave, then the panel leaves after them
   *   leaving   the contents leave; the panel holds still, covering the swap
   *   waiting   the route has been pushed; the panel is still covering it
   *   departing / routing   the same route exit without an open menu
   *
   * The panel travels over home and fades over white pages. Opening it does
   * not trigger a page exit; that belongs to selecting a different route.
   */
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
  const scenePaused = covered || entryPending || homeEntranceWaiting;
  const homeAnimationPaused =
    covered || entryPending || (homeEntrance === "rise" && !homeChromeReady);
  const menuVisible = ["open", "closing", "leaving", "waiting"].includes(phase);
  // Direct departures from home need a full white sweep before the route swaps.
  const routeExitMs = isHome && !menuVisible ? PANEL_MS : pageExitMs;
  const historyExit = useHistoryExit(pathname, routeExitMs);
  const historyExiting = Boolean(historyExit);
  const destination = historyExit?.to ?? target?.split(/[?#]/)[0] ?? pathname;
  const pageExiting =
    hasPageExit && (historyExiting || Boolean(target));
  const leavingForHome = pageExiting && destination === "/";
  const leavingHome =
    isHome && !menuVisible && (historyExiting || Boolean(target));

  /*
   * The route we asked for has arrived. Adjusting state during render rather
   * than in an effect means the new page is never painted while the panel is
   * still in its old state.
   *
   * Every arrival at home gets the same white mask, including history and
   * direct links. Home's entrance overlaps the last 0.3s of that mask.
   */
  if (viewPath !== pathname) {
    setChromeEntering(viewPath === "/" && !menuVisible);
    setViewPath(pathname);
    // Only a departing navigation panel needs a fresh, fading-in Menu.
    // Between white pages, direct links and history keep it mounted.
    setMenuEntry({
      key: menuEntry.key + (menuVisible ? 1 : 0),
      animate: menuVisible,
    });
    const revealHome =
      isHome && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase("closed");
    setTarget(null);
    setCovered(false);
    setHomeRevealing(revealHome);
    setHomeEntranceWaiting(revealHome);
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
      // CSS owns the visible timing; this only resumes the WebGL render loop.
      return after(PANEL_MS - OVERLAP_MS, () =>
        setHomeEntranceWaiting(false),
      );
    }

    // A history traversal takes precedence over a pending menu/link push.
    if (historyExiting) return undefined;

    if (phase === "open") {
      /* Fully covered: nothing behind the panel is worth drawing. */
      return after(enterSlide ? PANEL_MS : CONTENT_MS, () => setCovered(true));
    }

    if (phase === "leaving" || phase === "departing") {
      return after(routeExitMs, () => {
        setPhase(phase === "leaving" ? "waiting" : "routing");
        router.push(target);
      });
    }

    if (phase === "closing") {
      /* Both legs are CSS, so this only has to know when they are over. */
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

  /** Leave the panel, by way of `href` if that is somewhere new. */
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
      (!isHome && url.pathname !== "/")
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
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        router.push(href);
        return;
      }
      setTarget(href);
      setPhase("departing");
    }
  };

  /*
   * White pages share stationary chrome above the panel. Home has its own
   * white-on-black chrome underneath, while the panel brings a dark copy.
   * Switching between home and white pages remounts the chrome so the new
   * entrance starts afresh, even when both use the same fade animation.
   *
   * Close leaves with the navigation contents and stays hidden until the route
   * arrives. A fresh control then fades in with the new page's entrance.
   */
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
        className={styles.shell}
        style={{
          "--chrome-enter-delay": `${chromeEnterDelayMs}ms`,
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
            /* These pages animate their own contents in. */
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
