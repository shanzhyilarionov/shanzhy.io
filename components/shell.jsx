"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Chrome, { Brand, HomeTitle } from "./chrome";
import Navigation from "./navigation";
import RollingText from "./rolling-text";
import { HoverBoundary } from "./hover-boundary";
import { SceneAnimationPauseProvider } from "./scene-animation-context";
import styles from "./shell.module.css";

/* Mirrors --motion-panel, --motion-content and --motion-overlap in globals.css. */
const PANEL_MS = 1000;
const CONTENT_MS = 500;
const OVERLAP_MS = 300;

/** How long a close takes, contents and panel together. */
const closeMs = (slide) =>
  CONTENT_MS + (slide ? PANEL_MS - OVERLAP_MS : CONTENT_MS);

/** What the right-hand button says when the panel is down. */
function restingLabel(path) {
  return path === "/" ? "Click to start" : "Menu";
}

export default function Shell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isWorks = pathname === "/works";
  const isGenesis = pathname === "/works/genesis";

  /**
   * Menu route transitions run through the navigation panel.
   * Because the panel is opaque, the page swap itself is
   * never seen:
   *
   *   open      the panel arrives, then its contents arrive
   *   closing   the contents leave, then the panel leaves after them
   *   leaving   the contents leave; the panel holds still, covering the swap
   *   waiting   the route has been pushed; the panel is still covering it
   *
   * The panel travels over home, which is black, and merely fades over a white
   * page, where fading is indistinguishable from the page underneath fading
   * out in place. Which of the two it does is fixed when each leg starts, so a
   * panel that faded in over contact can still slide away over home.
   */
  const [phase, setPhase] = useState("closed");
  const [target, setTarget] = useState(null);
  const [covered, setCovered] = useState(false);
  const [enterSlide, setEnterSlide] = useState(false);
  const [exitSlide, setExitSlide] = useState(false);
  /* Home waits for the panel to be completely gone before it begins. */
  const [enterDelay, setEnterDelay] = useState(0);

  /*
   * The route we asked for has arrived. Adjusting state during render rather
   * than in an effect means the new page is never painted while the panel is
   * still in its old state.
   *
   * Going anywhere white, the panel just drops and the page plays its own
   * entrance. Going home, the panel closes over it properly first.
   */
  if ((phase === "leaving" || phase === "waiting") && pathname === target) {
    setPhase(exitSlide ? "closing" : "closed");
    setTarget(null);
  }

  useEffect(() => {
    const after = (ms, next) => {
      const timer = window.setTimeout(next, ms);
      return () => window.clearTimeout(timer);
    };

    if (phase === "open") {
      /* Fully covered: nothing behind the panel is worth drawing. */
      return after(enterSlide ? PANEL_MS : CONTENT_MS, () => setCovered(true));
    }

    if (phase === "leaving" && target !== "/") {
      return after(CONTENT_MS, () => {
        setPhase("waiting");
        router.push(target);
      });
    }

    if (phase === "closing") {
      /* Both legs are CSS, so this only has to know when they are over. */
      return after(closeMs(exitSlide), () => setPhase("closed"));
    }

    return undefined;
  }, [phase, target, enterSlide, exitSlide, router]);

  /** Leave the panel, by way of `href` if that is somewhere new. */
  const leaveNavigation = (href = null) => {
    if (phase !== "open") {
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
    setEnterDelay(next === "/" ? closeMs(true) : 0);
    setPhase("leaving");

    /*
     * Home has to be mounted behind the panel before the panel starts moving,
     * because the close is what uncovers it. Anywhere white is uncovered by
     * the panel simply dropping, so that push can wait until the contents are
     * out of the way.
     */
    if (next === "/") {
      router.push(next);
    }
  };

  const toggleNavigation = () => {
    if (phase === "closed") {
      setEnterSlide(isHome);
      setPhase("open");
    } else if (phase === "open") {
      leaveNavigation();
    }
  };

  /*
   * The chrome is mounted once and never moves. On every page but home it sits
   * *above* the panel, so the panel comes and goes without disturbing it and
   * its button is the one that works the panel. Over home it would be white on
   * white, so there it sits below instead, keeps saying "Click to start", and
   * the panel brings its own copy for the duration.
   *
   * Its label follows the *destination*, not the page we happen to be standing
   * on. Reading it off `pathname` meant that leaving home for a white page the
   * button said "Click to start" until the route landed, and then had to cross
   * over a second time — a flash of the wrong word, first under the panel and
   * then out in the open.
   */
  const destination = target ?? pathname;
  const chromeLabel =
    destination === "/"
      ? "Click to start"
      : phase === "open"
        ? "Close"
        : restingLabel(destination);

  /* Home's entrance belongs to the first paint alone, hence the frozen read. */
  const [openedOnHome] = useState(isHome);

  return (
    <SceneAnimationPauseProvider paused={covered}>
      {/* Carries --enter-delay down to the home page and its title. */}
      <HoverBoundary
        viewKey={`${pathname}:${phase}`}
        className={styles.shell}
        style={{ "--enter-delay": `${enterDelay}ms` }}
      >
        <Chrome
          className={[
            isHome ? styles.chromeOnDark : styles.chromeAbovePanel,
            isGenesis ? styles.projectChrome : "",
            openedOnHome ? styles.chromeEntering : "",
          ]
            .filter(Boolean)
            .join(" ")}
          left={isHome ? <HomeTitle key={pathname} /> : <Brand />}
          right={
            <span className={isWorks || isGenesis ? styles.worksMenuEntering : ""}>
              <RollingText
                /* On the way home the new label waits for the title. */
                style={{ "--label-delay": `${enterDelay}ms` }}
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
            pathname === "/about" ||
            pathname === "/contact"
              ? ""
              : styles.contentEntering,
          ]
            .filter(Boolean)
            .join(" ")}
          key={pathname}
        >
          {children}
        </div>

        <Navigation
          phase={phase}
          enterSlide={enterSlide}
          exitSlide={exitSlide}
          chrome={isHome}
          chromeLabel={target && target !== "/" ? restingLabel(target) : "Close"}
          onToggle={toggleNavigation}
          onLeave={leaveNavigation}
        />
      </HoverBoundary>
    </SceneAnimationPauseProvider>
  );
}
