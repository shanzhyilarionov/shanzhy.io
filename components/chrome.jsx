import Link from "next/link";
import styles from "./chrome.module.css";

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

export function HomeTitle() {
  return (
    <h1 className={styles.title}>Shanzhy · Independent Developer</h1>
  );
}

export default function Chrome({ left, right, className, inert = false }) {
  return (
    <div className={[styles.chrome, className].filter(Boolean).join(" ")} inert={inert}>
      <div className={styles.slot}>{left}</div>
      <div className={styles.slot}>{right}</div>
    </div>
  );
}
