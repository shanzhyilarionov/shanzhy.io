"use client";

import { useEffect, useRef, useState } from "react";
import { RevealItem } from "../../../components/reveal";
import RollingText from "../../../components/rolling-text";
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

const itemCount = socialLinks.length + 2;

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
      <section className={styles.content} aria-label="Contact information">
        <RevealItem className={styles.item} index={0} count={itemCount}>
          <h1 className={styles.heading}>Start a conversation.</h1>
        </RevealItem>

        <RevealItem className={styles.item} index={1} count={itemCount}>
          <RollingText
            type="button"
            label={email}
            aria-label={copied ? "Email copied" : `Copy ${email}`}
            onClick={copyEmail}
          />
          <span
            className={[styles.copied, copied ? styles.copiedVisible : ""]
              .filter(Boolean)
              .join(" ")}
            aria-hidden={!copied}
          >
            Copied!
          </span>
        </RevealItem>

        {socialLinks.map((link, index) => (
          <RevealItem
            className={styles.item}
            index={index + 2}
            count={itemCount}
            key={link.label}
          >
            <RollingText
              as="a"
              href={link.href}
              label={link.label}
              target="_blank"
              rel="noreferrer"
            />
          </RevealItem>
        ))}
      </section>
    </main>
  );
}
