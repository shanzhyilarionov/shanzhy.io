export const PROJECT_IMAGE_SIZES = "22rem";
export const PROJECT_IMAGE_QUALITY = 90;

export const projects = [
  {
    slug: "genesis",
    title: "Genesis",
    image: "/images/genesis.jpg",
    aspectRatio: 16 / 9,
    duration: "0.8s",
  },
  {
    slug: "shanzhy-io",
    title: "shanzhy.io",
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
    image: "/images/commissioning-workspace.png",
    aspectRatio: 2880 / 1800,
    duration: "1s",
  },
];
