import { project3Dto2D } from "./geometry.mjs";
import { LOOK } from "./look.js";

const color = (tint) => tint.map((value) => Math.round(110 + Math.sqrt(value) * 145)).join(",");
const faceColor = (tint) => tint.map((value) => Math.round(255 * Math.sqrt(1 - Math.exp(-value * 8)))).join(",");

export function createFallbackRenderer(canvas) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return null;

  function render(scene) {
    const width = Math.max(1, Math.round(scene.width));
    const height = Math.max(1, Math.round(scene.height));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.clearRect(0, 0, width, height);

    const faces = scene.faces.map((face) => ({
      face,
      depth: face.points3D.reduce((sum, point) => sum + point[2], 0) / face.points3D.length,
    })).sort((first, second) => first.depth - second.depth);

    for (const { face, depth } of faces) {
      context.beginPath();
      face.points3D.forEach((point, index) => {
        const { x, y } = project3Dto2D(
          point, scene.zDistance, scene.centerX, scene.centerY, scene.scale,
        );
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      const front = Math.max(0, Math.min(1, (depth + scene.projectedRadius) / (2 * scene.projectedRadius)));
      const density = Math.min(1, face.density / LOOK.glass.tintedDensity);
      const opacity = (0.04 + density * 0.28) * (0.65 + front * 0.35);
      context.fillStyle = `rgba(${faceColor(face.tint)},${opacity * (face.visibility ?? 1)})`;
      context.fill();
    }

    context.lineCap = "round";
    for (const edge of scene.edges) {
      const depth = edge.depth ?? (edge.z1 + edge.z2) / 2;
      const front = Math.max(0, Math.min(1, (depth + scene.projectedRadius) / (2 * scene.projectedRadius)));
      context.strokeStyle = `rgba(${color(edge.tint)},${(0.3 + front * 0.6) * (edge.visibility ?? 1)})`;
      context.lineWidth = Math.max(1, edge.coreWidth * 0.4);
      context.beginPath();
      context.moveTo(edge.x1, edge.y1);
      context.lineTo(edge.x2, edge.y2);
      context.stroke();
    }
  }

  return { render, destroy() { context.clearRect(0, 0, canvas.width, canvas.height); } };
}
