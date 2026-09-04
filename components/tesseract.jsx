"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useSceneAnimationPaused } from "./scene-animation-context";
import { createWebGLRenderer } from "./tesseract-webgl";

const AXES = [0, 1, 2, 3];
const SIGNS = [-1, 1];
const KEY_LIGHT_A = [-3.8, -3.1, 4.6];
const KEY_LIGHT_B = [3.6, 2.8, -3.4];
const CAMERA = [0, 0, 5];
const FOUR_D_PROJECTION_DISTANCE = 3;
const THREE_D_PROJECTION_DISTANCE = 5;
// A radius-2 tesseract projected from w=3 reaches at most 6/sqrt(5) in 3D.
// Using this fixed bound keeps depth-dependent styling stable while rotating.
const PROJECTED_RADIUS_3D = 6 / Math.sqrt(5);
const POINTER_RESPONSE = 7.5;

const PRIMARY_COLORS = {
  red: [0.82, 0.008, 0.018],
  blue: [0, 0.09, 0.74],
  green: [0, 0.56, 0.12],
};
const BLACK_GLASS = [0.002, 0.004, 0.009];
const STRUCTURAL_GLASS_RAMP = [
  [0.025, 0.034, 0.05],
  [0.06, 0.078, 0.105],
];
const STRUCTURAL_GLASS_SCATTER = 0.035;

const EDGE_COLOR_PAIRS = [
  ["blue", "red"],
  ["red", "blue"],
  ["green", "blue"],
  ["blue", "green"],
  ["red", "green"],
  ["green", "red"],
];

const GLOBAL_LAYER_SCHEME_MAP = [
  [0, 1, 0, 1, 2, 0],
  [3, 4, 3, 4, 3, 4],
];

const FACE_COLOR_SCHEMES = [
  ["green", "blue"],
  ["blue", "black"],
  ["green", "black"],
  ["red", "blue"],
  ["red", "black"],
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

const STRUCTURAL_GLASS_PROFILE = {
  fill: 0.22,
  oitWeight: 0.44,
  absorption: 0.018,
  edgeLift: 0.072,
  white: 0.22,
  rim: 0.52,
};

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
  const alignment = dot3D(normal, lightDirection);
  const reflection = Math.max(alignment, 0);
  const transmission = Math.max(-alignment, 0) * 0.28;
  const distance = length3D(toLight);
  const attenuation = 1 / (1 + distance * distance * 0.025);
  return (
    (0.16 + Math.pow(reflection, 1.45) * 0.72 + transmission) *
    attenuation
  );
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
  return Math.pow(Math.max(dot3D(normal, halfVector), 0), 24);
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

          const globalColorLayer =
            firstFixedSign === -1 && secondFixedSign === -1
              ? 0
              : firstFixedSign === 1 && secondFixedSign === 1
                ? 1
                : -1;

          faces.push({
            corners,
            globalColorLayer,
            orientationIndex,
            firstAxis,
            secondAxis,
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
    perspective,
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
  const intensity = 0.7 + depthCurve * 0.26 + lift * 0.01;
  return PRIMARY_COLORS[name].map((channel) =>
    clamp(channel * intensity, 0, 1),
  );
}

function faceStopColor(name, frontness, illumination, lightSide) {
  if (name === "black") {
    const absorptionLift = 0.72 + illumination * 0.38;
    return BLACK_GLASS.map((channel) => channel * absorptionLift);
  }

  const lightGain = lightSide
    ? 0.9 + illumination * 0.28
    : 0.76 + illumination * 0.2;
  return primaryColor(name, frontness, lightSide ? 1.5 : 0).map(
    (channel) => clamp(channel * lightGain, 0, 1),
  );
}

function faceRamp(schemeIndex, frontness, illumination) {
  const scheme = FACE_COLOR_SCHEMES[schemeIndex % FACE_COLOR_SCHEMES.length];
  return {
    rampColors: scheme.map((name, index) =>
      faceStopColor(name, frontness, illumination, index === 0),
    ),
  };
}

function structuralGlassRamp(frontness, illumination) {
  const response = 0.72 + frontness * 0.16 + illumination * 0.12;
  return {
    rampColors: STRUCTURAL_GLASS_RAMP.map((color) => {
      const scaledColor = color.map((channel) =>
        clamp(channel * response, 0, 1),
      );
      return mixColor(
        scaledColor,
        [1, 1, 1],
        STRUCTURAL_GLASS_SCATTER,
      );
    }),
  };
}

function edgePalette(index, frontness) {
  const [firstName, secondName] =
    EDGE_COLOR_PAIRS[index % EDGE_COLOR_PAIRS.length];
  return [
    primaryColor(firstName, frontness, 2),
    primaryColor(secondName, frontness),
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
  const pointerStrength = width <= 768 ? 0.82 : 0.62;
  const pointerSmoothing =
    1 - Math.exp(-Math.max(deltaTime, 1 / 240) * POINTER_RESPONSE);
  temporalState.pointer.x = mixScalar(
    temporalState.pointer.x,
    pointer.x,
    pointerSmoothing,
  );
  temporalState.pointer.y = mixScalar(
    temporalState.pointer.y,
    pointer.y,
    pointerSmoothing,
  );

  // A generic 4D rigid rotation decomposes into two simultaneous rotations in
  // orthogonal planes. XW and YZ commute, so this is a constant SO(4) double
  // rotation instead of six independently time-parameterized Euler rotations.
  const angleXW = time * 0.43;
  const angleYZ = time * 0.19;
  const pointerXY = 0.34 + temporalState.pointer.x * pointerStrength;
  const pointerZW = -0.27 + temporalState.pointer.y * pointerStrength;

  const projectedVertices = sourceVertices.map((vertex) => {
    let point4D = [...vertex];
    point4D = rotate4D(point4D, 0, 3, angleXW);
    point4D = rotate4D(point4D, 1, 2, angleYZ);
    point4D = rotate4D(point4D, 0, 1, pointerXY);
    point4D = rotate4D(point4D, 2, 3, pointerZW);

    let point3D = project4Dto3D(point4D, FOUR_D_PROJECTION_DISTANCE);
    point3D = rotate3DX(point3D, 0.4);
    point3D = rotate3DY(point3D, -0.5);
    point3D = rotate3DZ(point3D, 0.1);

    const point2D = project3Dto2D(
      point3D,
      THREE_D_PROJECTION_DISTANCE,
      centerX,
      centerY,
      scale,
    );

    return {
      ...point2D,
      point3D,
    };
  });

  const depthRatio = (depth) =>
    clamp(
      (depth + PROJECTED_RADIUS_3D) / (PROJECTED_RADIUS_3D * 2),
      0,
      1,
    );

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
    const viewDirection = normalize3D(subtract3D(CAMERA, center3D));
    const geometricNormal = normalize3D(cross3D(firstSide, secondSide));
    const normal =
      dot3D(geometricNormal, viewDirection) >= 0
        ? geometricNormal
        : geometricNormal.map((value) => -value);
    const fresnel = Math.pow(
      1 - clamp(dot3D(normal, viewDirection), 0, 1),
      2.2,
    );
    const firstLight = faceLight(normal, center3D, KEY_LIGHT_A);
    const secondLight = faceLight(normal, center3D, KEY_LIGHT_B);
    const firstSpecular = faceSpecular(normal, center3D, KEY_LIGHT_A);
    const secondSpecular = faceSpecular(normal, center3D, KEY_LIGHT_B);
    const strongestSpecular = Math.max(firstSpecular, secondSpecular);
    const lightResponse = Math.max(firstLight, secondLight);
    const firstTangent = normalize3D(firstSide);
    const secondTangent = normalize3D(secondSide);
    const firstLightDirection = normalize3D(
      subtract3D(KEY_LIGHT_A, center3D),
    );
    const secondLightDirection = normalize3D(
      subtract3D(KEY_LIGHT_B, center3D),
    );
    const firstHalfVector = normalize3D(
      add3D(firstLightDirection, viewDirection),
    );
    const secondHalfVector = normalize3D(
      add3D(secondLightDirection, viewDirection),
    );
    const firstInfluence = firstLight * 0.72 + firstSpecular * 0.28;
    const secondInfluence = secondLight * 0.72 + secondSpecular * 0.28;
    const gradientAxisTarget = [
      -(
        dot3D(firstTangent, firstLightDirection) * firstInfluence +
        dot3D(firstTangent, secondLightDirection) * secondInfluence
      ),
      -(
        dot3D(secondTangent, firstLightDirection) * firstInfluence +
        dot3D(secondTangent, secondLightDirection) * secondInfluence
      ),
    ];
    const highlightVector = add3D(
      firstHalfVector.map(
        (value) => value * (0.08 + firstSpecular * 0.92),
      ),
      secondHalfVector.map(
        (value) => value * (0.08 + secondSpecular * 0.92),
      ),
    );
    const highlightAxis = [
      dot3D(firstTangent, highlightVector),
      dot3D(secondTangent, highlightVector),
    ];
    const gradientOffsetTarget = clamp(
      (firstLight - secondLight) * 0.2 + center3D[2] * 0.025,
      -0.17,
      0.17,
    );
    const gradientSpanTarget =
      1.02 + fresnel * 0.42 + strongestSpecular * 0.32;
    const illuminationTarget = clamp(
      0.28 + lightResponse * 0.72 + strongestSpecular * 0.18,
      0,
      1,
    );
    const depth =
      points.reduce((sum, point) => sum + point.z, 0) / points.length;
    const projectedArea = polygonArea(points);
    const areaRatio = clamp(projectedArea / (scale * scale * 2.4), 0, 1);
    const frontness = depthRatio(depth);
    const depthCurve = Math.pow(frontness, 1.55);
    const depthVisibility = 0.24 + depthCurve * 0.76;

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
      gradientAxisTarget,
      gradientOffsetTarget,
      gradientSpanTarget,
      illuminationTarget,
      highlightAxis,
      highlightOffset: clamp(
        (firstSpecular - secondSpecular) * 0.18,
        -0.16,
        0.16,
      ),
      colorLayer: face.globalColorLayer,
    };
  });

  const renderedFaces = faceDetails
    .map((face) => {
      const isColorFace = face.colorLayer >= 0;
      const profile = isColorFace
        ? COLOR_LAYER_PROFILES[face.colorLayer]
        : STRUCTURAL_GLASS_PROFILE;
      const orientationIndex = face.sourceFace.orientationIndex;
      const schemeIndex = isColorFace
        ? GLOBAL_LAYER_SCHEME_MAP[face.colorLayer][orientationIndex]
        : orientationIndex;
      const paletteFrontness = 0.58 + face.frontness * 0.34;
      const ramp = isColorFace
        ? faceRamp(
            schemeIndex,
            paletteFrontness,
            face.illuminationTarget,
          )
        : structuralGlassRamp(
            paletteFrontness,
            face.illuminationTarget,
          );
      const colorVisibility =
        0.985 + face.areaRatio * 0.01 + face.lightResponse * 0.005;
      const structuralHaloStrength = isColorFace
        ? 0
        : 0.09 +
          face.fresnel * 0.18 +
          face.strongestSpecular * 0.24 +
          face.depthVisibility * 0.05;

      return {
        index: face.index,
        points: face.points,
        depth: face.depth,
        colorLayer: face.colorLayer,
        rampColors: ramp.rampColors,
        gradientAxis: face.gradientAxisTarget,
        gradientOffset: face.gradientOffsetTarget,
        gradientSpan: face.gradientSpanTarget,
        highlightAxis: face.highlightAxis,
        highlightOffset: face.highlightOffset,
        prismOpacity: isColorFace
          ? profile.fill * colorVisibility
          : profile.fill *
            (0.98 + face.areaRatio * 0.025 + structuralHaloStrength * 0.42),
        oitWeight: isColorFace
          ? 0.72 + Math.pow(face.frontness, 2.6) * 1.28
          : profile.oitWeight * (0.82 + face.frontness * 0.38),
        absorptionOpacity:
          profile.absorption +
          face.areaRatio * (isColorFace ? 0.018 : 0.005) +
          (1 - face.depthCurve) * (isColorFace ? 0.035 : 0.008),
        whiteStrength: isColorFace
          ? profile.white *
            (0.08 + face.fresnel * 0.34 + face.strongestSpecular * 0.82) *
            (0.42 + face.depthVisibility * 0.58)
          : profile.white *
            (0.42 +
              face.fresnel * 0.62 +
              face.strongestSpecular * 1.08 +
              structuralHaloStrength * 1.25) *
            (0.58 + face.depthVisibility * 0.42),
        edgeLift: isColorFace
          ? profile.edgeLift +
            face.fresnel * 0.18 +
            face.strongestSpecular * 0.16
          : profile.edgeLift +
            face.fresnel * 0.14 +
            face.strongestSpecular * 0.12 +
            structuralHaloStrength * 0.18,
        rimOpacity: isColorFace
          ? profile.rim *
            ((0.035 + face.fresnel * 0.15 + face.strongestSpecular * 0.16) *
              face.depthVisibility +
              face.depthCurve * 0.065)
          : profile.rim *
            ((0.12 +
              face.fresnel * 0.34 +
              face.strongestSpecular * 0.3 +
              structuralHaloStrength * 0.7) *
              (0.52 + face.depthVisibility * 0.48) +
              face.depthCurve * 0.055),
        rimWidth: isColorFace
          ? 0.62 + face.depthCurve * 0.42
          : 0.92 + face.depthCurve * 0.58,
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
      const split = 0.42 + lightStrength * 0.72;
      const centerX2D = (first.x + second.x) * 0.5;
      const centerY2D = (first.y + second.y) * 0.5;
      const firstLight2D = project3Dto2D(
        KEY_LIGHT_A,
        THREE_D_PROJECTION_DISTANCE,
        centerX,
        centerY,
        scale,
      );
      const secondLight2D = project3Dto2D(
        KEY_LIGHT_B,
        THREE_D_PROJECTION_DISTANCE,
        centerX,
        centerY,
        scale,
      );
      const firstSide =
        (firstLight2D.x - centerX2D) * normalX +
          (firstLight2D.y - centerY2D) * normalY >=
        0
          ? 1
          : -1;
      const secondSide =
        (secondLight2D.x - centerX2D) * normalX +
          (secondLight2D.y - centerY2D) * normalY >=
        0
          ? 1
          : -1;
      const firstOffsetX = normalX * split * firstSide;
      const firstOffsetY = normalY * split * firstSide;
      const secondOffsetX = normalX * split * secondSide;
      const secondOffsetY = normalY * split * secondSide;
      const [firstColor, secondColor] = edgePalette(index, frontness);
      const firstResponse = firstLight + firstSpecular;
      const secondResponse = secondLight + secondSpecular;
      const responseTotal = Math.max(firstResponse + secondResponse, 0.0001);
      const secondMix = secondResponse / responseTotal;
      const dominantOffsetX = mixScalar(
        firstOffsetX,
        secondOffsetX,
        secondMix,
      );
      const dominantOffsetY = mixScalar(
        firstOffsetY,
        secondOffsetY,
        secondMix,
      );
      const depthLighting = 0.2 + depthCurve * 0.8;
      const perspectiveScale = (first.perspective + second.perspective) * 0.5;
      const coreWidth = clamp(1.82 * perspectiveScale, 1.3, 3.6);
      const refractedCoreColor = mixColor(
        firstColor,
        secondColor,
        secondMix * 0.55,
      );
      const coreColor = mixColor(
        refractedCoreColor,
        [1, 1, 1],
        strongestSpecular * 0.46,
      );
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
        shellWidth: coreWidth + 1.08,
        shellOpacity:
          0.1 + depthCurve * 0.2 + strongestSpecular * 0.16,
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
    faces: renderedFaces,
    edges: renderedEdges,
    vertices: renderedVertices,
  };
}

export default function GlassTesseract() {
  const paused = useSceneAnimationPaused();
  const pausedRef = useRef(paused);
  const animationControlRef = useRef(null);
  const canvasRef = useRef(null);
  const vertices = useMemo(() => buildVertices4D(), []);
  const edges = useMemo(() => buildEdges4D(vertices), [vertices]);
  const faces = useMemo(() => buildFaces4D(vertices), [vertices]);
  const temporalStateRef = useRef({
    pointer: { x: 0, y: 0 },
  });

  useLayoutEffect(() => {
    pausedRef.current = paused;
    animationControlRef.current?.sync();
  }, [paused]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let renderer = createWebGLRenderer(canvas);
    let frameId = 0;
    let running = false;
    let elapsedTime = 0;
    let lastFrameTime = null;
    temporalStateRef.current = {
      pointer: { x: 0, y: 0 },
    };
    const viewport = {
      width: 1,
      height: 1,
    };
    const pointer = { x: 0, y: 0 };
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const updateViewport = () => {
      const bounds = canvas.getBoundingClientRect();
      viewport.width = Math.max(bounds.width, 1);
      viewport.height = Math.max(bounds.height, 1);
    };

    const updatePointer = (clientX, clientY) => {
      const bounds = canvas.getBoundingClientRect();
      const width = bounds.width || 1;
      const height = bounds.height || 1;
      pointer.x = clamp(((clientX - bounds.left) / width - 0.5) * 2, -1, 1);
      pointer.y = clamp(((clientY - bounds.top) / height - 0.5) * 2, -1, 1);
    };

    const handlePointerMove = (event) => {
      updatePointer(event.clientX, event.clientY);
      if (!running) renderFrame(elapsedTime, 1 / 60);
    };

    const handleContextLost = (event) => {
      event.preventDefault();
      renderer = null;
    };

    const handleContextRestored = () => {
      renderer = createWebGLRenderer(canvas);
      lastFrameTime = null;
      if (!running) renderFrame(elapsedTime, 1 / 60);
    };

    function renderFrame(time, deltaTime) {
      if (!renderer) return;
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
    }

    const animate = (now) => {
      if (!running) return;
      const deltaTime =
        lastFrameTime == null
          ? 1 / 60
          : clamp((now - lastFrameTime) / 1000, 1 / 240, 0.05);
      lastFrameTime = now;
      elapsedTime += deltaTime;
      renderFrame(elapsedTime, deltaTime);
      frameId = requestAnimationFrame(animate);
    };

    const syncAnimation = () => {
      const shouldRun =
        !pausedRef.current && !document.hidden && !reducedMotion.matches;

      if (shouldRun === running) return;
      running = shouldRun;
      lastFrameTime = null;

      if (running) {
        frameId = requestAnimationFrame(animate);
      } else {
        cancelAnimationFrame(frameId);
        renderFrame(elapsedTime, 1 / 60);
      }
    };

    const handleViewportChange = () => {
      updateViewport();
      if (!running) renderFrame(elapsedTime, 1 / 60);
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(handleViewportChange);

    updateViewport();
    renderFrame(elapsedTime, 1 / 60);
    animationControlRef.current = { sync: syncAnimation };
    syncAnimation();
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("visibilitychange", syncAnimation);
    reducedMotion.addEventListener("change", syncAnimation);
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    return () => {
      running = false;
      cancelAnimationFrame(frameId);
      animationControlRef.current = null;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", syncAnimation);
      reducedMotion.removeEventListener("change", syncAnimation);
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
        height: "100%",
        background: "transparent",
      }}
    />
  );
}
