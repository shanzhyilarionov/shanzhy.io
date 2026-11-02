import Reveal from "../../../components/reveal";
import styles from "./about.module.css";

export const metadata = {
  title: "About",
};

const heading = "Function refined\nthrough design.";

const paragraphs = [
  "My name is Shanzhy Ilarionov. I'm a Computing Science student at the University of Alberta and an independent developer focused on software engineering and user experience design.",
  "I value usability, creativity, and attention to detail. I'm also looking forward to opportunities where I can put these principles into practice.",
];

const blocks = [
  { as: "h1", text: heading, className: styles.heading },
  ...paragraphs.map((text) => ({ text, className: styles.paragraph })),
];

export default function About() {
  return (
    <main className={styles.page}>
      <Reveal
        as="section"
        className={styles.content}
        aria-label="About Shanzhy Ilarionov"
        blocks={blocks}
      />
    </main>
  );
}
