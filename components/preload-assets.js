import { getImageProps } from "next/image";
import { projects, PROJECT_IMAGE_SIZES } from "../app/(site)/works/projects";

const warmedImages = new Set();

/** Prepare a destination's visible images when a link is focused or chosen. */
export function warmRouteAssets(href) {
  const connection = navigator.connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return;

  const pathname = href.split(/[?#]/)[0];
  const sources = pathname === "/works"
    ? projects.map((project) => getImageProps({
      src: project.image, alt: "", fill: true, sizes: PROJECT_IMAGE_SIZES,
    }).props)
    : pathname === "/works/genesis"
      ? [{ src: "/images/genesis-poster.jpg" }]
      : [];

  for (const props of sources) {
    if (warmedImages.has(props.src)) continue;
    warmedImages.add(props.src);

    const image = new Image();
    image.fetchPriority = "low";
    image.decoding = "async";
    image.onerror = () => warmedImages.delete(props.src);
    if (props.sizes) image.sizes = props.sizes;
    if (props.srcSet) image.srcset = props.srcSet;
    image.src = props.src;
  }
}
