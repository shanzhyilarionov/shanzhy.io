import Link from "next/link";
import styles from "./chrome.module.css";

/**
 * The wordmark, on every page but home. On mobile it drops the © and
 * becomes a button back to home; on larger screens it stays plain, static
 * text.
 */
export function Brand({ onNavigate }) {
  return (
    <>
      <span className={styles.brandText}>© Shanzhy</span>
      <Link href="/" className={styles.brandButton} onNavigate={onNavigate}>
        Shanzhy
      </Link>
    </>
  );
}

/** Home's title fades in with the surrounding chrome. */
export function HomeTitle() {
  return (
    <h1 className={styles.title}>Shanzhy · Independent Developer</h1>
  );
}

/**
 * The pair of things pinned to the sides of the screen: `left` on the 1/20
 * line, `right` on the 19/20 line, both centred vertically.
 *
 * The row spans the viewport but is inert, so it never takes a pointer from
 * the page behind it — only the text and controls inside it do.
 */
export default function Chrome({ left, right, className, inert = false }) {
  return (
    <div className={[styles.chrome, className].filter(Boolean).join(" ")} inert={inert}>
      <div className={styles.slot}>{left}</div>
      <div className={styles.slot}>{right}</div>
    </div>
  );
}
