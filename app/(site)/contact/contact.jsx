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
            label={email}
            aria-label={`Send an email to ${email}`}
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
