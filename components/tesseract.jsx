"use client";

import { useEffect, useMemo, useState } from "react";

function buildVertices4D() {
  const vertices = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        for (const w of [-1, 1]) {
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
      let diff = 0;
      for (let k = 0; k < 4; k++) {
        if (vertices[i][k] !== vertices[j][k]) diff++;
      }
      if (diff === 1) {
        edges.push([i, j]);
      }
    }
  }
  return edges;
}

function rotate4D(point, i, j, angle) {
  const out = [...point];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const a = out[i];
  const b = out[j];
  out[i] = a * c - b * s;
  out[j] = a * s + b * c;
  return out;
}

function project4Dto3D(point4, distance4) {
  const w = point4[3];
  const scale = distance4 / (distance4 - w);
  return [point4[0] * scale, point4[1] * scale, point4[2] * scale];
}

function rotate3D_X(point, angle) {
  const [x, y, z] = point;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x, y * c - z * s, y * s + z * c];
}

function rotate3D_Y(point, angle) {
  const [x, y, z] = point;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotate3D_Z(point, angle) {
  const [x, y, z] = point;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c, z];
}

function project3Dto2D(point3, distance3, centerX, centerY, scale2D) {
  const z = point3[2];
  const k = distance3 / (distance3 - z);
  return {
    x: centerX + point3[0] * k * scale2D,
    y: centerY + point3[1] * k * scale2D,
    z,
  };
}

export default function StrictTesseract() {
  const [viewport, setViewport] = useState({ width: 1200, height: 800 });
  const [time, setTime] = useState(0);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  const vertices4D = useMemo(() => buildVertices4D(), []);
  const edges = useMemo(() => buildEdges4D(vertices4D), [vertices4D]);

  useEffect(() => {
    const onResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    onResize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    const start = performance.now();

    const tick = (now) => {
      setTime((now - start) / 1000);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, []);

  const scene = useMemo(() => {
    const width = viewport.width;
    const height = viewport.height;
    const cx = width / 2;
    const cy = height / 2;

    const scale2D = Math.min(width, height) * 0.1;
    const distance4 = 3;
    const distance3 = 5;

    const angleXY = time * 0.2;
    const angleXZ = time * 0.15;
    const angleYZ = time * 0.1;

    const angleXW = time * 0.5 + mouse.x * 0.3;
    const angleYW = time * 0.5 + mouse.y * 0.3;
    const angleZW = time * 0.3;

    const points2D = vertices4D.map((p) => {
      let q = [...p];

      q = rotate4D(q, 0, 1, angleXY);
      q = rotate4D(q, 0, 2, angleXZ);
      q = rotate4D(q, 1, 2, angleYZ);
      q = rotate4D(q, 0, 3, angleXW);
      q = rotate4D(q, 1, 3, angleYW);
      q = rotate4D(q, 2, 3, angleZW);

      let p3 = project4Dto3D(q, distance4);

      p3 = rotate3D_X(p3, 0.4);
      p3 = rotate3D_Y(p3, -0.5);
      p3 = rotate3D_Z(p3, 0.1);

      const p2 = project3Dto2D(p3, distance3, cx, cy, scale2D);

      return {
        x: p2.x,
        y: p2.y,
        z: p2.z,
        source4: q,
      };
    });

    const zValues = points2D.map((p) => p.z);
    const zMin = Math.min(...zValues);
    const zMax = Math.max(...zValues);

    function depthAlpha(z, a, b) {
      if (zMax === zMin) return (a + b) / 2;
      const t = (z - zMin) / (zMax - zMin);
      return a + (b - a) * t;
    }

    return {
      width,
      height,
      points2D,
      depthAlpha,
    };
  }, [viewport, time, mouse, vertices4D]);

  const handlePointerMove = (e) => {
    const w = viewport.width || 1;
    const h = viewport.height || 1;
    const nx = e.clientX / w;
    const ny = e.clientY / h;
    setMouse({
      x: (nx - 0.5) * 2,
      y: (ny - 0.5) * 2,
    });
  };

  return (
    <div
      onPointerMove={handlePointerMove}
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
        width={scene.width}
        height={scene.height}
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        style={{ display: "block" }}
      >
        <defs>
          <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="5" result="blur1" />
            <feGaussianBlur stdDeviation="15" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter="url(#glow)">
          {edges.map(([i, j], idx) => {
            const a = scene.points2D[i];
            const b = scene.points2D[j];
            const midZ = (a.z + b.z) / 2;
            const opacity = scene.depthAlpha(midZ, 0.4, 0.8);
            const width = scene.depthAlpha(midZ, 1.5, 3);

            return (
              <line
                key={idx}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#ffffff"
                strokeOpacity={opacity}
                strokeWidth={width}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
