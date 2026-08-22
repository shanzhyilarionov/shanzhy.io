"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useSceneAnimationPaused } from "./scene-animation-context";
import { createWebGLRenderer } from "./tesseract-webgl";

const AXES = [0, 1, 2, 3];
const SIGNS = [-1, 1];
const CYAN_LIGHT = [-3.8, -3.1, 4.6];
const ORANGE_LIGHT = [3.6, 2.8, -3.4];
const CAMERA = [0, 0, 5];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(minimum, maximum, value) {
  const progress = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function add3D(first, second) {
  return [
    first[0] + second[0],
    first[1] + second[1],
    first[2] + second[2],
  ];
}

function subtract3D(first, second) {
  return [
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2],
  ];
}

function length3D(vector) {
  return Math.max(Math.hypot(vector[0], vector[1], vector[2]), 0.0001);
}

function normalize3D(vector) {
  const length = length3D(vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function dot3D(first, second) {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
}

function cross3D(first, second) {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
}

function average3D(points) {
  const total = points.reduce(
    (sum, point) => [
      sum[0] + point[0],
      sum[1] + point[1],
      sum[2] + point[2],
    ],
    [0, 0, 0],
  );

  return total.map((value) => value / points.length);
}

function faceLight(normal, center, lightPosition) {
  const toLight = subtract3D(lightPosition, center);
  const lightDirection = normalize3D(toLight);
  const incidence = Math.abs(dot3D(normal, lightDirection));
  const distance = length3D(toLight);
  const attenuation = 1 / (1 + distance * distance * 0.025);
  return (0.22 + Math.pow(incidence, 1.45) * 0.78) * attenuation;
}

function edgeLight(direction, center, lightPosition) {
  const toLight = subtract3D(lightPosition, center);
  const lightDirection = normalize3D(toLight);
  const crossLight = 1 - Math.abs(dot3D(direction, lightDirection));
  const distance = length3D(toLight);
  const attenuation = 1 / (1 + distance * distance * 0.023);
  return (0.18 + Math.pow(crossLight, 1.7) * 0.82) * attenuation;
}

function faceSpecular(normal, center, lightPosition) {
  const lightDirection = normalize3D(subtract3D(lightPosition, center));
  const viewDirection = normalize3D(subtract3D(CAMERA, center));
  const halfVector = normalize3D(add3D(lightDirection, viewDirection));
  return Math.pow(Math.abs(dot3D(normal, halfVector)), 20);
}

function edgeSpecular(direction, center, lightPosition) {
  const lightDirection = normalize3D(subtract3D(lightPosition, center));
  const viewDirection = normalize3D(subtract3D(CAMERA, center));
  const halfVector = normalize3D(add3D(lightDirection, viewDirection));
  const radialAlignment = 1 - Math.abs(dot3D(direction, halfVector));
  return Math.pow(radialAlignment, 10);
}

function buildVertices4D() {
  const vertices = [];

  for (const x of SIGNS) {
    for (const y of SIGNS) {
      for (const z of SIGNS) {
        for (const w of SIGNS) {
          vertices.push([x, y, z, w]);
        }
      }
    }
  }

  return vertices;
}

function buildEdges4D(vertices) {
  const edges = [];

  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      let differences = 0;

      for (let axis = 0; axis < 4; axis++) {
        if (vertices[i][axis] !== vertices[j][axis]) differences++;
      }

      if (differences === 1) edges.push([i, j]);
    }
  }

  return edges;
}

function buildFaces4D(vertices) {
  const indexByVertex = new Map(
    vertices.map((vertex, index) => [vertex.join(","), index]),
  );
  const faces = [];

  for (let firstAxis = 0; firstAxis < 4; firstAxis++) {
    for (let secondAxis = firstAxis + 1; secondAxis < 4; secondAxis++) {
      const fixedAxes = AXES.filter(
        (axis) => axis !== firstAxis && axis !== secondAxis,
      );

      for (const firstFixedSign of SIGNS) {
        for (const secondFixedSign of SIGNS) {
          const corners = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([firstSign, secondSign]) => {
            const vertex = [0, 0, 0, 0];
            vertex[firstAxis] = firstSign;
            vertex[secondAxis] = secondSign;
            vertex[fixedAxes[0]] = firstFixedSign;
            vertex[fixedAxes[1]] = secondFixedSign;
            return indexByVertex.get(vertex.join(","));
          });

          faces.push(corners);
        }
      }
    }
  }

  return faces;
}

function rotate4D(point, firstAxis, secondAxis, angle) {
  const rotated = [...point];
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const firstValue = rotated[firstAxis];
  const secondValue = rotated[secondAxis];

  rotated[firstAxis] = firstValue * cosine - secondValue * sine;
  rotated[secondAxis] = firstValue * sine + secondValue * cosine;

  return rotated;
}

function project4Dto3D(point, distance) {
  const scale = distance / (distance - point[3]);
  return [point[0] * scale, point[1] * scale, point[2] * scale];
}

function rotate3DX(point, angle) {
  const [x, y, z] = point;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [x, y * cosine - z * sine, y * sine + z * cosine];
}

function rotate3DY(point, angle) {
  const [x, y, z] = point;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [x * cosine + z * sine, y, -x * sine + z * cosine];
}

function rotate3DZ(point, angle) {
  const [x, y, z] = point;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [x * cosine - y * sine, x * sine + y * cosine, z];
}

function project3Dto2D(point, distance, centerX, centerY, scale) {
  const perspective = distance / (distance - point[2]);

  return {
    x: centerX + point[0] * perspective * scale,
    y: centerY + point[1] * perspective * scale,
    z: point[2],
  };
}

function polygonArea(points) {
  let area = 0;

  for (let index = 0; index < points.length; index++) {
    const nextIndex = (index + 1) % points.length;
    area +=
      points[index].x * points[nextIndex].y -
      points[nextIndex].x * points[index].y;
  }

  return Math.abs(area) / 2;
}

function hueToRgb(first, second, hue) {
  let normalizedHue = hue;

  if (normalizedHue < 0) normalizedHue += 1;
  if (normalizedHue > 1) normalizedHue -= 1;
  if (normalizedHue < 1 / 6) {
    return first + (second - first) * 6 * normalizedHue;
  }
  if (normalizedHue < 1 / 2) return second;
  if (normalizedHue < 2 / 3) {
    return first + (second - first) * (2 / 3 - normalizedHue) * 6;
  }

  return first;
}

function hslToRgb(hue, saturation, lightness) {
  const normalizedHue = hue / 360;
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;

  if (normalizedSaturation === 0) {
    return [normalizedLightness, normalizedLightness, normalizedLightness];
  }

  const second =
    normalizedLightness < 0.5
      ? normalizedLightness * (1 + normalizedSaturation)
      : normalizedLightness +
        normalizedSaturation -
        normalizedLightness * normalizedSaturation;
  const first = 2 * normalizedLightness - second;

  return [
    hueToRgb(first, second, normalizedHue + 1 / 3),
    hueToRgb(first, second, normalizedHue),
    hueToRgb(first, second, normalizedHue - 1 / 3),
  ];
}

function spectralColor(hue, frontness) {
  const depthCurve = Math.pow(frontness, 1.6);
  const saturation = 30 + depthCurve * 70;
  const lightness = 19 + depthCurve * 41;

  return hslToRgb(hue, saturation, lightness);
}

function createScene(
  sourceVertices,
  sourceEdges,
  sourceFaces,
  viewport,
  pointer,
  time,
) {
  const { width, height } = viewport;
  const centerX = width / 2;
  const centerY = height / 2;
  const compactProgress = clamp((900 - width) / 300, 0, 1);
  const compactScale = 1 - compactProgress * 0.17;
  const narrowTransition = clamp((700 - width) / 200, 0, 1);
  const plateauScale = Math.min(87, height * 0.105);
  const minimumScale =
    plateauScale - narrowTransition * (plateauScale - 50);
  const scale = Math.max(
    minimumScale,
    Math.min(width, height) * 0.105 * compactScale,
  );
  const pointerStrength = width <= 768 ? 1.2 : 0.75;

  const angleXY = time * 0.2;
  const angleXZ = time * 0.15;
  const angleYZ = time * 0.1;
  const angleXW = time * 0.5 + pointer.x * pointerStrength;
  const angleYW = time * 0.5 + pointer.y * pointerStrength;
  const angleZW =
    time * 0.3 + (pointer.x - pointer.y) * pointerStrength * 0.35;

  const projectedVertices = sourceVertices.map((vertex) => {
    let point4D = [...vertex];

    point4D = rotate4D(point4D, 0, 1, angleXY);
    point4D = rotate4D(point4D, 0, 2, angleXZ);
    point4D = rotate4D(point4D, 1, 2, angleYZ);
    point4D = rotate4D(point4D, 0, 3, angleXW);
    point4D = rotate4D(point4D, 1, 3, angleYW);
    point4D = rotate4D(point4D, 2, 3, angleZW);

    let point3D = project4Dto3D(point4D, 3);
    point3D = rotate3DX(point3D, 0.4);
    point3D = rotate3DY(point3D, -0.5);
    point3D = rotate3DZ(point3D, 0.1);

    const point2D = project3Dto2D(
      point3D,
      5,
      centerX,
      centerY,
      scale,
    );

    return {
      ...point2D,
      point3D,
    };
  });

  const depthValues = projectedVertices.map((vertex) => vertex.z);
  const minimumDepth = Math.min(...depthValues);
  const maximumDepth = Math.max(...depthValues);
  const depthRange = Math.max(maximumDepth - minimumDepth, 0.0001);
  const depthRatio = (depth) => (depth - minimumDepth) / depthRange;

  const renderedFaces = sourceFaces
    .map((face, index) => {
      const points = face.map((vertexIndex) => projectedVertices[vertexIndex]);
      const points3D = points.map((point) => point.point3D);
      const center3D = average3D(points3D);
      const firstSide = subtract3D(points3D[1], points3D[0]);
      const secondSide = subtract3D(points3D[3], points3D[0]);
      const normal = normalize3D(cross3D(firstSide, secondSide));
      const viewDirection = normalize3D(subtract3D(CAMERA, center3D));
      const fresnel = Math.pow(
        1 - Math.abs(dot3D(normal, viewDirection)),
        2.35,
      );
      const cyanLight = faceLight(normal, center3D, CYAN_LIGHT);
      const orangeLight = faceLight(normal, center3D, ORANGE_LIGHT);
      const cyanSpecular = faceSpecular(normal, center3D, CYAN_LIGHT);
      const orangeSpecular = faceSpecular(normal, center3D, ORANGE_LIGHT);
      const cyanResponse = cyanLight * 0.68 + cyanSpecular * 0.32;
      const orangeResponse = orangeLight * 0.68 + orangeSpecular * 0.32;
      const strongestSpecular = Math.max(cyanSpecular, orangeSpecular);
      const depth =
        points.reduce((sum, point) => sum + point.z, 0) / points.length;
      const projectedArea = polygonArea(points);
      const areaRatio = clamp(projectedArea / (scale * scale * 2.4), 0, 1);
      const frontness = depthRatio(depth);
      const depthCurve = Math.pow(frontness, 1.8);
      const depthVisibility = 0.18 + depthCurve * 0.82;

      return {
        index,
        points,
        depth,
        cyanColor: spectralColor(178, frontness),
        orangeColor: spectralColor(18, frontness),
        glassOpacity:
          (0.05 + areaRatio * 0.09 + fresnel * 0.065) *
            depthVisibility +
          depthCurve * 0.038,
        cyanOpacity:
          (0.025 + cyanResponse * 0.42) * depthVisibility,
        orangeOpacity:
          (0.028 + orangeResponse * 0.48) * depthVisibility,
        absorptionOpacity:
          0.06 + areaRatio * 0.07 + (1 - depthCurve) * 0.12,
        rimOpacity:
          (0.018 + fresnel * 0.2 + strongestSpecular * 0.1) *
            depthVisibility +
          depthCurve * 0.09,
      };
    })
    .sort((first, second) => first.depth - second.depth);

  const renderedEdges = sourceEdges.map(([firstIndex, secondIndex], index) => {
    const first = projectedVertices[firstIndex];
    const second = projectedVertices[secondIndex];
    const deltaX = second.x - first.x;
    const deltaY = second.y - first.y;
    const length = Math.max(Math.hypot(deltaX, deltaY), 0.0001);
    const normalX = -deltaY / length;
    const normalY = deltaX / length;
    const depth = (first.z + second.z) / 2;
    const frontness = depthRatio(depth);
    const depthCurve = Math.pow(frontness, 1.95);
    const center3D = average3D([first.point3D, second.point3D]);
    const direction3D = normalize3D(
      subtract3D(second.point3D, first.point3D),
    );
    const cyanLight = edgeLight(direction3D, center3D, CYAN_LIGHT);
    const orangeLight = edgeLight(direction3D, center3D, ORANGE_LIGHT);
    const cyanSpecular = edgeSpecular(direction3D, center3D, CYAN_LIGHT);
    const orangeSpecular = edgeSpecular(direction3D, center3D, ORANGE_LIGHT);
    const cyanResponse = cyanLight * 0.28 + cyanSpecular * 0.72;
    const orangeResponse = orangeLight * 0.28 + orangeSpecular * 0.72;
    const strongestSpecular = Math.max(cyanSpecular, orangeSpecular);
    const lightStrength = clamp(
      Math.max(cyanResponse, orangeResponse),
      0,
      1,
    );
    const split = 0.62 + lightStrength * 1.15 + frontness * 0.2;
    const cyanSide = normalX * -0.775 + normalY * -0.632 >= 0 ? 1 : -1;
    const orangeSide = normalX * 0.731 + normalY * 0.682 >= 0 ? 1 : -1;
    const cyanOffsetX = normalX * split * cyanSide;
    const cyanOffsetY = normalY * split * cyanSide;
    const orangeOffsetX = normalX * split * orangeSide;
    const orangeOffsetY = normalY * split * orangeSide;
    const cyanIsDominant = cyanResponse >= orangeResponse;
    const dominantOffsetX = cyanIsDominant ? cyanOffsetX : orangeOffsetX;
    const dominantOffsetY = cyanIsDominant ? cyanOffsetY : orangeOffsetY;
    const depthLighting = 0.15 + depthCurve * 0.85;
    const coreWidth = 0.48 + depthCurve * 2.2;
    const frontPassOpacity = smoothstep(0.36, 0.7, frontness);

    return {
      index,
      first,
      second,
      depth,
      frontness,
      cyanColor: spectralColor(178, frontness),
      orangeColor: spectralColor(18, frontness),
      rearPassOpacity: 1 - frontPassOpacity,
      frontPassOpacity,
      cyanOffsetX,
      cyanOffsetY,
      orangeOffsetX,
      orangeOffsetY,
      absorptionOffsetX: -dominantOffsetX * 0.9,
      absorptionOffsetY: -dominantOffsetY * 0.9,
      absorptionWidth: coreWidth * 0.84,
      absorptionOpacity:
        0.3 + lightStrength * 0.23 + (1 - depthCurve) * 0.13,
      coreWidth,
      coreOpacity:
        0.035 + depthCurve * 0.78 + strongestSpecular * 0.1,
      shellWidth: coreWidth * 3.45,
      shellOpacity:
        0.005 + depthCurve * 0.145 + strongestSpecular * 0.045,
      cyanOpacity:
        0.004 +
        (0.14 + cyanResponse) *
          depthLighting *
          (0.55 + depthCurve * 1.15),
      orangeOpacity:
        0.0045 +
        (0.15 + orangeResponse) *
          depthLighting *
          (0.58 + depthCurve * 1.22),
      cyanGlowOpacity:
        cyanResponse *
        (0.05 + cyanSpecular * 0.2) *
        (0.12 + depthCurve * 0.88),
      orangeGlowOpacity:
        orangeResponse *
        (0.05 + orangeSpecular * 0.2) *
        (0.12 + depthCurve * 0.88) *
        1.08,
    };
  }).sort((first, second) => first.depth - second.depth);

  const renderedVertices = projectedVertices.map((vertex, index) => {
    const frontness = depthRatio(vertex.z);
    const pulse = 0.5 + Math.sin(time * 0.8 + index * 2.17) * 0.5;

    return {
      ...vertex,
      index,
      radius: 0.22 + Math.pow(frontness, 1.4) * 0.68,
      opacity:
        0.008 + Math.pow(frontness, 1.8) * 0.3 + pulse * 0.018,
    };
  });

  return {
    width,
    height,
    faces: renderedFaces,
    edges: renderedEdges,
    vertices: renderedVertices,
  };
}

export default function GlassTesseract() {
  const paused = useSceneAnimationPaused();
  const pausedRef = useRef(paused);
  const canvasRef = useRef(null);
  const vertices = useMemo(() => buildVertices4D(), []);
  const edges = useMemo(() => buildEdges4D(vertices), [vertices]);
  const faces = useMemo(() => buildFaces4D(vertices), [vertices]);

  useLayoutEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let renderer = createWebGLRenderer(canvas);
    let frameId = 0;
    const startTime = performance.now();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const pointer = { x: 0, y: 0 };

    const updateViewport = () => {
      viewport.width = window.innerWidth;
      viewport.height = window.innerHeight;
    };

    const updatePointer = (clientX, clientY) => {
      const width = window.innerWidth || 1;
      const height = window.innerHeight || 1;
      pointer.x = (clientX / width - 0.5) * 2;
      pointer.y = (clientY / height - 0.5) * 2;
    };

    const handlePointerMove = (event) => {
      updatePointer(event.clientX, event.clientY);
    };

    const handleTouchMove = (event) => {
      if (!event.touches.length) {
        return;
      }

      event.preventDefault();
      updatePointer(event.touches[0].clientX, event.touches[0].clientY);
    };

    const handleContextLost = (event) => {
      event.preventDefault();
      renderer = null;
    };

    const handleContextRestored = () => {
      renderer = createWebGLRenderer(canvas);
    };

    const renderFrame = (now) => {
      if (!renderer || pausedRef.current || document.hidden) {
        return;
      }

      const time = (now - startTime) / 1000;
      const scene = createScene(
        vertices,
        edges,
        faces,
        viewport,
        pointer,
        time,
      );
      renderer.render(scene);
    };

    const animate = (now) => {
      renderFrame(now);
      frameId = requestAnimationFrame(animate);
    };

    updateViewport();
    renderFrame(startTime);
    frameId = requestAnimationFrame(animate);
    window.addEventListener("resize", updateViewport);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);

      if (renderer) {
        renderer.destroy();
      }
    };
  }, [edges, faces, vertices]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        display: "block",
        width: "100%",
        height: "100vh",
        background: "transparent",
      }}
    />
  );
}
