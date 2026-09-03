"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useSceneAnimationPaused } from "./scene-animation-context";
import { createWebGLRenderer } from "./tesseract-webgl";

const AXES = [0, 1, 2, 3];
const SIGNS = [-1, 1];
const KEY_LIGHT_A = [-3.8, -3.1, 4.6];
const KEY_LIGHT_B = [3.6, 2.8, -3.4];
const CAMERA = [0, 0, 5];

// Every color comes from these five primaries. Depth only changes luminance,
// so it cannot introduce cyan, orange, violet, or any other base hue.
const PRIMARY_COLORS = {
  pink: [1, 0, 0.52],
  red: [1, 0.015, 0.025],
  yellow: [1, 0.88, 0],
  blue: [0, 0.22, 1],
  green: [0, 0.88, 0.24],
};

const EDGE_COLOR_PAIRS = [
  ["blue", "pink"],
  ["red", "blue"],
  ["yellow", "blue"],
  ["blue", "green"],
  ["pink", "red"],
  ["green", "pink"],
  ["yellow", "red"],
  ["green", "yellow"],
];

// Exactly two global color-bearing layers.
const GLOBAL_LAYER_SCHEME_MAP = [
  // Cool layer: blue / green / yellow
  [0, 1, 0, 1, 2, 0],
  // Warm layer: pink / red / yellow
  [3, 4, 3, 4, 3, 4],
];

const FACE_COLOR_SCHEMES = [
  // Each face uses a direct, two-primary linear gradient.
  {
    axis: [0.12, 1],
    colors: ["green", "blue"],
  },
  {
    axis: [0.94, 0.12],
    colors: ["blue", "green"],
  },
  {
    axis: [0.32, 0.9],
    colors: ["green", "yellow"],
  },
  {
    axis: [-0.16, 1],
    colors: ["pink", "red"],
  },
  {
    axis: [0.08, 1],
    colors: ["red", "yellow"],
  },
];

const COLOR_LAYER_PROFILES = [
  {
    fill: 0.94,
    absorption: 0.074,
    edgeLift: 0.135,
    white: 0.22,
    rim: 0.76,
  },
  {
    fill: 0.84,
    absorption: 0.056,
    edgeLift: 0.092,
    white: 0.12,
    rim: 0.5,
  },
];

const UNFILLED_PROFILE = {
  fill: 0,
  absorption: 0.012,
  edgeLift: 0.025,
  white: 0.08,
  rim: 0.16,
};

const WHITE_FACE_PATTERN = [1, 0.18, 0, 0.72, 0, 0.45, 0.9, 0.12];
const EDGE_GLINT_RESPONSE = 14.0;
const BLOCK_COLOR_RESPONSE = 4.6; // ~0.5 s projected color dominance transition


function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(minimum, maximum, value) {
  const progress = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function mixScalar(first, second, amount) {
  return first + (second - first) * amount;
}

function mixColor(first, second, amount) {
  return [
    mixScalar(first[0], second[0], amount),
    mixScalar(first[1], second[1], amount),
    mixScalar(first[2], second[2], amount),
  ];
}

function normalize2D(vector) {
  const length = Math.hypot(vector[0], vector[1]);
  if (length <= 0.00001) return [0, 0];
  return [vector[0] / length, vector[1] / length];
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
  let orientationIndex = 0;

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

          let cubeLayer = null;
          if (fixedAxes[0] === 3) cubeLayer = firstFixedSign;
          if (fixedAxes[1] === 3) cubeLayer = secondFixedSign;

          const globalColorLayer =
            firstFixedSign === -1 && secondFixedSign === -1
              ? 0
              : firstFixedSign === 1 && secondFixedSign === 1
                ? 1
                : -1;

          faces.push({
            corners,
            cubeLayer,
            isConnector: cubeLayer === null,
            globalColorLayer,
            orientationIndex,
            firstAxis,
            secondAxis,
            fixedSigns: [firstFixedSign, secondFixedSign],
          });
        }
      }

      orientationIndex++;
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

function primaryColor(name, frontness, lift = 0) {
  const depthCurve = Math.pow(frontness, 1.28);
  const intensity = 0.76 + depthCurve * 0.29 + lift * 0.01;
  return PRIMARY_COLORS[name].map((channel) =>
    clamp(channel * intensity, 0, 1),
  );
}

function faceRamp(index, frontness) {
  const scheme = FACE_COLOR_SCHEMES[index % FACE_COLOR_SCHEMES.length];
  return {
    gradientAxis: scheme.axis,
    rampColors: scheme.colors.map((colorName, colorIndex) =>
      primaryColor(colorName, frontness, colorIndex === 0 ? 1.5 : 0),
    ),
  };
}

function edgePalette(index, frontness) {
  const [firstColor, secondColor] =
    EDGE_COLOR_PAIRS[index % EDGE_COLOR_PAIRS.length];

  return [
    primaryColor(firstColor, frontness, 2),
    primaryColor(secondColor, frontness),
  ];
}

function createScene(
  sourceVertices,
  sourceEdges,
  sourceFaces,
  viewport,
  pointer,
  time,
  deltaTime,
  temporalState,
) {
  const { width, height } = viewport;
  const centerX = width / 2;
  const centerY = height / 2;

  // Keep the existing size / motion behavior unchanged.
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

  for (const vertex of projectedVertices) {
    vertex.depth01 = 1 - depthRatio(vertex.z);
  }

  const faceDetails = sourceFaces.map((face, index) => {
      const points = face.corners.map(
        (vertexIndex) => projectedVertices[vertexIndex],
      );
      const points3D = points.map((point) => point.point3D);
      const center3D = average3D(points3D);
      const firstSide = subtract3D(points3D[1], points3D[0]);
      const secondSide = subtract3D(points3D[3], points3D[0]);
      const normal = normalize3D(cross3D(firstSide, secondSide));
      const viewDirection = normalize3D(subtract3D(CAMERA, center3D));
      const fresnel = Math.pow(
        1 - Math.abs(dot3D(normal, viewDirection)),
        2.2,
      );
      const firstLight = faceLight(normal, center3D, KEY_LIGHT_A);
      const secondLight = faceLight(normal, center3D, KEY_LIGHT_B);
      const firstSpecular = faceSpecular(normal, center3D, KEY_LIGHT_A);
      const secondSpecular = faceSpecular(normal, center3D, KEY_LIGHT_B);
      const strongestSpecular = Math.max(firstSpecular, secondSpecular);
      const lightResponse = Math.max(firstLight, secondLight);
      const depth =
        points.reduce((sum, point) => sum + point.z, 0) / points.length;
      const projectedArea = polygonArea(points);
      const areaRatio = clamp(projectedArea / (scale * scale * 2.4), 0, 1);
      const frontness = depthRatio(depth);
      const depthCurve = Math.pow(frontness, 1.55);
      const depthVisibility = 0.24 + depthCurve * 0.76;
      const whitePattern =
        WHITE_FACE_PATTERN[face.orientationIndex % WHITE_FACE_PATTERN.length];

      return {
        index,
        sourceFace: face,
        points,
        depth,
        frontness,
        depthCurve,
        depthVisibility,
        areaRatio,
        fresnel,
        strongestSpecular,
        lightResponse,
        whitePattern,
        colorLayer: face.globalColorLayer,
      };
    });

  // Exactly two global colored layers now have fixed topology. Their physical
  // membership never changes, so there is no ownership pop. Only the projected
  // depth/color dominance is smoothed over about 0.5 seconds.
  const frontnessSmoothing =
    1 - Math.exp(-Math.max(deltaTime, 0.001) * BLOCK_COLOR_RESPONSE);

  for (const face of faceDetails) {
    const previousFrontness = temporalState.faceFrontness.get(face.index);
    const stableFrontness =
      previousFrontness == null
        ? face.frontness
        : previousFrontness +
          (face.frontness - previousFrontness) * frontnessSmoothing;

    temporalState.faceFrontness.set(face.index, stableFrontness);
    face.stableFrontness = stableFrontness;
  }

  const renderedFaces = faceDetails
    .map((face) => {
      const profile =
        face.colorLayer >= 0
          ? COLOR_LAYER_PROFILES[face.colorLayer]
          : UNFILLED_PROFILE;
      const orientationIndex = face.sourceFace.orientationIndex;
      const schemeIndex =
        face.colorLayer >= 0
          ? GLOBAL_LAYER_SCHEME_MAP[face.colorLayer][orientationIndex]
          : orientationIndex;
      const paletteFrontness =
        0.58 + (face.stableFrontness ?? face.frontness) * 0.34;
      const ramp = faceRamp(schemeIndex, paletteFrontness);
      const colorVisibility =
        0.985 + face.areaRatio * 0.01 + face.lightResponse * 0.005;

      return {
        index: face.index,
        points: face.points,
        depth: face.depth,
        stableFrontness: face.stableFrontness ?? face.frontness,
        colorLayer: face.colorLayer,
        rampColors: ramp.rampColors,
        gradientAxis: ramp.gradientAxis,
        prismOpacity: profile.fill * colorVisibility,
        oitWeight:
          face.colorLayer >= 0
            ? 0.72 +
              Math.pow(face.stableFrontness ?? face.frontness, 2.6) * 1.28
            : 0,
        absorptionOpacity:
          profile.absorption +
          face.areaRatio * (face.colorLayer >= 0 ? 0.018 : 0.004) +
          (1 - face.depthCurve) * (face.colorLayer >= 0 ? 0.035 : 0.006),
        whiteStrength:
          profile.white *
          face.whitePattern *
          (0.1 + face.fresnel * 0.3 + face.strongestSpecular * 0.48) *
          (0.42 + face.depthVisibility * 0.58),
        whiteDirection: face.sourceFace.orientationIndex % 2,
        whiteReverse:
          Math.floor(face.sourceFace.orientationIndex / 2) % 2,
        phase:
          ((face.sourceFace.orientationIndex * 0.173) % 1) * 2 - 1,
        edgeLift:
          profile.edgeLift +
          face.fresnel * 0.18 +
          face.strongestSpecular * 0.16,
        rimOpacity:
          profile.rim *
          ((0.035 + face.fresnel * 0.15 + face.strongestSpecular * 0.16) *
            face.depthVisibility +
            face.depthCurve * 0.065),
        rimWidth: 0.62 + face.depthCurve * 0.42,
      };
    })
    .sort((first, second) => {
      const depthDifference = first.depth - second.depth;
      if (Math.abs(depthDifference) > 0.0025) return depthDifference;
      return first.index - second.index;
    });

  const renderedEdges = sourceEdges
    .map(([firstIndex, secondIndex], index) => {
      const first = projectedVertices[firstIndex];
      const second = projectedVertices[secondIndex];
      const deltaX = second.x - first.x;
      const deltaY = second.y - first.y;
      const length = Math.max(Math.hypot(deltaX, deltaY), 0.0001);
      const normalX = -deltaY / length;
      const normalY = deltaX / length;
      const depth = (first.z + second.z) / 2;
      const frontness = depthRatio(depth);
      const depthCurve = Math.pow(frontness, 1.82);
      const center3D = average3D([first.point3D, second.point3D]);
      const direction3D = normalize3D(
        subtract3D(second.point3D, first.point3D),
      );
      const firstLight = edgeLight(direction3D, center3D, KEY_LIGHT_A);
      const secondLight = edgeLight(direction3D, center3D, KEY_LIGHT_B);
      const firstSpecular = edgeSpecular(direction3D, center3D, KEY_LIGHT_A);
      const secondSpecular = edgeSpecular(direction3D, center3D, KEY_LIGHT_B);
      const strongestSpecular = Math.max(firstSpecular, secondSpecular);
      const lightStrength = clamp(
        Math.max(
          firstLight * 0.32 + firstSpecular * 0.68,
          secondLight * 0.32 + secondSpecular * 0.68,
        ),
        0,
        1,
      );
      const split = 0.5 + lightStrength * 0.92 + frontness * 0.16;
      const firstSide = normalX * -0.775 + normalY * -0.632 >= 0 ? 1 : -1;
      const secondSide = normalX * 0.731 + normalY * 0.682 >= 0 ? 1 : -1;
      const firstOffsetX = normalX * split * firstSide;
      const firstOffsetY = normalY * split * firstSide;
      const secondOffsetX = normalX * split * secondSide;
      const secondOffsetY = normalY * split * secondSide;
      const [firstColor, secondColor] = edgePalette(index, frontness);
      const dominantFirst = firstSpecular + firstLight >= secondSpecular + secondLight;
      const dominantOffsetX = dominantFirst ? firstOffsetX : secondOffsetX;
      const dominantOffsetY = dominantFirst ? firstOffsetY : secondOffsetY;
      const depthLighting = 0.2 + depthCurve * 0.8;
      // Every projected edge keeps a real CSS-pixel width. Perspective only
      // scales it between a thin rear edge and a strong foreground edge.
      const coreWidth = 1.55 + depthCurve * 2.25;
      const coreColor = [
        (firstColor[0] + secondColor[0]) * 0.5,
        (firstColor[1] + secondColor[1]) * 0.5,
        (firstColor[2] + secondColor[2]) * 0.5,
      ];
      const edgeCenterX = (first.x + second.x) * 0.5;
      const edgeCenterY = (first.y + second.y) * 0.5;
      const screenDirection = normalize2D([deltaX, deltaY]);
      const viewerDirection = normalize2D([centerX - edgeCenterX, centerY - edgeCenterY]);
      const viewSlide = clamp(
        screenDirection[0] * viewerDirection[0] +
          screenDirection[1] * viewerDirection[1],
        -1,
        1,
      );
      const specularBias = dominantFirst ? -0.045 : 0.045;
      const glintTarget = clamp(0.5 + viewSlide * 0.24 + specularBias, 0.14, 0.86);
      const previousGlint = temporalState.edgeGlints.get(index);
      const glintSmoothing =
        1 - Math.exp(-Math.max(deltaTime, 0.001) * EDGE_GLINT_RESPONSE);
      const glintCenter = previousGlint == null
        ? glintTarget
        : previousGlint + (glintTarget - previousGlint) * glintSmoothing;
      temporalState.edgeGlints.set(index, glintCenter);
      const glintStrength =
        (0.095 + strongestSpecular * 0.34 + lightStrength * 0.08) *
        (0.27 + depthCurve * 0.47);
      const glintSpan = 0.13 + strongestSpecular * 0.045;
      // A minimum front pass keeps rear edges legible through the glass instead
      // of letting the face pass erase their apparent width completely.
      const frontPassOpacity =
        0.32 + smoothstep(0.25, 0.76, frontness) * 0.68;

      return {
        index,
        first,
        second,
        depth,
        frontness,
        firstColor,
        secondColor,
        rearPassOpacity: 1 - frontPassOpacity,
        frontPassOpacity,
        firstOffsetX,
        firstOffsetY,
        secondOffsetX,
        secondOffsetY,
        absorptionOffsetX: -dominantOffsetX * 0.72,
        absorptionOffsetY: -dominantOffsetY * 0.72,
        absorptionWidth: coreWidth * 0.9,
        absorptionOpacity:
          0.18 + lightStrength * 0.16 + (1 - depthCurve) * 0.1,
        coreWidth,
        coreColor,
        coreOpacity:
          0.34 + depthCurve * 0.58 + strongestSpecular * 0.08,
        shellWidth: coreWidth + 0.82,
        shellOpacity:
          0.055 + depthCurve * 0.15 + strongestSpecular * 0.06,
        firstOpacity:
          0.08 +
          (0.24 + firstLight * 0.5 + firstSpecular * 0.82) *
            depthLighting *
            (0.78 + depthCurve * 0.62),
        secondOpacity:
          0.08 +
          (0.24 + secondLight * 0.5 + secondSpecular * 0.82) *
            depthLighting *
            (0.78 + depthCurve * 0.62),
        firstGlowOpacity:
          (0.018 + firstSpecular * 0.08) *
          (0.2 + depthCurve * 0.74) *
          (0.34 + firstLight * 0.56),
        secondGlowOpacity:
          (0.018 + secondSpecular * 0.08) *
          (0.2 + depthCurve * 0.74) *
          (0.34 + secondLight * 0.56),
        glintCenter,
        glintSpan,
        glintStrength,
        glintWidth: coreWidth * 0.76,
      };
    })
    .sort((first, second) => first.depth - second.depth);

  const renderedVertices = projectedVertices.map((vertex, index) => {
    const frontness = depthRatio(vertex.z);
    const depthCurve = Math.pow(frontness, 1.55);

    return {
      ...vertex,
      index,
      radius: 0.24 + depthCurve * 0.74,
      opacity: 0.012 + depthCurve * 0.34,
    };
  });

  return {
    width,
    height,
    deltaTime,
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
  const temporalStateRef = useRef({
    faceFrontness: new Map(),
    edgeGlints: new Map(),
  });

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
    let lastFrameTime = startTime;
    temporalStateRef.current = {
      faceFrontness: new Map(),
      edgeGlints: new Map(),
    };
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
      const deltaTime = clamp((now - lastFrameTime) / 1000, 1 / 240, 0.05);
      lastFrameTime = now;
      const scene = createScene(
        vertices,
        edges,
        faces,
        viewport,
        pointer,
        time,
        deltaTime,
        temporalStateRef.current,
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
