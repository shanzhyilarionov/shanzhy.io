import Reveal from "../../../components/reveal";
import styles from "./about.module.css";

const heading = "Bridging technical structure and human needs.";

const paragraphs = [
  "Hello! My name is Shanzhy Ilarionov. I am currently a Computing Science student at the University of Alberta and an independent developer focused on software engineering and user experience design.",
  "I turn complex requirements into maintainable systems and intuitive interfaces, with strengths in frontend architecture, interaction design, and workflow optimization. I believe every feature should serve a clear purpose, and I aim to balance functionality, clarity, and aesthetics while reducing unnecessary complexity.",
  "I am open to collaborations, freelance work, and other opportunities to build meaningful products.",
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
