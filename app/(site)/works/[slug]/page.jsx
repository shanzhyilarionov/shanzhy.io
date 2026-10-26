import { notFound } from "next/navigation";
import { findProject, projects } from "../projects";
import GenesisVideo from "./genesis-video";
import ProjectDetail, { ProjectImage } from "./project-detail";

export function generateStaticParams() {
  return projects.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const project = findProject(slug);

  if (!project) notFound();

  return { title: project.title };
}

export default async function ProjectPage({ params }) {
  const { slug } = await params;
  const project = findProject(slug);

  if (!project) notFound();

  return (
    <ProjectDetail project={project}>
      {project.media === "video" ? <GenesisVideo project={project} /> : <ProjectImage project={project} />}
    </ProjectDetail>
  );
}
