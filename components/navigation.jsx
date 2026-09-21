"use client";

import Link from "next/link";
import Chrome, { Brand } from "./chrome";
import RollingText from "./rolling-text";
import { useHoverEnabled } from "./hover-boundary";
import { warmRouteAssets } from "./preload-assets";
import styles from "./navigation.module.css";

const links = [
  { href: "/", label: "Home" },
  { href: "/works", label: "Works" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

/**
 * The full-screen navigation panel.
 *
 * It knows nothing about routing: the shell drives it through `phase` and
 * hears back through `onLeave`, which takes a destination or nothing at all
 * when the panel should simply close.
 *
 * `enterSlide` and `exitSlide` pick how the panel arrives and how it leaves:
 * travelling, over the black home page, or merely fading, over a white one.
 * They are separate because a panel that faded in over contact still has to
 * slide away over home.
 *
 * `chrome` asks for a copy of the wordmark and button — only ever true over
 * home, whose own chrome is white on black and therefore has to stay
 * underneath; everywhere else the page's chrome sits above the panel and this
 * would only duplicate it.
 */
export default function Navigation({
  phase,
  enterSlide,
  exitSlide,
  chrome,
  onToggle,
  onLeave,
}) {
  const open = phase !== "closed";
  const hoverEnabled = useHoverEnabled();

  const className = [
    styles.navigation,
    hoverEnabled ? styles.hoverEnabled : "",
    enterSlide ? styles.enterSlide : styles.enterFade,
    exitSlide ? styles.exitSlide : styles.exitFade,
    open ? styles.open : "",
    /* Everything past `open` keeps the contents off the screen. */
    open && phase !== "open" ? styles.exiting : "",
    phase === "leaving" || phase === "waiting" ? styles.leaving : "",
    phase === "closing" ? styles.closing : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={className} aria-hidden={!open}>
      {/* Held still against the panel's travel, so only the edge moves. */}
      <div className={styles.stage}>
        {chrome && (
          <Chrome
            className={styles.chrome}
            left={
              <Brand
                onNavigate={(event) => {
                  event.preventDefault();
                  onToggle();
                }}
              />
            }
            right={
              <span className={styles.menuControl}>
                <RollingText
                  type="button"
                  label="Close"
                  aria-label="Close navigation"
                  onClick={onToggle}
                />
              </span>
            }
          />
        )}

        <nav className={styles.list} aria-label="Main navigation">
          {links.map((link) => (
            <span className={styles.item} key={link.href}>
              <Link
                className={styles.link}
                href={link.href}
                prefetch={open ? null : false}
                onPointerEnter={() => warmRouteAssets(link.href)}
                onFocus={() => warmRouteAssets(link.href)}
                onTouchStart={() => warmRouteAssets(link.href)}
                onClick={(event) => {
                  event.preventDefault();
                  onLeave(link.href);
                }}
              >
                <span className={styles.label}>{link.label}</span>
              </Link>
            </span>
          ))}
        </nav>
      </div>
    </section>
  );
}
