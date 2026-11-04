import { projects } from "./(site)/works/projects";

export default function sitemap() {
  return [
    "/",
    "/works",
    "/about",
    "/contact",
    ...projects.map((project) => `/works/${project.slug}`),
  ].map((path) => ({ url: `https://shanzhy.io${path}` }));
}
