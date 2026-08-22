"use client";

function clampValue(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

const SHELL_COLOR = [234 / 255, 1, 1];
const CORE_COLOR = [247 / 255, 1, 1];
const ABSORPTION_COLOR = [2 / 255, 5 / 255, 5 / 255];
const WHITE = [1, 1, 1];
const EFFECT_PADDING = 72;
const EFFECT_SIZE_STEP = 32;

const capsuleVertexShader = `
attribute vec2 a_position;
attribute vec2 a_local;
attribute vec2 a_half_size;
attribute vec4 a_color;
uniform vec2 u_origin;
uniform vec2 u_resolution;
varying vec2 v_local;
varying vec2 v_half_size;
varying vec4 v_color;

void main() {
  vec2 position = (a_position - u_origin) / u_resolution;
  gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
  v_local = a_local;
  v_half_size = a_half_size;
  v_color = a_color;
}
`;

const capsuleFragmentShader = `
precision mediump float;
varying vec2 v_local;
varying vec2 v_half_size;
varying vec4 v_color;
uniform float u_pixel_ratio;

void main() {
  vec2 nearest = vec2(
    max(abs(v_local.x) - v_half_size.x, 0.0),
    v_local.y
  );
  float distanceToEdge = length(nearest) - v_half_size.y;
  float antialias = max(0.7 / u_pixel_ratio, 0.18);
  float coverage = 1.0 - smoothstep(-antialias, antialias, distanceToEdge);
  float alpha = v_color.a * coverage;
  gl_FragColor = vec4(v_color.rgb * alpha, alpha);
}
`;

const faceVertexShader = `
attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec4 a_color;
uniform vec2 u_origin;
uniform vec2 u_resolution;
varying vec2 v_uv;
varying vec4 v_color;

void main() {
  vec2 position = (a_position - u_origin) / u_resolution;
  gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`;

const faceFragmentShader = `
precision mediump float;
varying vec2 v_uv;
varying vec4 v_color;
uniform float u_glass_gradient;

float glassAlpha(float progress) {
  if (progress < 0.28) {
    return mix(0.28, 0.05, progress / 0.28);
  }
  if (progress < 0.62) {
    return mix(0.05, 0.13, (progress - 0.28) / 0.34);
  }
  return mix(0.13, 0.02, (progress - 0.62) / 0.38);
}

void main() {
  float gradientAlpha = mix(
    1.0,
    glassAlpha((v_uv.x + v_uv.y) * 0.5),
    u_glass_gradient
  );
  float alpha = v_color.a * gradientAlpha;
  gl_FragColor = vec4(v_color.rgb * alpha, alpha);
}
`;

const radialVertexShader = `
attribute vec2 a_position;
attribute vec2 a_local;
attribute float a_opacity;
attribute float a_radius;
uniform vec2 u_origin;
uniform vec2 u_resolution;
varying vec2 v_local;
varying float v_opacity;
varying float v_radius;

void main() {
  vec2 position = (a_position - u_origin) / u_resolution;
  gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
  v_local = a_local;
  v_opacity = a_opacity;
  v_radius = a_radius;
}
`;

const radialFragmentShader = `
precision mediump float;
varying vec2 v_local;
varying float v_opacity;
varying float v_radius;
uniform float u_pixel_ratio;

void main() {
  float distanceFromCenter = length(v_local);
  float antialias = max(0.8 / max(v_radius * u_pixel_ratio, 1.0), 0.02);
  float coverage = 1.0 - smoothstep(1.0 - antialias, 1.0, distanceFromCenter);
  vec3 color;
  float stopAlpha;

  if (distanceFromCenter < 0.3) {
    float progress = distanceFromCenter / 0.3;
    color = mix(vec3(1.0), vec3(0.0, 0.909804, 0.878431), progress);
    stopAlpha = mix(1.0, 0.52, progress);
  } else if (distanceFromCenter < 0.68) {
    float progress = (distanceFromCenter - 0.3) / 0.38;
    color = mix(
      vec3(0.0, 0.909804, 0.878431),
      vec3(1.0, 0.407843, 0.121569),
      progress
    );
    stopAlpha = mix(0.52, 0.2, progress);
  } else {
    float progress = (distanceFromCenter - 0.68) / 0.32;
    color = vec3(1.0, 0.407843, 0.121569);
    stopAlpha = mix(0.2, 0.0, progress);
  }

  float alpha = v_opacity * stopAlpha * coverage;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

const textureVertexShader = `
attribute vec2 a_position;
attribute vec2 a_uv;
uniform vec2 u_origin;
uniform vec2 u_resolution;
varying vec2 v_uv;

void main() {
  vec2 position = (a_position - u_origin) / u_resolution;
  gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
  v_uv = a_uv;
}
`;

const textureFragmentShader = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;

void main() {
  gl_FragColor = texture2D(u_texture, v_uv);
}
`;

const blurFragmentShader = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_step;

void main() {
  vec4 color = texture2D(u_texture, v_uv) * 0.227027;
  color += texture2D(u_texture, v_uv + u_step * 1.384615) * 0.316216;
  color += texture2D(u_texture, v_uv - u_step * 1.384615) * 0.316216;
  color += texture2D(u_texture, v_uv + u_step * 3.230769) * 0.070270;
  color += texture2D(u_texture, v_uv - u_step * 3.230769) * 0.070270;
  gl_FragColor = color;
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || "Unable to compile WebGL shader.");
  }

  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(message || "Unable to link WebGL program.");
  }

  return program;
}

function createTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function createRenderTarget(gl) {
  const texture = createTexture(gl);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );

  return { texture, framebuffer };
}

function resizeRenderTarget(gl, target, width, height) {
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
}

function setNormalBlend(gl) {
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFuncSeparate(
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA,
  );
}

function setScreenBlend(gl) {
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFuncSeparate(
    gl.ONE,
    gl.ONE_MINUS_SRC_COLOR,
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA,
  );
}

function setAttribute(gl, location, size, stride, offset) {
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(
    location,
    size,
    gl.FLOAT,
    false,
    stride,
    offset,
  );
}

function pushCapsuleVertex(
  data,
  centerX,
  centerY,
  directionX,
  directionY,
  normalX,
  normalY,
  localX,
  localY,
  halfLength,
  halfWidth,
  color,
  opacity,
) {
  data.push(
    centerX + directionX * localX + normalX * localY,
    centerY + directionY * localX + normalY * localY,
    localX,
    localY,
    halfLength,
    halfWidth,
    color[0],
    color[1],
    color[2],
    opacity,
  );
}

function capsuleVertices(lines) {
  const data = [];

  for (const line of lines) {
    const deltaX = line.x2 - line.x1;
    const deltaY = line.y2 - line.y1;
    const length = Math.max(Math.hypot(deltaX, deltaY), 0.0001);
    const directionX = deltaX / length;
    const directionY = deltaY / length;
    const normalX = -directionY;
    const normalY = directionX;
    const halfLength = length / 2;
    const halfWidth = Math.max(line.width / 2, 0.001);
    const extendedLength = halfLength + halfWidth;
    const centerX = (line.x1 + line.x2) / 2;
    const centerY = (line.y1 + line.y2) / 2;
    const corners = [
      [-extendedLength, -halfWidth],
      [extendedLength, -halfWidth],
      [-extendedLength, halfWidth],
      [extendedLength, halfWidth],
    ];
    const order = [0, 1, 2, 2, 1, 3];

    for (const index of order) {
      const [localX, localY] = corners[index];
      pushCapsuleVertex(
        data,
        centerX,
        centerY,
        directionX,
        directionY,
        normalX,
        normalY,
        localX,
        localY,
        halfLength,
        halfWidth,
        line.color,
        line.opacity,
      );
    }
  }

  return new Float32Array(data);
}

function edgeLine(edge, offsetX, offsetY, width, color, opacity) {
  return {
    x1: edge.first.x + offsetX,
    y1: edge.first.y + offsetY,
    x2: edge.second.x + offsetX,
    y2: edge.second.y + offsetY,
    width,
    color,
    opacity,
  };
}

function bloomLines(edges) {
  const lines = [];

  for (const edge of edges) {
    lines.push(
      edgeLine(
        edge,
        edge.cyanOffsetX,
        edge.cyanOffsetY,
        edge.coreWidth * 4.5 + 4,
        edge.cyanColor,
        edge.cyanGlowOpacity,
      ),
    );
  }

  for (const edge of edges) {
    lines.push(
      edgeLine(
        edge,
        edge.orangeOffsetX,
        edge.orangeOffsetY,
        edge.coreWidth * 4.5 + 4,
        edge.orangeColor,
        edge.orangeGlowOpacity,
      ),
    );
  }

  return lines;
}

function shellLines(edges, opacityKey) {
  return edges.map((edge) =>
    edgeLine(
      edge,
      0,
      0,
      edge.shellWidth,
      SHELL_COLOR,
      edge.shellOpacity * edge[opacityKey],
    ),
  );
}

function absorptionLines(edges, opacityKey) {
  return edges.map((edge) =>
    edgeLine(
      edge,
      edge.absorptionOffsetX,
      edge.absorptionOffsetY,
      edge.absorptionWidth,
      ABSORPTION_COLOR,
      edge.absorptionOpacity * edge[opacityKey],
    ),
  );
}

function refractionLines(edges, opacityKey) {
  const lines = [];

  for (const edge of edges) {
    lines.push(
      edgeLine(
        edge,
        edge.cyanOffsetX,
        edge.cyanOffsetY,
        edge.coreWidth * 1.02,
        edge.cyanColor,
        edge.cyanOpacity * edge[opacityKey],
      ),
    );
  }

  for (const edge of edges) {
    lines.push(
      edgeLine(
        edge,
        edge.orangeOffsetX,
        edge.orangeOffsetY,
        edge.coreWidth * 0.96,
        edge.orangeColor,
        edge.orangeOpacity * edge[opacityKey],
      ),
    );
  }

  return lines;
}

function coreLines(edges, opacityKey) {
  return edges.map((edge) =>
    edgeLine(
      edge,
      0,
      0,
      edge.coreWidth * 0.74,
      CORE_COLOR,
      edge.coreOpacity * edge[opacityKey],
    ),
  );
}

function rimLines(face) {
  return face.points.map((point, index) => {
    const next = face.points[(index + 1) % face.points.length];

    return {
      x1: point.x,
      y1: point.y,
      x2: next.x,
      y2: next.y,
      width: 0.6,
      color: [244 / 255, 1, 1],
      opacity: face.rimOpacity,
    };
  });
}

function roundedSize(value, maximum) {
  return Math.min(
    maximum,
    Math.ceil(value / EFFECT_SIZE_STEP) * EFFECT_SIZE_STEP,
  );
}

export function createWebGLRenderer(canvas) {
  const gl =
    canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    }) ||
    canvas.getContext("experimental-webgl", {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });

  if (!gl) {
    return null;
  }

  const capsuleProgram = createProgram(
    gl,
    capsuleVertexShader,
    capsuleFragmentShader,
  );
  const faceProgram = createProgram(gl, faceVertexShader, faceFragmentShader);
  const radialProgram = createProgram(
    gl,
    radialVertexShader,
    radialFragmentShader,
  );
  const textureProgram = createProgram(
    gl,
    textureVertexShader,
    textureFragmentShader,
  );
  const blurProgram = createProgram(
    gl,
    textureVertexShader,
    blurFragmentShader,
  );
  const capsuleBuffer = gl.createBuffer();
  const faceBuffer = gl.createBuffer();
  const radialBuffer = gl.createBuffer();
  const textureBuffer = gl.createBuffer();
  const firstTarget = createRenderTarget(gl);
  const secondTarget = createRenderTarget(gl);
  let canvasWidth = 0;
  let canvasHeight = 0;
  let canvasPixelRatio = 1;
  let effectWidth = 0;
  let effectHeight = 0;
  let effectPixelWidth = 0;
  let effectPixelHeight = 0;
  let effectPixelRatio = 1;
  let viewportWidth = 0;
  let viewportHeight = 0;

  const capsuleLocations = {
    position: gl.getAttribLocation(capsuleProgram, "a_position"),
    local: gl.getAttribLocation(capsuleProgram, "a_local"),
    halfSize: gl.getAttribLocation(capsuleProgram, "a_half_size"),
    color: gl.getAttribLocation(capsuleProgram, "a_color"),
    origin: gl.getUniformLocation(capsuleProgram, "u_origin"),
    resolution: gl.getUniformLocation(capsuleProgram, "u_resolution"),
    pixelRatio: gl.getUniformLocation(capsuleProgram, "u_pixel_ratio"),
  };
  const faceLocations = {
    position: gl.getAttribLocation(faceProgram, "a_position"),
    uv: gl.getAttribLocation(faceProgram, "a_uv"),
    color: gl.getAttribLocation(faceProgram, "a_color"),
    origin: gl.getUniformLocation(faceProgram, "u_origin"),
    resolution: gl.getUniformLocation(faceProgram, "u_resolution"),
    gradient: gl.getUniformLocation(faceProgram, "u_glass_gradient"),
  };
  const radialLocations = {
    position: gl.getAttribLocation(radialProgram, "a_position"),
    local: gl.getAttribLocation(radialProgram, "a_local"),
    opacity: gl.getAttribLocation(radialProgram, "a_opacity"),
    radius: gl.getAttribLocation(radialProgram, "a_radius"),
    origin: gl.getUniformLocation(radialProgram, "u_origin"),
    resolution: gl.getUniformLocation(radialProgram, "u_resolution"),
    pixelRatio: gl.getUniformLocation(radialProgram, "u_pixel_ratio"),
  };
  const textureLocations = {
    position: gl.getAttribLocation(textureProgram, "a_position"),
    uv: gl.getAttribLocation(textureProgram, "a_uv"),
    origin: gl.getUniformLocation(textureProgram, "u_origin"),
    resolution: gl.getUniformLocation(textureProgram, "u_resolution"),
    texture: gl.getUniformLocation(textureProgram, "u_texture"),
  };
  const blurLocations = {
    position: gl.getAttribLocation(blurProgram, "a_position"),
    uv: gl.getAttribLocation(blurProgram, "a_uv"),
    origin: gl.getUniformLocation(blurProgram, "u_origin"),
    resolution: gl.getUniformLocation(blurProgram, "u_resolution"),
    texture: gl.getUniformLocation(blurProgram, "u_texture"),
    step: gl.getUniformLocation(blurProgram, "u_step"),
  };

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  function resizeCanvas(width, height) {
    const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);
    const pixelWidth = Math.max(Math.round(width * pixelRatio), 1);
    const pixelHeight = Math.max(Math.round(height * pixelRatio), 1);

    if (
      canvasWidth === width &&
      canvasHeight === height &&
      canvasPixelRatio === pixelRatio &&
      canvas.width === pixelWidth &&
      canvas.height === pixelHeight
    ) {
      return;
    }

    canvasWidth = width;
    canvasHeight = height;
    canvasPixelRatio = pixelRatio;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    viewportWidth = 0;
    viewportHeight = 0;
  }

  function ensureEffectRegion(scene) {
    const centerX = scene.width / 2;
    const centerY = scene.height / 2;
    let maximumX = 0;
    let maximumY = 0;

    for (const vertex of scene.vertices) {
      maximumX = Math.max(maximumX, Math.abs(vertex.x - centerX));
      maximumY = Math.max(maximumY, Math.abs(vertex.y - centerY));
    }

    const desiredWidth = roundedSize(
      maximumX * 2 + EFFECT_PADDING * 2,
      scene.width,
    );
    const desiredHeight = roundedSize(
      maximumY * 2 + EFFECT_PADDING * 2,
      scene.height,
    );
    const sizeChanged =
      viewportWidth !== scene.width ||
      viewportHeight !== scene.height;
    const nextWidth = sizeChanged
      ? desiredWidth
      : Math.max(effectWidth, desiredWidth);
    const nextHeight = sizeChanged
      ? desiredHeight
      : Math.max(effectHeight, desiredHeight);
    const nextPixelRatio = 1;
    const nextPixelWidth = Math.max(Math.ceil(nextWidth * nextPixelRatio), 1);
    const nextPixelHeight = Math.max(Math.ceil(nextHeight * nextPixelRatio), 1);

    if (
      nextPixelWidth !== effectPixelWidth ||
      nextPixelHeight !== effectPixelHeight
    ) {
      resizeRenderTarget(gl, firstTarget, nextPixelWidth, nextPixelHeight);
      resizeRenderTarget(gl, secondTarget, nextPixelWidth, nextPixelHeight);
      effectPixelWidth = nextPixelWidth;
      effectPixelHeight = nextPixelHeight;
    }

    effectWidth = nextWidth;
    effectHeight = nextHeight;
    effectPixelRatio = nextPixelRatio;
    viewportWidth = scene.width;
    viewportHeight = scene.height;

    return {
      originX: clampValue(centerX - effectWidth / 2, 0, scene.width - effectWidth),
      originY: clampValue(centerY - effectHeight / 2, 0, scene.height - effectHeight),
      width: effectWidth,
      height: effectHeight,
      pixelWidth: effectPixelWidth,
      pixelHeight: effectPixelHeight,
      pixelRatio: effectPixelRatio,
    };
  }

  function bindMain(scene) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);

    return {
      originX: 0,
      originY: 0,
      width: scene.width,
      height: scene.height,
      pixelRatio: canvasPixelRatio,
    };
  }

  function bindEffect(target, region, clear = true) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, region.pixelWidth, region.pixelHeight);

    if (clear) {
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    return {
      originX: region.originX,
      originY: region.originY,
      width: region.width,
      height: region.height,
      pixelRatio: region.pixelRatio,
    };
  }

  function drawCapsules(lines, target) {
    if (!lines.length) {
      return;
    }

    const vertices = capsuleVertices(lines);
    const stride = 10 * Float32Array.BYTES_PER_ELEMENT;

    gl.useProgram(capsuleProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, capsuleBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    setAttribute(gl, capsuleLocations.position, 2, stride, 0);
    setAttribute(gl, capsuleLocations.local, 2, stride, 2 * 4);
    setAttribute(gl, capsuleLocations.halfSize, 2, stride, 4 * 4);
    setAttribute(gl, capsuleLocations.color, 4, stride, 6 * 4);
    gl.uniform2f(
      capsuleLocations.origin,
      target.originX,
      target.originY,
    );
    gl.uniform2f(capsuleLocations.resolution, target.width, target.height);
    gl.uniform1f(capsuleLocations.pixelRatio, target.pixelRatio);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 10);
  }

  function faceVertices(face, color, opacity) {
    const data = [];
    const uv = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const order = [0, 1, 2, 0, 2, 3];

    for (const index of order) {
      data.push(
        face.points[index].x,
        face.points[index].y,
        uv[index][0],
        uv[index][1],
        color[0],
        color[1],
        color[2],
        opacity,
      );
    }

    return new Float32Array(data);
  }

  function drawFace(face, color, opacity, gradient, target) {
    const vertices = faceVertices(face, color, opacity);
    const stride = 8 * Float32Array.BYTES_PER_ELEMENT;

    gl.useProgram(faceProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, faceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    setAttribute(gl, faceLocations.position, 2, stride, 0);
    setAttribute(gl, faceLocations.uv, 2, stride, 2 * 4);
    setAttribute(gl, faceLocations.color, 4, stride, 4 * 4);
    gl.uniform2f(faceLocations.origin, target.originX, target.originY);
    gl.uniform2f(faceLocations.resolution, target.width, target.height);
    gl.uniform1f(faceLocations.gradient, gradient ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function radialVertices(vertices) {
    const data = [];
    const corners = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];
    const order = [0, 1, 2, 2, 1, 3];

    for (const vertex of vertices) {
      const radius = vertex.radius * 2.24;

      for (const index of order) {
        const [localX, localY] = corners[index];
        data.push(
          vertex.x + localX * radius,
          vertex.y + localY * radius,
          localX,
          localY,
          vertex.opacity,
          radius,
        );
      }
    }

    return new Float32Array(data);
  }

  function drawVertices(vertices, target) {
    const data = radialVertices(vertices);
    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;

    gl.useProgram(radialProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, radialBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    setAttribute(gl, radialLocations.position, 2, stride, 0);
    setAttribute(gl, radialLocations.local, 2, stride, 2 * 4);
    setAttribute(gl, radialLocations.opacity, 1, stride, 4 * 4);
    setAttribute(gl, radialLocations.radius, 1, stride, 5 * 4);
    gl.uniform2f(radialLocations.origin, target.originX, target.originY);
    gl.uniform2f(radialLocations.resolution, target.width, target.height);
    gl.uniform1f(radialLocations.pixelRatio, target.pixelRatio);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 6);
  }

  function textureVertices(originX, originY, width, height) {
    return new Float32Array([
      originX,
      originY,
      0,
      1,
      originX + width,
      originY,
      1,
      1,
      originX,
      originY + height,
      0,
      0,
      originX,
      originY + height,
      0,
      0,
      originX + width,
      originY,
      1,
      1,
      originX + width,
      originY + height,
      1,
      0,
    ]);
  }

  function prepareTextureProgram(program, locations, vertices, target) {
    const stride = 4 * Float32Array.BYTES_PER_ELEMENT;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    setAttribute(gl, locations.position, 2, stride, 0);
    setAttribute(gl, locations.uv, 2, stride, 2 * 4);
    gl.uniform2f(locations.origin, target.originX, target.originY);
    gl.uniform2f(locations.resolution, target.width, target.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(locations.texture, 0);
  }

  function blur(source, destination, region, sigma, horizontal) {
    bindEffect(destination, region);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    const vertices = textureVertices(0, 0, region.width, region.height);
    const target = {
      originX: 0,
      originY: 0,
      width: region.width,
      height: region.height,
    };

    prepareTextureProgram(blurProgram, blurLocations, vertices, target);
    const scaledSigma = sigma * region.pixelRatio;
    const sampleSpacing = scaledSigma / 1.637;
    gl.uniform2f(
      blurLocations.step,
      horizontal ? sampleSpacing / region.pixelWidth : 0,
      horizontal ? 0 : sampleSpacing / region.pixelHeight,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function compositeTexture(texture, region, scene) {
    const target = bindMain(scene);
    const vertices = textureVertices(
      region.originX,
      region.originY,
      region.width,
      region.height,
    );

    prepareTextureProgram(textureProgram, textureLocations, vertices, target);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    setScreenBlend(gl);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawBlurred(lines, sigma, includeSource, region, scene) {
    const effectTarget = bindEffect(firstTarget, region);
    setNormalBlend(gl);
    drawCapsules(lines, effectTarget);
    blur(firstTarget, secondTarget, region, sigma, true);
    blur(secondTarget, firstTarget, region, sigma, false);
    compositeTexture(firstTarget.texture, region, scene);

    if (includeSource) {
      const mainTarget = bindMain(scene);
      setScreenBlend(gl);
      drawCapsules(lines, mainTarget);
    }
  }

  function renderEdgePass(scene, opacityKey, region) {
    const mainTarget = bindMain(scene);

    drawBlurred(
      shellLines(scene.edges, opacityKey),
      4.6,
      true,
      region,
      scene,
    );

    bindMain(scene);
    setNormalBlend(gl);
    drawCapsules(absorptionLines(scene.edges, opacityKey), mainTarget);

    setScreenBlend(gl);
    drawCapsules(refractionLines(scene.edges, opacityKey), mainTarget);

    drawBlurred(
      coreLines(scene.edges, opacityKey),
      4.1,
      true,
      region,
      scene,
    );
  }

  function renderFaces(scene) {
    const mainTarget = bindMain(scene);

    for (const face of scene.faces) {
      setNormalBlend(gl);
      drawFace(
        face,
        ABSORPTION_COLOR,
        face.absorptionOpacity,
        false,
        mainTarget,
      );

      setScreenBlend(gl);
      drawFace(face, WHITE, face.glassOpacity, true, mainTarget);
      drawCapsules(rimLines(face), mainTarget);
      drawFace(face, face.cyanColor, face.cyanOpacity, false, mainTarget);
      drawFace(face, face.orangeColor, face.orangeOpacity, false, mainTarget);
    }
  }

  function render(scene) {
    resizeCanvas(scene.width, scene.height);
    const region = ensureEffectRegion(scene);
    bindMain(scene);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    drawBlurred(bloomLines(scene.edges), 9.5, false, region, scene);
    renderEdgePass(scene, "rearPassOpacity", region);
    renderFaces(scene);
    renderEdgePass(scene, "frontPassOpacity", region);

    const mainTarget = bindMain(scene);
    setNormalBlend(gl);
    drawVertices(scene.vertices, mainTarget);
  }

  function destroy() {
    gl.deleteBuffer(capsuleBuffer);
    gl.deleteBuffer(faceBuffer);
    gl.deleteBuffer(radialBuffer);
    gl.deleteBuffer(textureBuffer);
    gl.deleteTexture(firstTarget.texture);
    gl.deleteTexture(secondTarget.texture);
    gl.deleteFramebuffer(firstTarget.framebuffer);
    gl.deleteFramebuffer(secondTarget.framebuffer);
    gl.deleteProgram(capsuleProgram);
    gl.deleteProgram(faceProgram);
    gl.deleteProgram(radialProgram);
    gl.deleteProgram(textureProgram);
    gl.deleteProgram(blurProgram);
  }

  return { render, destroy };
}

