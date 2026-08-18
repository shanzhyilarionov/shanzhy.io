"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Navigation from "./navigation";
import styles from "./header.module.css";

const links = [
  { href: "/", label: "Home" },
  { href: "/works", label: "Works" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

function RollingLabel({ label, onAnimationEnd }) {
  return (
    <span className={styles.labelMask} aria-hidden="true">
      <span className={styles.labelTrack} onAnimationEnd={onAnimationEnd}>
        <span className={styles.labelLine}>{label}</span>
        <span className={styles.labelLine}>{label}</span>
        <span className={styles.labelLine}>{label}</span>
      </span>
    </span>
  );
}

function HeaderLink({ href, label, onClick }) {
  const [motion, setMotion] = useState("");

  const className = [
    styles.headerLink,
    motion === "enter" ? styles.rollEnter : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link
      className={className}
      href={href}
      aria-label={label}
      onClick={onClick}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          setMotion("enter");
        }
      }}
    >
      <RollingLabel
        label={label}
        onAnimationEnd={() => {
          if (motion === "enter") {
            setMotion("");
          }
        }}
      />
    </Link>
  );
}

export default function Header({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [menuMotion, setMenuMotion] = useState("");
  const [headerMotion, setHeaderMotion] = useState("enter");
  const [contentMotion, setContentMotion] = useState("enter");
  const [pendingTransition, setPendingTransition] = useState(null);

  useEffect(() => {
    if (!pendingTransition || pathname !== pendingTransition.href) {
      return;
    }

    const source = pendingTransition.source;
    setPendingTransition(null);
    setContentMotion("enter");

    if (source === "navigation") {
      setNavOpen(false);
      setHeaderMotion("enter");
    } else {
      setHeaderMotion("idle");
    }
  }, [pathname, pendingTransition]);

  const handleHeaderNavigation = (event, href) => {
    event.preventDefault();
    if (href === pathname || pendingTransition) {
      return;
    }

    setPendingTransition({ href, source: "header" });
    setContentMotion("exit");
    setHeaderMotion(href === "/" ? "exit" : "idle");
  };

  const menuClassName = [
    styles.menuButton,
    menuMotion === "enter" ? styles.rollEnter : "",
  ]
    .filter(Boolean)
    .join(" ");

  const headerClassName = [
    styles.header,
    navOpen ? styles.headerHidden : "",
    !navOpen && headerMotion === "enter" ? styles.headerEntering : "",
    !navOpen && headerMotion === "exit" ? styles.headerExiting : "",
  ]
    .filter(Boolean)
    .join(" ");

  const contentClassName = [
    styles.content,
    contentMotion === "enter" ? styles.contentEntering : "",
    contentMotion === "exit" ? styles.contentExiting : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <header
        className={headerClassName}
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }
          if (headerMotion === "enter") {
            setHeaderMotion("idle");
          }
        }}
      >
        <nav className={styles.desktopNavigation} aria-label="Main navigation">
          {links.map((link) => (
            <HeaderLink
              href={link.href}
              label={link.label}
              key={link.href}
              onClick={(event) => {
                handleHeaderNavigation(event, link.href);
              }}
            />
          ))}
        </nav>

        <button
          className={menuClassName}
          type="button"
          aria-label="Open navigation"
          onClick={() => {
            setPendingTransition(null);
            setHeaderMotion("idle");
            setContentMotion("idle");
            setNavOpen(true);
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") {
              setMenuMotion("enter");
            }
          }}
        >
          <RollingLabel
            label="Menu"
            onAnimationEnd={() => {
              if (menuMotion === "enter") {
                setMenuMotion("");
              }
            }}
          />
        </button>
      </header>

      <div
        className={contentClassName}
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }

          if (contentMotion === "enter") {
            setContentMotion("idle");
          }

          if (
            contentMotion === "exit" &&
            pendingTransition?.source === "header"
          ) {
            router.push(pendingTransition.href);
          }
        }}
      >
        {children}
      </div>

      <Navigation
        open={navOpen}
        onClose={() => {
          setPendingTransition(null);
          setNavOpen(false);
          setHeaderMotion("idle");
          setContentMotion("idle");
        }}
        onNavigate={(href) => {
          setPendingTransition({ href, source: "navigation" });
          router.push(href);
        }}
      />
    </>
  );
}
