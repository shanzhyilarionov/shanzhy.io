import styles from "./project-title.module.css";

export default function ProjectTitle({ title, lines }) {
  if (!lines) return title;

  return (
    <span className={styles.title}>
      {lines.map((line, index) => (
        <span className={styles.line} key={line}>
          {line}{index < lines.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
