export const AXES = [0, 1, 2, 3];
const SIGNS = [-1, 1];

export const TESSERACT_RADIUS = 2;

export const W_PROJECTION_DISTANCE = 3;

export const Z_PROJECTION_DISTANCE = 5;

export const PROJECTED_RADIUS_3D = 6 / Math.sqrt(5);

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

export function faceNormal4D(face) {
  const normal = [0, 0, 0, 0];
  const inverseRoot2 = 1 / Math.SQRT2;
  normal[face.fixedAxes[0]] = face.fixedSigns[0] * inverseRoot2;
  normal[face.fixedAxes[1]] = face.fixedSigns[1] * inverseRoot2;
  return normal;
}

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

export function rotateAll4D(point, rotations) {
  let result = point;

  for (const [firstAxis, secondAxis, angle] of rotations) {
    result = rotate4D(result, firstAxis, secondAxis, angle);
  }

  return result;
}

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

export function project3Dto2D(point, distance, centerX, centerY, scale) {
  const perspective = distance / (distance - point[2]);
  return {
    x: centerX + point[0] * perspective * scale,
    y: centerY + point[1] * perspective * scale,
    z: point[2],
    perspective,
  };
}

export function frontness(depth) {
  const ratio =
    (depth + PROJECTED_RADIUS_3D) / (PROJECTED_RADIUS_3D * 2);
  return Math.max(0, Math.min(1, ratio));
}


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
