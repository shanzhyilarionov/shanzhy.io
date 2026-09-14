/**
 * Builds one frame's worth of renderable data from the 4D geometry.
 *
 * This module owns geometry and the shading that genuinely has to happen per
 * face or per edge (there are only 24 and 32 of them). Everything that varies
 * across a surface — diffuse falloff, Fresnel, the specular lobe, Beer-Lambert
 * absorption — is left to the fragment shader, so faces are shaded per pixel
 * rather than flat.
 */

import {
  PROJECTED_RADIUS_3D,
  W_PROJECTION_DISTANCE,
  Z_PROJECTION_DISTANCE,
  average3D,
  clamp,
  cross3D,
  dot3D,
  length3D,
  dot4D,
  faceNormal4D,
  frontness,
  mixScalar,
  normalize3D,
  project3Dto2D,
  project4Dto3D,
  rotate3DX,
  rotate3DY,
  rotate3DZ,
  rotateAll4D,
  smoothstep,
  subtract3D,
} from "./geometry.mjs";
import { GLASS_F0, LOOK } from "./look.js";
import { DISPERSION, faceTint } from "./palette.js";

/** Screen-space size of the object, preserving the original responsive rules. */
function layoutScale(width, height) {
  const layout = LOOK.layout;
  const compactProgress = clamp(
    (layout.compactStart - width) / layout.compactRange,
    0,
    1,
  );
  const compactScale = 1 - compactProgress * layout.compactAmount;
  const narrowTransition = clamp(
    (layout.narrowStart - width) / layout.narrowRange,
    0,
    1,
  );
  const plateauScale = Math.min(layout.plateauScale, height * layout.baseScale);
  const minimumScale =
    plateauScale - narrowTransition * (plateauScale - layout.narrowFloor);

  return Math.max(
    minimumScale,
    Math.min(width, height) * layout.baseScale * compactScale,
  );
}

/**
 * How much glass a pane is made of, relative to a pane of the undistorted
 * tesseract.
 *
 * Every pane shared one thickness before this, which made the accumulated
 * optical depth a fiction: the 4D projection stretches the cell nearest the
 * eye point in w and squeezes the far one, so the panes genuinely differ in
 * size by about a factor of two, and a pane twice as wide is twice as thick.
 * Taking the square root of the quad's own area in 3D gets that from the
 * geometry itself, without needing the 4D coordinates back, and it follows
 * every distortion the projection applies rather than only the w scale.
 *
 * The reference is the undistorted face: edge 2, so area 4, so span 2.
 */
function paneSpan(points3D) {
  const first = subtract3D(points3D[1], points3D[0]);
  const second = subtract3D(points3D[2], points3D[0]);
  const third = subtract3D(points3D[3], points3D[0]);
  const area =
    0.5 *
    (length3D(cross3D(first, second)) + length3D(cross3D(second, third)));

  return Math.sqrt(area) / 2;
}

/** Radiance arriving at a point from one light, with inverse-square falloff. */
function lightSample(light, point) {
  const toLight = subtract3D(light.position, point);
  const distanceSquared = Math.max(dot3D(toLight, toLight), 1e-4);
  const distance = Math.sqrt(distanceSquared);
  const direction = [
    toLight[0] / distance,
    toLight[1] / distance,
    toLight[2] / distance,
  ];
  const attenuation = light.intensity / distanceSquared;

  return { direction, distance, attenuation };
}

/**
 * Kajiya-Kay shading for a cylinder: the response depends on the angle
 * between the tangent and the light, as sin rather than cos. The exact form
 * is sin(theta) = sqrt(1 - (T.L)^2), which is what this uses instead of the
 * `1 - |T.L|` approximation.
 */
function tangentSin(tangent, direction) {
  const alignment = dot3D(tangent, direction);
  return Math.sqrt(Math.max(0, 1 - alignment * alignment));
}

/**
 * The two numbers a rod's travelling highlight needs at one of its ends.
 *
 * `alignment` is T.H there — the Kajiya-Kay specular condition for a cylinder
 * is that the half-vector stands perpendicular to the tangent, so the
 * highlight sits wherever this crosses zero. Handing the ends to the shader
 * and letting it interpolate puts the bright spot exactly at that crossing,
 * per pixel, and moves it as smoothly as the geometry moves.
 *
 * Solving for the crossing on the CPU instead — or worse, sampling a handful
 * of points and keeping the best — gives one position for the whole rod, and
 * that position has to jump when the crossing leaves the segment through one
 * end and re-enters through the other.
 */
function glintAtEnd(point, tangent, light, camera) {
  const sample = lightSample(light, point);
  const toEye = normalize3D(subtract3D(camera, point));
  const half = normalize3D([
    sample.direction[0] + toEye[0],
    sample.direction[1] + toEye[1],
    sample.direction[2] + toEye[2],
  ]);

  return {
    alignment: dot3D(tangent, half),
    weight: sample.attenuation,
  };
}

function schlick(cosTheta, f0) {
  return f0 + (1 - f0) * (1 - clamp(cosTheta, 0, 1)) ** 5;
}

export function createScene(
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
  const scale = layoutScale(width, height);
  const camera = LOOK.camera.position;
  const motion = LOOK.motion;

  const pointerStrength =
    width <= LOOK.layout.mobileWidth
      ? LOOK.camera.pointerStrengthMobile
      : LOOK.camera.pointerStrengthDesktop;
  const pointerSmoothing =
    1 - Math.exp(-Math.max(deltaTime, 1 / 240) * LOOK.camera.pointerResponse);
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

  const rotations = [
    [0, 3, time * motion.speedXW],
    [1, 2, time * motion.speedYZ],
    [0, 1, motion.biasXY],
    [2, 3, motion.biasZW],
  ];

  const toViewSpace = (point4D) => {
    const rotated = rotateAll4D(point4D, rotations);
    let point3D = project4Dto3D(rotated, W_PROJECTION_DISTANCE);
    point3D = rotate3DX(point3D, LOOK.camera.tiltX);
    point3D = rotate3DY(point3D, LOOK.camera.tiltY);
    point3D = rotate3DZ(point3D, LOOK.camera.rollZ);
    // Tilt the projected object as a whole, preserving its animated 3D shape.
    point3D = rotate3DX(point3D, -temporalState.pointer.y * pointerStrength);
    point3D = rotate3DY(point3D, temporalState.pointer.x * pointerStrength);
    return { rotated, point3D };
  };

  const projectedVertices = sourceVertices.map((vertex) => {
    const { point3D } = toViewSpace(vertex);
    const point2D = project3Dto2D(
      point3D,
      Z_PROJECTION_DISTANCE,
      centerX,
      centerY,
      scale,
    );

    return { ...point2D, point3D };
  });

  /* ---------------------------------------------------------------- */
  /* Faces                                                            */
  /* ---------------------------------------------------------------- */

  /* A rod is made of the same glass as the panes it joins, so it absorbs in
     their colour. Collected while the faces are built: each face hands its
     tint to the four tesseract edges its boundary runs along. */
  const edgeKey = (first, second) =>
    first < second ? `${first},${second}` : `${second},${first}`;
  const edgeIndexByPair = new Map(
    sourceEdges.map(([first, second], index) => [edgeKey(first, second), index]),
  );
  const edgeTints = sourceEdges.map(() => [0, 0, 0, 0]);

  const fourD = LOOK.fourD;
  const faces = sourceFaces.map((face) => {
    const points3D = face.corners.map(
      (vertexIndex) => projectedVertices[vertexIndex].point3D,
    );
    const center3D = average3D(points3D);
    const viewDirection = normalize3D(subtract3D(camera, center3D));

    /* The pane's own axes, along +u and +v. The shader builds the normal from
       their cross product and bends it towards whichever boundary is nearest,
       so it needs the axes rather than a normal. They are handed over already
       oriented so that cross(tangent, bitangent) faces the viewer. */
    const tangent = normalize3D(subtract3D(points3D[1], points3D[0]));
    let bitangent = normalize3D(subtract3D(points3D[3], points3D[0]));

    if (dot3D(cross3D(tangent, bitangent), viewDirection) < 0) {
      bitangent = bitangent.map((value) => -value);
    }

    /* How the face is turned in 4D, independent of the 3D projection. */
    const rotatedNormal4D = rotateAll4D(faceNormal4D(face), rotations);
    const fourDAlignment = dot4D(rotatedNormal4D, normalize4(fourD.direction));
    const fourDGain = mixScalar(
      1,
      fourD.ambient + (1 - fourD.ambient) * (fourDAlignment * 0.5 + 0.5),
      fourD.weight,
    );

    const isTinted = face.cellLayer >= 0;
    const glass = LOOK.glass;
    const tint = faceTint(face.cellLayer, face.orientationIndex);

    for (let corner = 0; corner < 4; corner++) {
      const index = edgeIndexByPair.get(
        edgeKey(face.corners[corner], face.corners[(corner + 1) % 4]),
      );

      if (index === undefined) continue;

      const slot = edgeTints[index];
      slot[0] += tint[0];
      slot[1] += tint[1];
      slot[2] += tint[2];
      slot[3] += 1;
    }

    return {
      points3D,
      tangent,
      bitangent,
      tint,
      thickness: glass.thickness * paneSpan(points3D),
      density: isTinted ? glass.tintedDensity : glass.structuralDensity,
      scatterGain:
        (isTinted ? glass.scatterTinted : glass.scatterStructural) * fourDGain,
    };
  });

  /* Faces are deliberately not sorted: the renderer composites them
     order-independently, because several of them share a centre depth
     exactly and any order that swaps mid-rotation shows up as a pane
     changing colour in a single frame. */

  /* ---------------------------------------------------------------- */
  /* Edges                                                            */
  /* ---------------------------------------------------------------- */

  const edgeLook = LOOK.edges;

  const edges = sourceEdges.map(([firstIndex, secondIndex], edgeIndex) => {
    const first = projectedVertices[firstIndex];
    const second = projectedVertices[secondIndex];
    const deltaX = second.x - first.x;
    const deltaY = second.y - first.y;
    const screenLength = Math.max(Math.hypot(deltaX, deltaY), 1e-4);
    const normalX = -deltaY / screenLength;
    const normalY = deltaX / screenLength;

    const center3D = average3D([first.point3D, second.point3D]);
    const tangent = normalize3D(subtract3D(second.point3D, first.point3D));
    const viewDirection = normalize3D(subtract3D(camera, center3D));
    const depth = (first.point3D[2] + second.point3D[2]) / 2;
    const front = frontness(depth);
    const depthCurve = front ** edgeLook.depthCurve;
    const depthGain =
      edgeLook.depthFloor + (1 - edgeLook.depthFloor) * depthCurve;

    let diffuse = 0;
    let specular = 0;
    let bendX = 0;
    let bendY = 0;
    let dominant = 0;
    const radiance = [0, 0, 0];

    for (const light of LOOK.lights) {
      const sample = lightSample(light, center3D);
      const half = normalize3D([
        sample.direction[0] + viewDirection[0],
        sample.direction[1] + viewDirection[1],
        sample.direction[2] + viewDirection[2],
      ]);
      const lobe = tangentSin(tangent, half) ** LOOK.glass.specularExponent;
      const wrap = tangentSin(tangent, sample.direction);
      const fresnel = schlick(Math.abs(dot3D(tangent, half)), GLASS_F0);
      const response = sample.attenuation * (wrap * 0.35 + lobe * 2.2 * fresnel);

      diffuse += sample.attenuation * wrap;
      specular += sample.attenuation * lobe;
      radiance[0] += light.color[0] * response;
      radiance[1] += light.color[1] * response;
      radiance[2] += light.color[2] * response;

      /* Which way this light pushes the refracted fringe, in screen space. */
      const light2D = project3Dto2D(
        light.position,
        Z_PROJECTION_DISTANCE,
        centerX,
        centerY,
        scale,
      );
      const side =
        (light2D.x - (first.x + second.x) * 0.5) * normalX +
          (light2D.y - (first.y + second.y) * 0.5) * normalY >=
        0
          ? 1
          : -1;

      if (sample.attenuation > dominant) dominant = sample.attenuation;
      bendX += normalX * side * sample.attenuation;
      bendY += normalY * side * sample.attenuation;
    }

    /* The travelling highlight, as the shader wants it: T.H and a brightness
       at each end of the rod, for each light. The eye and the lights are at
       finite distance, so these differ end to end, and where the interpolated
       T.H crosses zero is where the highlight lands. */
    const glintGain = edgeLook.glintIntensity * depthGain;

    const glint = LOOK.lights.map((light) => [
      glintAtEnd(first.point3D, tangent, light, camera),
      glintAtEnd(second.point3D, tangent, light, camera),
    ]);
    const glintStart = glint.map(([near]) => [
      near.alignment,
      near.weight * glintGain,
    ]);
    const glintEnd = glint.map(([, far]) => [
      far.alignment,
      far.weight * glintGain,
    ]);

    const bendLength = Math.max(Math.hypot(bendX, bendY), 1e-4);
    const bendDirection = [bendX / bendLength, bendY / bendLength];
    const perspective = (first.perspective + second.perspective) * 0.5;
    const coreWidth = clamp(
      edgeLook.baseWidth * perspective,
      edgeLook.minWidth,
      edgeLook.maxWidth,
    );
    const spectralStrength =
      (0.25 + clamp(specular * 0.5, 0, 1) * 0.75) * depthGain;

    return {
      x1: first.x,
      y1: first.y,
      x2: second.x,
      y2: second.y,
      normalX,
      normalY,
      bendDirection,
      coreWidth,
      coreColor: radiance,
      coreIntensity: edgeLook.coreIntensity * depthGain,
      spectralStrength: edgeLook.dispersionIntensity * spectralStrength,
      glintStart,
      glintEnd,
      spread: edgeLook.dispersionSpread * (0.6 + clamp(diffuse, 0, 1) * 0.9),
      depth,
      /* The rod's depth at each end. The renderer turns these into a real
         clip-space z so the depth buffer can decide, per pixel, which parts
         of the rod are behind the glass and which are in front. */
      z1: first.point3D[2],
      z2: second.point3D[2],
      /* The glass this rod is made of, averaged over the panes that meet
         along it. Without a tint the rod could only add light; with one it
         absorbs like the rest of the object, which is what stops an edge
         reading as more transparent than the faces it joins. */
      tint: [
        edgeTints[edgeIndex][0] / Math.max(edgeTints[edgeIndex][3], 1),
        edgeTints[edgeIndex][1] / Math.max(edgeTints[edgeIndex][3], 1),
        edgeTints[edgeIndex][2] / Math.max(edgeTints[edgeIndex][3], 1),
      ],
    };
  });

  edges.sort((first, second) => first.depth - second.depth);

  return {
    width,
    height,
    scale,
    centerX,
    centerY,
    camera,
    faces,
    edges,
    dispersion: DISPERSION.map((entry) => ({
      color: entry.color,
      offset: LOOK.edges.dispersionOffsets[entry.key],
    })),
    projectedRadius: PROJECTED_RADIUS_3D,
    zDistance: Z_PROJECTION_DISTANCE,
  };
}

function normalize4(vector) {
  const length =
    Math.hypot(vector[0], vector[1], vector[2], vector[3]) || 1;
  return [
    vector[0] / length,
    vector[1] / length,
    vector[2] / length,
    vector[3] / length,
  ];
}
