import { notFound } from "next/navigation";
import { projects } from "../projects";
import Genesis from "./genesis";

export function generateStaticParams() {
  return projects.map(({ slug }) => ({ slug }));
}

export default async function ProjectPage({ params }) {
  const { slug } = await params;
  const project = projects.find((project) => project.slug === slug);

  if (!project) notFound();

  if (slug === "genesis") return <Genesis />;

  return <main className="blankPage" aria-label={project.title} />;
}
