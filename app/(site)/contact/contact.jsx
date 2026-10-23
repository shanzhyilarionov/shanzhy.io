"use client";

import { RevealItem } from "../../../components/reveal";
import FitText from "../../../components/fit-text";
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

function ContactArrow() {
  return (
    <svg
      className={styles.arrow}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M1 1h14v14M1 15 15 1" />
    </svg>
  );
}

export default function Contact() {
  return (
    <main className={styles.contactPage}>
      <section className={styles.content} aria-label="Contact information">
        <RevealItem className={styles.item} index={0} count={itemCount}>
          <FitText as="h1" className={styles.heading} text="Start a conversation." />
        </RevealItem>

        <RevealItem className={styles.item} index={1} count={itemCount}>
          <RollingText
            as="a"
            href={`mailto:${email}`}
            className={styles.link}
            label={email}
            aria-label={`Send an email to ${email}`}
            suffix={<ContactArrow />}
          />
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
              className={styles.link}
              label={link.label}
              suffix={<ContactArrow />}
              target="_blank"
              rel="noreferrer"
            />
          </RevealItem>
        ))}
      </section>
    </main>
  );
}
