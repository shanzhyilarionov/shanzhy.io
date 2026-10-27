import Link from "next/link";
import RollingText from "./rolling-text";
import styles from "./chrome.module.css";

export function Brand({ onNavigate, back = false }) {
  return (
    <>
      <span className={styles.brandText}>© Shanzhy</span>
      <RollingText
        as={Link}
        href={back ? "/works" : "/"}
        className={styles.brandButton}
        onNavigate={onNavigate}
        label={back ? "Back" : "Shanzhy"}
      />
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
    <div className={[styles.chrome, className].filter(Boolean).join(" ")} inert={inert} data-site-chrome>
      <div className={styles.slot}>{left}</div>
      <div className={styles.slot}>{right}</div>
    </div>
  );
}
