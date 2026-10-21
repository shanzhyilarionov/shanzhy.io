export const PROJECT_IMAGE_SIZES = "22rem";
export const PROJECT_IMAGE_QUALITY = 90;
export const PROJECT_PAGE_IMAGE_SIZES = "(max-width: 768px) 90vw, (max-width: 1058px) calc(90vw - 12rem), 40rem";

export const projects = [
  {
    slug: "genesis",
    title: "Genesis",
    summary: "An ecosystem simulator.",
    description: "Genesis is an experimental multi-agent ecosystem simulation built around a simple idea: small local decisions can accumulate into complex system-wide behaviour. Individual agents respond to resources, environmental conditions, and one another through a compact set of rules, while reproduction and mutation shape populations over time. The project aims to examine adaptation, resilience, and coordination across both natural and distributed systems.",
    repository: "genesis",
    media: "video",
    image: "/images/genesis.jpg",
    aspectRatio: 16 / 9,
    duration: "0.8s",
  },
  {
    slug: "shanzhy-io",
    title: "shanzhy.io",
    summary: "A personal website.",
    description: "shanzhy.io is the website you are currently visiting—a personal portfolio created entirely from scratch without the use of templates. Rooted in minimalism, it focuses on essential content, typography, interaction, motion, and adaptability across different screens. At the centre of the homepage is a four-dimensional cube built in JavaScript, conceived as a distinctive visual element and brought to life through geometry, depth, and responsive behaviour. The site functions both as a presentation of my work and an ongoing exploration of frontend engineering.",
    repository: "shanzhy.io",
    alt: "shanzhy.io portfolio displayed on an iMac",
    image: "/images/shanzhy.png",
    aspectRatio: 1737.6 / 977.4,
    crop: { x: 734.2, y: 424.8, width: 1737.6, height: 977.4 },
    width: 3200,
    height: 2000,
    duration: "0.5s",
  },
  {
    slug: "commissioning-workspace",
    title: "Commissioning Workspace",
    summary: "A desktop application.",
    description: "Commissioning Workspace is a desktop application for industrial commissioning management. It provides a structured, responsive interface for organizing assets, tracking progress, and managing tasks. The software emphasizes straightforward interactions and efficient workflows while remaining fully operational offline. Developed as a lightweight alternative to conventional engineering software, it aims to reduce unnecessary complexity without compromising practical functionality.",
    repository: "commissioning-workspace",
    alt: "Commissioning Workspace desktop application",
    image: "/images/commissioning-workspace.png",
    screenshots: [
      { image: "/images/home.png", alt: "Commissioning Workspace home dashboard" },
      { image: "/images/project.png", alt: "Commissioning Workspace project overview" },
      { image: "/images/assets.png", alt: "Commissioning Workspace assets" },
      { image: "/images/tests.png", alt: "Commissioning Workspace checklists and tests" },
    ],
    aspectRatio: 2880 / 1800,
    width: 2880,
    height: 1800,
    duration: "1s",
  },
];

export function findProject(slug) {
  return projects.find((project) => project.slug === slug);
}

export function findProjectByPath(pathname) {
  return projects.find((project) => pathname === `/works/${project.slug}`);
}

export function projectThumbnailProps(project) {
  return {
    src: project.image,
    fill: !project.crop,
    width: project.crop ? project.width : undefined,
    height: project.crop ? project.height : undefined,
    sizes: PROJECT_IMAGE_SIZES,
    quality: PROJECT_IMAGE_QUALITY,
  };
}
