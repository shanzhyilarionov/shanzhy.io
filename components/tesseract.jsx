"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useSceneAnimationPaused } from "./scene-animation-context";

const AXES = [0, 1, 2, 3];
const SIGNS = [-1, 1];
const CYAN = "#00e8e0";
const ORANGE = "#ff681f";
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

function pointsAttribute(points) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function spectralColor(hue, frontness) {
  const depthCurve = Math.pow(frontness, 1.6);
  const saturation = 30 + depthCurve * 70;
  const lightness = 19 + depthCurve * 41;

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
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

function indexedElements(group, selector, count) {
  const elements = new Array(count);

  if (!group) {
    return elements;
  }

  for (const element of group.querySelectorAll(selector)) {
    elements[Number(element.dataset.index)] = element;
  }

  return elements;
}

function collectPassStore(svg, passName, edgeCount, opacityKey) {
  const group = (layer) =>
    svg.querySelector(
      '[data-pass="' + passName + '"][data-layer="' + layer + '"]',
    );
  const groups = {
    shell: group("shell"),
    absorption: group("absorption"),
    spectral: group("spectral"),
    core: group("core"),
  };

  return {
    opacityKey,
    edgeOrder: null,
    groups,
    shell: indexedElements(groups.shell, "line[data-index]", edgeCount),
    absorption: indexedElements(
      groups.absorption,
      "line[data-index]",
      edgeCount,
    ),
    cyan: indexedElements(
      groups.spectral,
      'line[data-color="cyan"]',
      edgeCount,
    ),
    orange: indexedElements(
      groups.spectral,
      'line[data-color="orange"]',
      edgeCount,
    ),
    core: indexedElements(groups.core, "line[data-index]", edgeCount),
  };
}

function collectElementStore(svg, edgeCount, faceCount, vertexCount) {
  const bloomGroup = svg.querySelector('[data-layer="bloom"]');
  const faceGroup = svg.querySelector('[data-layer="faces"]');
  const faces = new Array(faceCount);

  for (const group of faceGroup.querySelectorAll("g[data-index]")) {
    const index = Number(group.dataset.index);
    faces[index] = {
      group,
      absorption: group.querySelector('[data-face-layer="absorption"]'),
      glass: group.querySelector('[data-face-layer="glass"]'),
      cyan: group.querySelector('[data-face-layer="cyan"]'),
      orange: group.querySelector('[data-face-layer="orange"]'),
    };
  }

  return {
    svg,
    bloomGroup,
    bloomOrder: null,
    bloomCyan: indexedElements(
      bloomGroup,
      'line[data-color="cyan"]',
      edgeCount,
    ),
    bloomOrange: indexedElements(
      bloomGroup,
      'line[data-color="orange"]',
      edgeCount,
    ),
    rear: collectPassStore(svg, "rear", edgeCount, "rearPassOpacity"),
    front: collectPassStore(svg, "front", edgeCount, "frontPassOpacity"),
    faceGroup,
    faceOrder: null,
    faces,
    vertices: indexedElements(
      svg.querySelector('[data-layer="vertices"]'),
      "circle[data-index]",
      vertexCount,
    ),
  };
}

function sameOrder(first, second) {
  if (!first || first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) {
      return false;
    }
  }

  return true;
}

function appendInOrder(group, elements, order) {
  if (!group) {
    return;
  }

  for (const index of order) {
    const element = elements[index];

    if (element) {
      group.appendChild(element);
    }
  }
}

function syncPassOrder(pass, order) {
  if (sameOrder(pass.edgeOrder, order)) {
    return;
  }

  appendInOrder(pass.groups.shell, pass.shell, order);
  appendInOrder(pass.groups.absorption, pass.absorption, order);
  appendInOrder(pass.groups.spectral, pass.cyan, order);
  appendInOrder(pass.groups.spectral, pass.orange, order);
  appendInOrder(pass.groups.core, pass.core, order);
  pass.edgeOrder = [...order];
}

function syncSceneOrder(store, scene) {
  const edgeOrder = scene.edges.map((edge) => edge.index);

  if (!sameOrder(store.bloomOrder, edgeOrder)) {
    appendInOrder(store.bloomGroup, store.bloomCyan, edgeOrder);
    appendInOrder(store.bloomGroup, store.bloomOrange, edgeOrder);
    store.bloomOrder = [...edgeOrder];
  }

  syncPassOrder(store.rear, edgeOrder);
  syncPassOrder(store.front, edgeOrder);

  const faceOrder = scene.faces.map((face) => face.index);

  if (!sameOrder(store.faceOrder, faceOrder)) {
    appendInOrder(
      store.faceGroup,
      store.faces.map((face) => face.group),
      faceOrder,
    );
    store.faceOrder = [...faceOrder];
  }
}

function setLine(
  line,
  firstX,
  firstY,
  secondX,
  secondY,
  opacity,
  width,
  stroke,
) {
  if (!line) {
    return;
  }

  line.setAttribute("x1", firstX);
  line.setAttribute("y1", firstY);
  line.setAttribute("x2", secondX);
  line.setAttribute("y2", secondY);
  line.setAttribute("stroke-opacity", opacity);
  line.setAttribute("stroke-width", width);

  if (stroke) {
    line.setAttribute("stroke", stroke);
  }
}

function updatePass(edge, pass) {
  const passOpacity = edge[pass.opacityKey];

  setLine(
    pass.shell[edge.index],
    edge.first.x,
    edge.first.y,
    edge.second.x,
    edge.second.y,
    edge.shellOpacity * passOpacity,
    edge.shellWidth,
  );
  setLine(
    pass.absorption[edge.index],
    edge.first.x + edge.absorptionOffsetX,
    edge.first.y + edge.absorptionOffsetY,
    edge.second.x + edge.absorptionOffsetX,
    edge.second.y + edge.absorptionOffsetY,
    edge.absorptionOpacity * passOpacity,
    edge.absorptionWidth,
  );
  setLine(
    pass.cyan[edge.index],
    edge.first.x + edge.cyanOffsetX,
    edge.first.y + edge.cyanOffsetY,
    edge.second.x + edge.cyanOffsetX,
    edge.second.y + edge.cyanOffsetY,
    edge.cyanOpacity * passOpacity,
    edge.coreWidth * 1.02,
    edge.cyanColor,
  );
  setLine(
    pass.orange[edge.index],
    edge.first.x + edge.orangeOffsetX,
    edge.first.y + edge.orangeOffsetY,
    edge.second.x + edge.orangeOffsetX,
    edge.second.y + edge.orangeOffsetY,
    edge.orangeOpacity * passOpacity,
    edge.coreWidth * 0.96,
    edge.orangeColor,
  );
  setLine(
    pass.core[edge.index],
    edge.first.x,
    edge.first.y,
    edge.second.x,
    edge.second.y,
    edge.coreOpacity * passOpacity,
    edge.coreWidth * 0.74,
  );
}

function applyScene(scene, store) {
  if (!store.svg) {
    return;
  }

  store.svg.setAttribute("width", scene.width);
  store.svg.setAttribute("height", scene.height);
  store.svg.setAttribute("viewBox", "0 0 " + scene.width + " " + scene.height);
  syncSceneOrder(store, scene);

  for (const edge of scene.edges) {
    setLine(
      store.bloomCyan[edge.index],
      edge.first.x + edge.cyanOffsetX,
      edge.first.y + edge.cyanOffsetY,
      edge.second.x + edge.cyanOffsetX,
      edge.second.y + edge.cyanOffsetY,
      edge.cyanGlowOpacity,
      edge.coreWidth * 4.5 + 4,
      edge.cyanColor,
    );
    setLine(
      store.bloomOrange[edge.index],
      edge.first.x + edge.orangeOffsetX,
      edge.first.y + edge.orangeOffsetY,
      edge.second.x + edge.orangeOffsetX,
      edge.second.y + edge.orangeOffsetY,
      edge.orangeGlowOpacity,
      edge.coreWidth * 4.5 + 4,
      edge.orangeColor,
    );
    updatePass(edge, store.rear);
    updatePass(edge, store.front);
  }

  for (const face of scene.faces) {
    const elements = store.faces[face.index];
    const points = pointsAttribute(face.points);

    if (elements.absorption) {
      elements.absorption.setAttribute("points", points);
      elements.absorption.setAttribute(
        "fill-opacity",
        face.absorptionOpacity,
      );
    }

    if (elements.glass) {
      elements.glass.setAttribute("points", points);
      elements.glass.setAttribute("fill-opacity", face.glassOpacity);
      elements.glass.setAttribute("stroke-opacity", face.rimOpacity);
    }

    if (elements.cyan) {
      elements.cyan.setAttribute("points", points);
      elements.cyan.setAttribute("fill", face.cyanColor);
      elements.cyan.setAttribute("fill-opacity", face.cyanOpacity);
    }

    if (elements.orange) {
      elements.orange.setAttribute("points", points);
      elements.orange.setAttribute("fill", face.orangeColor);
      elements.orange.setAttribute("fill-opacity", face.orangeOpacity);
    }
  }

  for (const vertex of scene.vertices) {
    const circle = store.vertices[vertex.index];

    if (!circle) {
      continue;
    }

    circle.setAttribute("cx", vertex.x);
    circle.setAttribute("cy", vertex.y);
    circle.setAttribute("r", vertex.radius * 2.24);
    circle.setAttribute("opacity", vertex.opacity);
  }
}

function GlassEdgeLayers({ edges, passName }) {
  return (
    <>
      <g
        data-pass={passName}
        data-layer="shell"
        filter="url(#glass-shell-glow)"
        style={{ mixBlendMode: "screen" }}
      >
        {edges.map((_, index) => (
          <line
            key={"glass-shell-" + index}
            data-index={index}
            x1="0"
            y1="0"
            x2="0"
            y2="0"
            stroke="#eaffff"
            strokeOpacity="0"
            strokeWidth="0"
            strokeLinecap="round"
          />
        ))}
      </g>

      <g
        data-pass={passName}
        data-layer="absorption"
      >
        {edges.map((_, index) => (
          <line
            key={"absorption-" + index}
            data-index={index}
            x1="0"
            y1="0"
            x2="0"
            y2="0"
            stroke="#020505"
            strokeOpacity="0"
            strokeWidth="0"
            strokeLinecap="round"
          />
        ))}
      </g>

      <g
        data-pass={passName}
        data-layer="spectral"
        style={{ mixBlendMode: "screen" }}
      >
        {edges.map((_, index) => (
          <line
            key={"cyan-refraction-" + index}
            data-color="cyan"
            data-index={index}
            x1="0"
            y1="0"
            x2="0"
            y2="0"
            stroke="#000000"
            strokeOpacity="0"
            strokeWidth="0"
            strokeLinecap="round"
          />
        ))}

        {edges.map((_, index) => (
          <line
            key={"orange-refraction-" + index}
            data-color="orange"
            data-index={index}
            x1="0"
            y1="0"
            x2="0"
            y2="0"
            stroke="#000000"
            strokeOpacity="0"
            strokeWidth="0"
            strokeLinecap="round"
          />
        ))}
      </g>

      <g
        data-pass={passName}
        data-layer="core"
        filter="url(#glass-glow)"
        style={{ mixBlendMode: "screen" }}
      >
        {edges.map((_, index) => (
          <line
            key={"core-" + index}
            data-index={index}
            x1="0"
            y1="0"
            x2="0"
            y2="0"
            stroke="#f7ffff"
            strokeOpacity="0"
            strokeWidth="0"
            strokeLinecap="round"
          />
        ))}
      </g>
    </>
  );
}

export default function GlassTesseract() {
  const paused = useSceneAnimationPaused();
  const pausedRef = useRef(paused);
  const svgRef = useRef(null);

  const vertices = useMemo(() => buildVertices4D(), []);
  const edges = useMemo(() => buildEdges4D(vertices), [vertices]);
  const faces = useMemo(() => buildFaces4D(vertices), [vertices]);
  useLayoutEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useLayoutEffect(() => {
    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    const elements = collectElementStore(
      svg,
      edges.length,
      faces.length,
      vertices.length,
    );
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

    const renderFrame = (now) => {
      if (pausedRef.current || document.hidden) {
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
      applyScene(scene, elements);
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

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [edges, faces, vertices]);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        background: "transparent",
      }}
    >
      <svg
        ref={svgRef}
        aria-hidden="true"
        width="1200"
        height="800"
        viewBox="0 0 1200 800"
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="glass-body" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="28%" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="62%" stopColor="#ffffff" stopOpacity="0.13" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
          </linearGradient>

          <linearGradient id="glass-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={CYAN} stopOpacity="0.9" />
            <stop offset="42%" stopColor={CYAN} stopOpacity="0.18" />
            <stop offset="78%" stopColor={CYAN} stopOpacity="0.04" />
            <stop offset="100%" stopColor={CYAN} stopOpacity="0" />
          </linearGradient>

          <linearGradient id="glass-orange" x1="100%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={ORANGE} stopOpacity="0.9" />
            <stop offset="42%" stopColor={ORANGE} stopOpacity="0.18" />
            <stop offset="78%" stopColor={ORANGE} stopOpacity="0.04" />
            <stop offset="100%" stopColor={ORANGE} stopOpacity="0" />
          </linearGradient>

          <radialGradient id="glass-junction">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="30%" stopColor={CYAN} stopOpacity="0.52" />
            <stop offset="68%" stopColor={ORANGE} stopOpacity="0.2" />
            <stop offset="100%" stopColor={ORANGE} stopOpacity="0" />
          </radialGradient>

          <filter
            id="spectral-bloom"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="9.5" />
          </filter>

          <filter
            id="glass-shell-glow"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="4.6" result="shellHaze" />
            <feMerge>
              <feMergeNode in="shellHaze" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter
            id="glass-glow"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="4.1" result="softGlow" />
            <feMerge>
              <feMergeNode in="softGlow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g>
          <g
            data-layer="bloom"
            filter="url(#spectral-bloom)"
            style={{ mixBlendMode: "screen" }}
          >
            {edges.map((_, index) => (
              <line
                key={"cyan-bloom-" + index}
                data-color="cyan"
                data-index={index}
                x1="0"
                y1="0"
                x2="0"
                y2="0"
                stroke="#000000"
                strokeOpacity="0"
                strokeWidth="0"
                strokeLinecap="round"
              />
            ))}

            {edges.map((_, index) => (
              <line
                key={"orange-bloom-" + index}
                data-color="orange"
                data-index={index}
                x1="0"
                y1="0"
                x2="0"
                y2="0"
                stroke="#000000"
                strokeOpacity="0"
                strokeWidth="0"
                strokeLinecap="round"
              />
            ))}
          </g>

          <GlassEdgeLayers edges={edges} passName="rear" />

          <g data-layer="faces">
            {faces.map((_, index) => (
              <g
                key={"face-" + index}
                data-index={index}
              >
                <polygon
                  data-face-layer="absorption"
                  points=""
                  fill="#020606"
                  fillOpacity="0"
                />
                <g style={{ mixBlendMode: "screen" }}>
                  <polygon
                    data-face-layer="glass"
                    points=""
                    fill="url(#glass-body)"
                    fillOpacity="0"
                    stroke="#f4ffff"
                    strokeOpacity="0"
                    strokeWidth="0.6"
                    strokeLinejoin="round"
                  />
                  <polygon
                    data-face-layer="cyan"
                    points=""
                    fill="#000000"
                    fillOpacity="0"
                  />
                  <polygon
                    data-face-layer="orange"
                    points=""
                    fill="#000000"
                    fillOpacity="0"
                  />
                </g>
              </g>
            ))}
          </g>

          <GlassEdgeLayers edges={edges} passName="front" />

          <g data-layer="vertices">
            {vertices.map((_, index) => (
              <circle
                key={"junction-" + index}
                data-index={index}
                cx="0"
                cy="0"
                r="0"
                fill="url(#glass-junction)"
                opacity="0"
              />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
