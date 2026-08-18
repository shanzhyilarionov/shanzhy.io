"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import styles from "./navigation.module.css";

const links = [
  { href: "/", label: "Home" },
  { href: "/works", label: "Works" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Navigation({ open, onClose, onNavigate }) {
  const pathname = usePathname();
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [closeMotion, setCloseMotion] = useState("");
  const [pendingHref, setPendingHref] = useState(null);

  useEffect(() => {
    setClosing(false);
    setPendingHref(null);
  }, [open]);

  const handleClose = () => {
    if (!open || closing) {
      return;
    }
    setCloseMotion("");
    setClosing(true);
  };

  const handleLinkClick = (event, href) => {
    event.preventDefault();
    if (!open || closing) {
      return;
    }
    setPendingHref(href === pathname ? null : href);
    handleClose();
  };

  const finishClose = () => {
    if (!closing) {
      return;
    }

    const href = pendingHref;

    if (href && onNavigate) {
      onNavigate(href);
      return;
    }

    if (href && href !== pathname) {
      router.push(href);
      return;
    }

    setPendingHref(null);
    setClosing(false);
    onClose();
  };

  const closeClassName = [
    styles.closeButton,
    closeMotion === "enter" ? styles.closeEnter : "",
  ]
    .filter(Boolean)
    .join(" ");

  const navigationClassName = [
    styles.navigation,
    open ? styles.open : "",
    closing ? styles.closing : "",
    pendingHref ? styles.navigating : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={navigationClassName}
      aria-hidden={!open}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === "transform" &&
          closing &&
          !pendingHref
        ) {
          finishClose();
        }
      }}
    >
      <button
        className={closeClassName}
        type="button"
        aria-label="Close navigation"
        onClick={handleClose}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") {
            setCloseMotion("enter");
          }
        }}
      >
        <span className={styles.closeMask} aria-hidden="true">
          <span
            className={styles.closeTrack}
            onAnimationEnd={() => {
              if (closeMotion === "enter") {
                setCloseMotion("");
              }
            }}
          >
            <span className={styles.closeLine}>Close</span>
            <span className={styles.closeLine}>Close</span>
            <span className={styles.closeLine}>Close</span>
          </span>
        </span>
      </button>

      <nav className={styles.navigationList} aria-label="Main navigation">
        {links.map((link, index) => (
          <div className={styles.navigationItem} key={link.href}>
            <Link
              href={link.href}
              onClick={(event) => {
                handleLinkClick(event, link.href);
              }}
            >
              <span
                onTransitionEnd={
                  index === links.length - 1
                    ? (event) => {
                        if (
                          event.propertyName === "transform" &&
                          pendingHref
                        ) {
                          finishClose();
                        }
                      }
                    : undefined
                }
              >
                {link.label}
              </span>
            </Link>
          </div>
        ))}
      </nav>
    </section>
  );
}
