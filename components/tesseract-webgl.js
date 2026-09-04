"use client";

function clampValue(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

const SHELL_COLOR = [0.97, 0.99, 1];
const ABSORPTION_COLOR = [2 / 255, 3 / 255, 5 / 255];
const WHITE = [1, 1, 1];
const EFFECT_PADDING = 88;
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
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
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
attribute float a_depth;
attribute vec4 a_color;
uniform vec2 u_origin;
uniform vec2 u_resolution;
varying vec2 v_uv;
varying vec4 v_color;

void main() {
  vec2 position = (a_position - u_origin) / u_resolution;
  gl_Position = vec4(
    position.x * 2.0 - 1.0,
    1.0 - position.y * 2.0,
    a_depth * 2.0 - 1.0,
    1.0
  );
  v_uv = a_uv;
  v_color = a_color;
}
`;

const faceFragmentShader = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
varying vec4 v_color;
uniform float u_mode;
uniform vec3 u_stop_color_0;
uniform vec3 u_stop_color_1;
uniform vec2 u_gradient_axis;
uniform float u_gradient_offset;
uniform float u_gradient_span;
uniform float u_prism_opacity;
uniform float u_white_strength;
uniform vec2 u_highlight_axis;
uniform float u_highlight_offset;
uniform float u_edge_lift;
uniform float u_oit_mode;
uniform float u_oit_weight;

vec3 rampColor(float t) {
  return mix(u_stop_color_0, u_stop_color_1, t);
}

void main() {
  if (u_mode < 0.5) {
    float alpha = v_color.a;
    gl_FragColor = vec4(v_color.rgb * alpha, alpha);
    return;
  }

  float axisLength = length(u_gradient_axis);
  vec2 axis = axisLength > 0.0001
    ? u_gradient_axis / axisLength
    : vec2(0.0);
  float directionalStrength = smoothstep(0.035, 0.32, axisLength);
  vec2 centeredUv = v_uv - vec2(0.5);
  float t = clamp(
    dot(centeredUv, axis) * u_gradient_span * directionalStrength +
      0.5 +
      u_gradient_offset,
    0.0,
    1.0
  );
  vec3 prismColor = rampColor(t);

  float edgeDistance = min(
    min(v_uv.x, 1.0 - v_uv.x),
    min(v_uv.y, 1.0 - v_uv.y)
  );
  float edgeGlow = 1.0 - smoothstep(0.0, 0.22, edgeDistance);

  float highlightLength = length(u_highlight_axis);
  vec2 highlightAxis = highlightLength > 0.0001
    ? u_highlight_axis / highlightLength
    : vec2(0.7071, 0.7071);
  float highlightCoordinate =
    dot(centeredUv, highlightAxis) - u_highlight_offset;
  float highlightLobe = exp(
    -highlightCoordinate * highlightCoordinate / 0.018
  );
  float whiteLight = u_white_strength * highlightLobe *
    (0.3 + edgeGlow * 0.7);

  // The color exists across the whole face. Edge lift only adds glass thickness;
  // it no longer determines whether the face is colored at all.
  float subtleTexture = 0.985 + 0.015 * cos(t * 7.0);

  // High density does not mean high luminance: keep the polygon nearly opaque,
  // but push RGB toward deep saturated glass instead of white/pastel emission.
  prismColor *= (0.68 + edgeGlow * u_edge_lift) * subtleTexture;

  float colorAlpha = u_prism_opacity * (0.985 + edgeGlow * 0.015);
  float alpha = clamp(colorAlpha + whiteLight * 0.18, 0.0, 0.985);
  vec3 premultiplied =
    prismColor * colorAlpha +
    vec3(1.0) * whiteLight * 0.68;

  if (u_oit_mode > 0.5) {
    float contribution = alpha * u_oit_weight;
    vec3 visibleColor = alpha > 0.0001
      ? premultiplied / alpha
      : vec3(0.0);
    gl_FragColor = vec4(visibleColor * contribution, contribution);
    return;
  }

  gl_FragColor = vec4(premultiplied, alpha);
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
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_local;
varying float v_opacity;
varying float v_radius;
uniform float u_pixel_ratio;

void main() {
  float distanceFromCenter = length(v_local);
  float antialias = max(0.8 / max(v_radius * u_pixel_ratio, 1.0), 0.02);
  float coverage = 1.0 - smoothstep(1.0 - antialias, 1.0, distanceFromCenter);

  vec3 blue = vec3(0.0, 0.09, 0.74);
  vec3 red = vec3(0.82, 0.008, 0.018);
  vec3 green = vec3(0.0, 0.56, 0.12);
  float side = clamp(v_local.x * 0.5 + 0.5, 0.0, 1.0);
  vec3 chroma = mix(blue, red, side);
  chroma = mix(chroma, green, smoothstep(0.58, 1.0, distanceFromCenter));
  vec3 color = mix(
    vec3(1.0),
    chroma,
    smoothstep(0.08, 0.78, distanceFromCenter)
  );

  float stopAlpha;
  if (distanceFromCenter < 0.24) {
    stopAlpha = mix(1.0, 0.64, distanceFromCenter / 0.24);
  } else if (distanceFromCenter < 0.7) {
    stopAlpha = mix(0.64, 0.18, (distanceFromCenter - 0.24) / 0.46);
  } else {
    stopAlpha = mix(0.18, 0.0, (distanceFromCenter - 0.7) / 0.3);
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
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_texture;

void main() {
  gl_FragColor = texture2D(u_texture, v_uv);
}
`;

const oitCompositeFragmentShader = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_texture;

void main() {
  vec4 accumulated = texture2D(u_texture, v_uv);
  float weight = accumulated.a;
  if (weight <= 0.0001) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 color = accumulated.rgb / weight;
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = clamp(mix(vec3(luminance), color, 1.24) * 1.06, 0.0, 1.0);
  float alpha = clamp(1.0 - exp(-weight * 2.25), 0.0, 0.992);

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

const blurFragmentShader = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
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
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
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

  if (
    gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
  ) {
    throw new Error("Unable to create a complete WebGL render target.");
  }
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

function setAdditiveBlend(gl) {
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ONE);
}

function setAttribute(gl, location, size, stride, offset) {
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
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
        edge.firstOffsetX,
        edge.firstOffsetY,
        edge.coreWidth * 3.2 + 2.2,
        edge.firstColor,
        edge.firstGlowOpacity,
      ),
    );
  }

  for (const edge of edges) {
    lines.push(
      edgeLine(
        edge,
        edge.secondOffsetX,
        edge.secondOffsetY,
        edge.coreWidth * 3.2 + 2.2,
        edge.secondColor,
        edge.secondGlowOpacity,
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
        edge.firstOffsetX,
        edge.firstOffsetY,
        edge.coreWidth + 0.10,
        edge.firstColor,
        edge.firstOpacity * edge[opacityKey],
      ),
    );
  }

  for (const edge of edges) {
    lines.push(
      edgeLine(
        edge,
        edge.secondOffsetX,
        edge.secondOffsetY,
        edge.coreWidth + 0.06,
        edge.secondColor,
        edge.secondOpacity * edge[opacityKey],
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
      edge.coreWidth,
      edge.coreColor,
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
      width: face.rimWidth,
      color: WHITE,
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
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    }) ||
    canvas.getContext("experimental-webgl", {
      alpha: true,
      antialias: true,
      depth: true,
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
  const oitCompositeProgram = createProgram(
    gl,
    textureVertexShader,
    oitCompositeFragmentShader,
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
  const faceAccumTarget = createRenderTarget(gl);

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
    depth: gl.getAttribLocation(faceProgram, "a_depth"),
    color: gl.getAttribLocation(faceProgram, "a_color"),
    origin: gl.getUniformLocation(faceProgram, "u_origin"),
    resolution: gl.getUniformLocation(faceProgram, "u_resolution"),
    mode: gl.getUniformLocation(faceProgram, "u_mode"),
    stopColor0: gl.getUniformLocation(faceProgram, "u_stop_color_0"),
    stopColor1: gl.getUniformLocation(faceProgram, "u_stop_color_1"),
    gradientAxis: gl.getUniformLocation(faceProgram, "u_gradient_axis"),
    gradientOffset: gl.getUniformLocation(faceProgram, "u_gradient_offset"),
    gradientSpan: gl.getUniformLocation(faceProgram, "u_gradient_span"),
    prismOpacity: gl.getUniformLocation(faceProgram, "u_prism_opacity"),
    whiteStrength: gl.getUniformLocation(faceProgram, "u_white_strength"),
    highlightAxis: gl.getUniformLocation(faceProgram, "u_highlight_axis"),
    highlightOffset: gl.getUniformLocation(
      faceProgram,
      "u_highlight_offset",
    ),
    edgeLift: gl.getUniformLocation(faceProgram, "u_edge_lift"),
    oitMode: gl.getUniformLocation(faceProgram, "u_oit_mode"),
    oitWeight: gl.getUniformLocation(faceProgram, "u_oit_weight"),
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

  const oitCompositeLocations = {
    position: gl.getAttribLocation(oitCompositeProgram, "a_position"),
    uv: gl.getAttribLocation(oitCompositeProgram, "a_uv"),
    origin: gl.getUniformLocation(oitCompositeProgram, "u_origin"),
    resolution: gl.getUniformLocation(oitCompositeProgram, "u_resolution"),
    texture: gl.getUniformLocation(oitCompositeProgram, "u_texture"),
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
    const pixelRatio = clampValue(window.devicePixelRatio || 1, 1, 1.75);
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
    resizeRenderTarget(gl, faceAccumTarget, pixelWidth, pixelHeight);
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
      viewportWidth !== scene.width || viewportHeight !== scene.height;
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

  function bindFullTarget(target, scene, clear = true) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);

    if (clear) {
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

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
        face.points[index].depth01,
        color[0],
        color[1],
        color[2],
        opacity,
      );
    }

    return new Float32Array(data);
  }

  function prepareFace(face, color, opacity, target) {
    const vertices = faceVertices(face, color, opacity);
    const stride = 9 * Float32Array.BYTES_PER_ELEMENT;
    gl.useProgram(faceProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, faceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    setAttribute(gl, faceLocations.position, 2, stride, 0);
    setAttribute(gl, faceLocations.uv, 2, stride, 2 * 4);
    setAttribute(gl, faceLocations.depth, 1, stride, 4 * 4);
    setAttribute(gl, faceLocations.color, 4, stride, 5 * 4);
    gl.uniform2f(faceLocations.origin, target.originX, target.originY);
    gl.uniform2f(faceLocations.resolution, target.width, target.height);
  }

  function drawSolidFace(face, color, opacity, target) {
    prepareFace(face, color, opacity, target);
    gl.uniform1f(faceLocations.mode, 0);
    gl.uniform1f(faceLocations.oitMode, 0);
    gl.uniform1f(faceLocations.oitWeight, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function setVec3(location, color) {
    gl.uniform3f(location, color[0], color[1], color[2]);
  }

  function drawPrismFace(face, target, oitMode = 0) {
    prepareFace(face, WHITE, 1, target);
    gl.uniform1f(faceLocations.mode, 1);
    setVec3(faceLocations.stopColor0, face.rampColors[0]);
    setVec3(faceLocations.stopColor1, face.rampColors[1]);
    gl.uniform2f(
      faceLocations.gradientAxis,
      face.gradientAxis[0],
      face.gradientAxis[1],
    );
    gl.uniform1f(faceLocations.gradientOffset, face.gradientOffset);
    gl.uniform1f(faceLocations.gradientSpan, face.gradientSpan);
    gl.uniform1f(faceLocations.prismOpacity, face.prismOpacity);
    gl.uniform1f(faceLocations.whiteStrength, face.whiteStrength);
    gl.uniform2f(
      faceLocations.highlightAxis,
      face.highlightAxis[0],
      face.highlightAxis[1],
    );
    gl.uniform1f(faceLocations.highlightOffset, face.highlightOffset);
    gl.uniform1f(faceLocations.edgeLift, face.edgeLift);
    gl.uniform1f(faceLocations.oitMode, oitMode);
    gl.uniform1f(faceLocations.oitWeight, face.oitWeight ?? 0.15);
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
      const radius = vertex.radius * 2.18;
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

  function compositeOitTexture(texture, scene) {
    const target = bindMain(scene);
    const vertices = textureVertices(0, 0, scene.width, scene.height);
    prepareTextureProgram(
      oitCompositeProgram,
      oitCompositeLocations,
      vertices,
      target,
    );
    gl.bindTexture(gl.TEXTURE_2D, texture);
    setNormalBlend(gl);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function drawBlurred(lines, sigma, includeSource, region, scene) {
    if (!lines.length) {
      return;
    }

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
      2.35,
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
      1.95,
      true,
      region,
      scene,
    );
  }

  function renderFaces(scene) {
    const mainTarget = bindMain(scene);

    // Absorption remains a soft overlay.
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    setNormalBlend(gl);
    for (const face of scene.faces) {
      drawSolidFace(
        face,
        ABSORPTION_COLOR,
        face.absorptionOpacity,
        mainTarget,
      );
    }

    // The dense weighted accumulation intentionally preserves the original
    // saturated glass look while remaining independent of painter order.
    const accumulationTarget = bindFullTarget(faceAccumTarget, scene, true);
    setAdditiveBlend(gl);

    for (const face of scene.faces) {
      if (face.prismOpacity <= 0.001) continue;
      drawPrismFace(face, accumulationTarget, 1);
    }

    compositeOitTexture(faceAccumTarget.texture, scene);

    setScreenBlend(gl);
    for (const face of scene.faces) {
      drawCapsules(rimLines(face), mainTarget);
    }
  }

  function render(scene) {
    resizeCanvas(scene.width, scene.height);
    const region = ensureEffectRegion(scene);
    bindMain(scene);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // A restrained spectral halo, then the same rear-face/front-face painter
    // ordering used by the original cube. This keeps the geometry readable.
    drawBlurred(bloomLines(scene.edges), 4.6, false, region, scene);
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
    gl.deleteTexture(faceAccumTarget.texture);
    gl.deleteFramebuffer(firstTarget.framebuffer);
    gl.deleteFramebuffer(secondTarget.framebuffer);
    gl.deleteFramebuffer(faceAccumTarget.framebuffer);
    gl.deleteProgram(capsuleProgram);
    gl.deleteProgram(faceProgram);
    gl.deleteProgram(radialProgram);
    gl.deleteProgram(textureProgram);
    gl.deleteProgram(oitCompositeProgram);
    gl.deleteProgram(blurProgram);
  }

  return { render, destroy };
}
