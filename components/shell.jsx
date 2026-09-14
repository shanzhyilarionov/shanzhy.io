"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Chrome, { Brand, HomeTitle } from "./chrome";
import Navigation from "./navigation";
import RollingText from "./rolling-text";
import { HoverBoundary } from "./hover-boundary";
import { SceneAnimationPauseProvider } from "./scene-animation-context";
import { PageExitProvider } from "./page-exit-context";
import { useHistoryExit } from "./use-history-exit";
import { useEntryLoading } from "./entry-loading";
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
  // Home's scene and Works' reveals finish after one second.
  const pageEnterMs = isHome || isWorks ? PANEL_MS : CONTENT_MS;

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
  /* Home waits for the panel to be completely gone before it begins. */
  const [enterDelay, setEnterDelay] = useState(0);
  const [homeRevealing, setHomeRevealing] = useState(false);
  const [viewPath, setViewPath] = useState(pathname);
  const [initialEntry, setInitialEntry] = useState(true);
  const [menuEntry, setMenuEntry] = useState({ key: 0, animate: false });
  const menuVisible = ["open", "closing", "leaving", "waiting"].includes(phase);
  const historyExit = useHistoryExit(
    pathname,
    hasPageExit,
    pageExitMs,
  );
  const historyExiting = Boolean(historyExit);
  const destination = historyExit?.to ?? target ?? pathname;
  const pageExiting =
    hasPageExit && (historyExiting || Boolean(target));
  const leavingForHome = pageExiting && destination === "/";

  /*
   * The route we asked for has arrived. Adjusting state during render rather
   * than in an effect means the new page is never painted while the panel is
   * still in its old state.
   *
   * Every arrival at home gets the same white mask, including history and
   * direct links. Home's own entrance waits until that mask has opened.
   */
  if (viewPath !== pathname) {
    setViewPath(pathname);
    setInitialEntry(false);
    // Only a departing navigation panel needs a fresh, fading-in Menu.
    // Direct page links and history keep the existing control mounted.
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
    setEnterDelay(revealHome ? PANEL_MS : 0);
  }

  useEffect(() => {
    const after = (ms, next) => {
      const timer = window.setTimeout(next, ms);
      return () => window.clearTimeout(timer);
    };

    if (homeRevealing) {
      return after(PANEL_MS, () => setHomeRevealing(false));
    }

    // A history traversal takes precedence over a pending menu/link push.
    if (historyExiting) return undefined;

    if (phase === "open") {
      /* Fully covered: nothing behind the panel is worth drawing. */
      return after(enterSlide ? PANEL_MS : CONTENT_MS, () => setCovered(true));
    }

    if (phase === "leaving" || phase === "departing") {
      return after(pageExitMs, () => {
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
    pageExitMs,
    historyExiting,
    homeRevealing,
    router,
  ]);

  /** Leave the panel, by way of `href` if that is somewhere new. */
  const leaveNavigation = (href = null) => {
    if (phase !== "open" || historyExiting) {
      return;
    }

    const next = href && href !== pathname ? href : null;
    const home = next ? next === "/" : isHome;

    setCovered(false);
    setExitSlide(home);

    if (!next) {
      setPhase("closing");
      return;
    }

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

  const followHomeLink = (event) => {
    if (
      isHome ||
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
    if (url.origin !== window.location.origin || url.pathname !== "/") return;

    event.preventDefault();
    event.stopPropagation();
    if (historyExiting || homeRevealing) return;

    if (phase === "open") {
      leaveNavigation("/");
    } else if (phase === "closed") {
      setTarget("/");
      setPhase("departing");
    }
  };

  /*
   * The chrome is mounted once and never moves. On every page but home it sits
   * *above* the panel, so the panel comes and goes without disturbing it and
   * its button is the one that works the panel. Over home it would be white on
   * white, so there it sits below instead, keeps saying "Click here to explore", and
   * the panel brings its own copy for the duration.
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
    <SceneAnimationPauseProvider paused={covered || entryPending}>
      {/* Carries --enter-delay down to the home page and its title. */}
      <HoverBoundary
        viewKey={`${pathname}:${phase}`}
        className={styles.shell}
        style={{
          "--enter-delay": `${enterDelay}ms`,
          "--page-enter-duration": `${pageEnterMs}ms`,
          "--chrome-exit-duration": `${navigationLeaving ? CONTENT_MS : pageExitMs}ms`,
        }}
        onClickCapture={followHomeLink}
      >
        <Chrome
          className={[
            isHome ? styles.chromeOnDark : styles.chromeAbovePanel,
            isHome || initialEntry ? styles.chromeEntering : "",
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

        {homeRevealing && <div className={styles.homeReveal} aria-hidden="true" />}
      </HoverBoundary>
    </SceneAnimationPauseProvider>
  );
}
