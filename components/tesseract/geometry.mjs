/**
 * Pure 4D geometry for the tesseract.
 *
 * Nothing in this module touches React, the DOM or WebGL, so it can be unit
 * tested with `node --test`. Everything downstream (shading, rendering) is
 * built on top of the primitives defined here.
 */

export const AXES = [0, 1, 2, 3];
const SIGNS = [-1, 1];

/** |v| for a vertex of the (±1, ±1, ±1, ±1) tesseract. */
export const TESSERACT_RADIUS = 2;

/** Distance of the 4D eye point along +w. */
export const W_PROJECTION_DISTANCE = 3;

/** Distance of the 3D eye point along +z. */
export const Z_PROJECTION_DISTANCE = 5;

/**
 * Largest |P(v)| reachable in 3D after the 4D perspective projection, over all
 * rotations of a radius-2 tesseract projected from w = 3.
 *
 * Maximising f(w) = sqrt(4 - w^2) * 3 / (3 - w) gives f'(w) = 0 at w = 4/3,
 * and f(4/3) = (2*sqrt(5)/3) * (9/5) = 6/sqrt(5).
 *
 * Using this closed-form bound (instead of a per-frame min/max) keeps every
 * depth-dependent effect stable while the object rotates.
 */
export const PROJECTED_RADIUS_3D = 6 / Math.sqrt(5);

/** The 16 vertices of the tesseract, as (±1, ±1, ±1, ±1). */
export function buildVertices4D() {
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

/** The 32 edges: vertex pairs at Hamming distance 1. */
export function buildEdges4D(vertices) {
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

/**
 * The 24 square faces: one for each choice of a spanning 2-plane
 * (C(4,2) = 6 of them) and each sign assignment of the two fixed axes (4).
 *
 * `cellLayer` marks the two "corner" cells — the faces where both fixed axes
 * agree in sign. Those two families carry the warm and cool tints; every other
 * face is neutral structural glass.
 *
 * `fixedAxes` / `fixedSigns` describe the face's position in the 2D space
 * normal to it, which is what the optional 4D lighting term uses.
 */
export function buildFaces4D(vertices) {
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

          const cellLayer =
            firstFixedSign === -1 && secondFixedSign === -1
              ? 0
              : firstFixedSign === 1 && secondFixedSign === 1
                ? 1
                : -1;

          faces.push({
            corners,
            cellLayer,
            orientationIndex,
            firstAxis,
            secondAxis,
            fixedAxes,
            fixedSigns: [firstFixedSign, secondFixedSign],
          });
        }
      }

      orientationIndex++;
    }
  }

  return faces;
}

/**
 * A unit vector in the 2-plane normal to the face, used as a stand-in for the
 * face's 4D orientation. Rotating this alongside the geometry gives a
 * well-defined "how is this face turned in 4D" signal.
 */
export function faceNormal4D(face) {
  const normal = [0, 0, 0, 0];
  const inverseRoot2 = 1 / Math.SQRT2;
  normal[face.fixedAxes[0]] = face.fixedSigns[0] * inverseRoot2;
  normal[face.fixedAxes[1]] = face.fixedSigns[1] * inverseRoot2;
  return normal;
}

/** Givens rotation in the (firstAxis, secondAxis) coordinate plane. */
export function rotate4D(point, firstAxis, secondAxis, angle) {
  const rotated = [...point];
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const firstValue = rotated[firstAxis];
  const secondValue = rotated[secondAxis];

  rotated[firstAxis] = firstValue * cosine - secondValue * sine;
  rotated[secondAxis] = firstValue * sine + secondValue * cosine;

  return rotated;
}

/**
 * Applies a list of [firstAxis, secondAxis, angle] rotations in order.
 *
 * The animation uses XW + YZ, an orthogonal pair, which is a genuine SO(4)
 * double rotation (the two commute). The pointer adds XY + ZW on top; those
 * are applied afterwards, so they read as a tilt in the viewer's frame.
 */
export function rotateAll4D(point, rotations) {
  let result = point;

  for (const [firstAxis, secondAxis, angle] of rotations) {
    result = rotate4D(result, firstAxis, secondAxis, angle);
  }

  return result;
}

/** 4D -> 3D perspective projection from an eye point at w = distance. */
export function project4Dto3D(point, distance = W_PROJECTION_DISTANCE) {
  const scale = distance / (distance - point[3]);
  return [point[0] * scale, point[1] * scale, point[2] * scale];
}

export function rotate3DX(point, angle) {
  const [x, y, z] = point;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [x, y * cosine - z * sine, y * sine + z * cosine];
}

export function rotate3DY(point, angle) {
  const [x, y, z] = point;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [x * cosine + z * sine, y, -x * sine + z * cosine];
}

export function rotate3DZ(point, angle) {
  const [x, y, z] = point;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [x * cosine - y * sine, x * sine + y * cosine, z];
}

/**
 * 3D -> 2D perspective projection.
 *
 * Only the line/point passes use this on the CPU; face geometry is projected
 * in the vertex shader instead, so that WebGL divides the varyings by w and
 * every interpolated value across a face stays perspective-correct.
 */
export function project3Dto2D(point, distance, centerX, centerY, scale) {
  const perspective = distance / (distance - point[2]);
  return {
    x: centerX + point[0] * perspective * scale,
    y: centerY + point[1] * perspective * scale,
    z: point[2],
    perspective,
  };
}

/** Maps a 3D depth onto [0, 1], 1 = nearest, using the closed-form bound. */
export function frontness(depth) {
  const ratio =
    (depth + PROJECTED_RADIUS_3D) / (PROJECTED_RADIUS_3D * 2);
  return Math.max(0, Math.min(1, ratio));
}

/* ------------------------------------------------------------------ */
/* Small vector helpers. Kept here so shading has no dependencies.     */
/* ------------------------------------------------------------------ */

export function subtract3D(first, second) {
  return [first[0] - second[0], first[1] - second[1], first[2] - second[2]];
}

export function length3D(vector) {
  return Math.max(Math.hypot(vector[0], vector[1], vector[2]), 1e-6);
}

export function normalize3D(vector) {
  const length = length3D(vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

export function dot3D(first, second) {
  return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
}

export function dot4D(first, second) {
  return (
    first[0] * second[0] +
    first[1] * second[1] +
    first[2] * second[2] +
    first[3] * second[3]
  );
}

export function cross3D(first, second) {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
}

export function average3D(points) {
  let x = 0;
  let y = 0;
  let z = 0;

  for (const point of points) {
    x += point[0];
    y += point[1];
    z += point[2];
  }

  return [x / points.length, y / points.length, z / points.length];
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function mixScalar(first, second, amount) {
  return first + (second - first) * amount;
}

export function smoothstep(minimum, maximum, value) {
  const progress = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return progress * progress * (3 - 2 * progress);
}
