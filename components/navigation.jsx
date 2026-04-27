"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./navigation.module.css";

const links = [
  { href: "/", label: "Home" },
  { href: "/works", label: "Works" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Navigation({ open, onClose }) {
  const [closing, setClosing] = useState(false);
  const [closeMotion, setCloseMotion] = useState("");

  useEffect(() => {
    if (open) {
      setClosing(false);
    }
  }, [open]);

  const handleClose = () => {
    if (!open || closing) {
      return;
    }

    setClosing(true);
  };

  const closeClassName = [
    styles.closeButton,
    closeMotion === "enter" ? styles.closeEnter : "",
    closeMotion === "leave" ? styles.closeLeave : "",
  ]
    .filter(Boolean)
    .join(" ");

  const navigationClassName = [
    styles.navigation,
    open ? styles.open : "",
    closing ? styles.closing : "",
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
          closing
        ) {
          onClose();
          setClosing(false);
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
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") {
            setCloseMotion("leave");
          }
        }}
      >
        <span className={styles.closeMask} aria-hidden="true">
          <span
            className={styles.closeTrack}
            onAnimationEnd={() => {
              if (closeMotion === "leave") {
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
        {links.map((link) => (
          <div className={styles.navigationItem} key={link.href}>
            <Link href={link.href}>
              <span>{link.label}</span>
            </Link>
          </div>
        ))}
      </nav>
    </section>
  );
}