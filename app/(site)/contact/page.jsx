"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./contact.module.css";

const email = "shangzh5@ualberta.ca";

const socialLinks = [
  {
    href: "https://www.linkedin.com/in/shanzhy-ilarionov",
    label: "LinkedIn",
  },
  {
    href: "https://x.com/shanzhy_i",
    label: "X (Twitter)",
  },
  {
    href: "https://www.instagram.com/shanzhy_ilarionov",
    label: "Instagram",
  },
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

function RollingLink({ href, label }) {
  const [motion, setMotion] = useState("");

  const className = [
    styles.contactLink,
    motion === "enter" ? styles.rollEnter : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <a
      className={className}
      href={href}
      aria-label={label}
      target="_blank"
      rel="noreferrer"
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
    </a>
  );
}

function CopyEmailButton({ copied, onCopy }) {
  const [motion, setMotion] = useState("");

  const className = [
    styles.contactLink,
    styles.emailButton,
    motion === "enter" ? styles.rollEnter : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={className}
      type="button"
      aria-label={copied ? "Email copied" : `Copy ${email}`}
      onClick={onCopy}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          setMotion("enter");
        }
      }}
    >
      <RollingLabel
        label={email}
        onAnimationEnd={() => {
          if (motion === "enter") {
            setMotion("");
          }
        }}
      />
    </button>
  );
}

function RevealLine({ children, index, className = "", feedback = null }) {
  return (
    <div
      className={[styles.revealLine, className].filter(Boolean).join(" ")}
      style={{ "--line-index": index }}
    >
      <div className={styles.revealClip}>
        <div className={styles.revealContent}>{children}</div>
      </div>
      {feedback}
    </div>
  );
}

export default function Contact() {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  const copyEmail = async () => {
    let copySucceeded = false;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(email);
        copySucceeded = true;
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = email;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        copySucceeded = document.execCommand("copy");
        textarea.remove();
      }
    } catch {
      copySucceeded = false;
    }

    if (!copySucceeded) {
      return;
    }

    setCopied(true);

    if (copiedTimer.current !== null) {
      window.clearTimeout(copiedTimer.current);
    }

    copiedTimer.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimer.current = null;
    }, 2000);
  };

  return (
    <main className={styles.contactPage}>
      <section className={styles.contactContent} aria-label="Contact information">
        <RevealLine index={0}>
          <h1 className={styles.sectionTitle}>Inquiries</h1>
        </RevealLine>

        <RevealLine
          index={1}
          className={styles.inquiriesLink}
          feedback={
            <span
              className={[
                styles.copiedMessage,
                copied ? styles.copiedMessageVisible : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden={!copied}
            >
              Copied!
            </span>
          }
        >
          <CopyEmailButton copied={copied} onCopy={copyEmail} />
        </RevealLine>

        <RevealLine index={2} className={styles.socialTitle}>
          <h2 className={styles.sectionTitle}>Social</h2>
        </RevealLine>

        {socialLinks.map((link, index) => (
          <RevealLine index={index + 3} key={link.label}>
            <RollingLink {...link} />
          </RevealLine>
        ))}
      </section>
    </main>
  );
}
