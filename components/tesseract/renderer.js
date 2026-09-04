"use client";

/**
 * WebGL renderer for the tesseract.
 *
 * Pipeline, all of it in linear light:
 *
 *   1. rear edges          additive, into an offscreen HDR buffer
 *   2. glass transmittance multiplicative — tints and dims whatever is behind
 *   3. glass emission      additive — transmitted light plus surface sheen
 *   4. front edges         additive
 *   5. vertices            additive
 *   6. bloom               threshold + separable blur at 1/N resolution
 *   7. composite           exposure -> ACES -> sRGB, once, to the canvas
 *
 * Multiplication commutes, so step 2 is order-independent by construction and
 * needs no sorting or weighted-blended OIT; addition commutes too, so step 3
 * is as well. Every pass below is a single batched draw call.
 *
 * The one approximation: because all absorption happens before all emission,
 * a rear face's glow is not dimmed by the glass in front of it. Doing that
 * exactly would mean interleaving the two passes per face in depth order, at
 * 48 draw calls instead of 2. The depth term in the face shader
 * (LOOK.glass.depthScatterFloor) stands in for it.
 */

import { GLASS_F0, LOOK } from "./look.js";
import {
  blurFragmentShader,
  brightPassFragmentShader,
  capsuleFragmentShader,
  capsuleVertexShader,
  compositeFragmentShader,
  faceFragmentShader,
  faceVertexShader,
  pointFragmentShader,
  pointVertexShader,
  quadVertexShader,
} from "./shaders.js";

const FACE_STRIDE = 15;
const CAPSULE_STRIDE = 10;
const POINT_STRIDE = 6;
const QUAD_ORDER = [0, 1, 2, 0, 2, 3];
const CAPSULE_ORDER = [0, 1, 2, 2, 1, 3];
const FACE_UV = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

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

/** Resolves every attribute and uniform name once, at startup. */
function describeProgram(gl, program, attributes, uniforms) {
  const info = { program, attributes: {}, uniforms: {} };

  for (const name of attributes) {
    info.attributes[name] = gl.getAttribLocation(program, name);
  }

  for (const name of uniforms) {
    info.uniforms[name] = gl.getUniformLocation(program, name);
  }

  return info;
}

/** A growable Float32Array used to stage one batched draw. */
function createBatch(initialFloats) {
  return { data: new Float32Array(initialFloats), length: 0 };
}

function ensureCapacity(batch, floats) {
  if (batch.data.length >= floats) return;
  let size = batch.data.length || 1024;
  while (size < floats) size *= 2;
  batch.data = new Float32Array(size);
}

export function createRenderer(canvas) {
  const contextOptions = {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  };

  const gl =
    canvas.getContext("webgl", contextOptions) ||
    canvas.getContext("experimental-webgl", contextOptions);

  if (!gl) return null;

  /* ---------------------------------------------------------------- */
  /* Precision probing                                                */
  /* ---------------------------------------------------------------- */

  const halfFloat = gl.getExtension("OES_texture_half_float");
  const halfFloatLinear = gl.getExtension("OES_texture_half_float_linear");
  const HALF_FLOAT_OES = halfFloat ? halfFloat.HALF_FLOAT_OES : null;

  let hdrType = gl.UNSIGNED_BYTE;
  let exposureScale = LOOK.tone.lowPrecisionScale;

  if (halfFloat && halfFloatLinear) {
    const probe = gl.createTexture();
    const probeBuffer = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, probe);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      4,
      4,
      0,
      gl.RGBA,
      HALF_FLOAT_OES,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, probeBuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      probe,
      0,
    );

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
      hdrType = HALF_FLOAT_OES;
      exposureScale = 1;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(probeBuffer);
    gl.deleteTexture(probe);
  }

  const inverseExposureScale = 1 / exposureScale;

  /* ---------------------------------------------------------------- */
  /* Programs                                                         */
  /* ---------------------------------------------------------------- */

  const facePass = describeProgram(
    gl,
    createProgram(gl, faceVertexShader, faceFragmentShader),
    ["a_pos3", "a_normal", "a_uv", "a_tint", "a_params"],
    [
      "u_center",
      "u_resolution",
      "u_scale",
      "u_z_distance",
      "u_camera",
      "u_light_position[0]",
      "u_light_position[1]",
      "u_light_color[0]",
      "u_light_color[1]",
      "u_light_intensity[0]",
      "u_light_intensity[1]",
      "u_mode",
      "u_f0",
      "u_specular_exponent",
      "u_transmission_wrap",
      "u_projected_radius",
      "u_depth_floor",
      "u_depth_curve",
      "u_aerial_floor",
      "u_rim_width",
      "u_exposure_scale",
      "u_sheen",
      "u_fresnel_rim",
    ],
  );

  const capsulePass = describeProgram(
    gl,
    createProgram(gl, capsuleVertexShader, capsuleFragmentShader),
    ["a_position", "a_local", "a_half_size", "a_color"],
    ["u_origin", "u_resolution", "u_pixel_ratio", "u_exposure_scale"],
  );

  const pointPass = describeProgram(
    gl,
    createProgram(gl, pointVertexShader, pointFragmentShader),
    ["a_position", "a_local", "a_intensity", "a_radius"],
    ["u_origin", "u_resolution", "u_pixel_ratio", "u_exposure_scale"],
  );

  const brightPass = describeProgram(
    gl,
    createProgram(gl, quadVertexShader, brightPassFragmentShader),
    ["a_position", "a_uv"],
    ["u_texture", "u_threshold", "u_knee"],
  );

  const blurPass = describeProgram(
    gl,
    createProgram(gl, quadVertexShader, blurFragmentShader),
    ["a_position", "a_uv"],
    ["u_texture", "u_step"],
  );

  const compositePass = describeProgram(
    gl,
    createProgram(gl, quadVertexShader, compositeFragmentShader),
    ["a_position", "a_uv"],
    [
      "u_scene",
      "u_bloom",
      "u_bloom_strength",
      "u_exposure",
      "u_inverse_exposure_scale",
      "u_saturation",
    ],
  );

  /* ---------------------------------------------------------------- */
  /* Buffers and targets                                              */
  /* ---------------------------------------------------------------- */

  const faceBuffer = gl.createBuffer();
  const capsuleBuffer = gl.createBuffer();
  const pointBuffer = gl.createBuffer();
  const quadBuffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, -1, 1, 0, 1, 1, -1, 1, 0, 1, 1, 1,
      1,
    ]),
    gl.STATIC_DRAW,
  );

  const faceBatch = createBatch(24 * 6 * FACE_STRIDE);
  const capsuleBatch = createBatch(32 * 4 * 6 * CAPSULE_STRIDE);
  const pointBatch = createBatch(16 * 6 * POINT_STRIDE);

  function createTarget(type, filter) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return {
      texture,
      framebuffer: gl.createFramebuffer(),
      type,
      width: 0,
      height: 0,
    };
  }

  function resizeTarget(target, width, height) {
    if (target.width === width && target.height === height) return;

    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      target.type,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      target.texture,
      0,
    );

    target.width = width;
    target.height = height;
  }

  const sceneTarget = createTarget(hdrType, gl.LINEAR);
  const bloomTargetA = createTarget(hdrType, gl.LINEAR);
  const bloomTargetB = createTarget(hdrType, gl.LINEAR);

  let canvasWidth = 0;
  let canvasHeight = 0;
  let pixelRatio = 1;

  /* ---------------------------------------------------------------- */
  /* State helpers                                                    */
  /* ---------------------------------------------------------------- */

  function setBlend(sourceFactor, destinationFactor) {
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(
      sourceFactor,
      destinationFactor,
      sourceFactor,
      destinationFactor,
    );
  }

  const additive = () => setBlend(gl.ONE, gl.ONE);
  const multiplicative = () => setBlend(gl.ZERO, gl.SRC_COLOR);
  const premultiplied = () => setBlend(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  function bindTarget(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(
      0,
      0,
      target ? target.width : canvas.width,
      target ? target.height : canvas.height,
    );
  }

  function clearBound() {
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // WebGL 1 has no vertex array objects, so attribute enable state is global.
  // Anything left enabled by the previous program would keep reading from a
  // stale buffer, so unused slots are switched off on every bind.
  const enabledAttributes = new Set();

  function bindAttributes(pass, layout, stride) {
    const used = new Set();
    let offset = 0;

    for (const [name, size] of layout) {
      const location = pass.attributes[name];

      if (location >= 0) {
        used.add(location);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(
          location,
          size,
          gl.FLOAT,
          false,
          stride * 4,
          offset * 4,
        );
      }

      offset += size;
    }

    for (const location of enabledAttributes) {
      if (!used.has(location)) gl.disableVertexAttribArray(location);
    }

    enabledAttributes.clear();
    for (const location of used) enabledAttributes.add(location);
  }

  function uploadBatch(buffer, batch) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      batch.data.subarray(0, batch.length),
      gl.DYNAMIC_DRAW,
    );
  }

  /* ---------------------------------------------------------------- */
  /* Batch writers                                                    */
  /* ---------------------------------------------------------------- */

  function writeFaces(faces) {
    ensureCapacity(faceBatch, faces.length * 6 * FACE_STRIDE);
    const data = faceBatch.data;
    let cursor = 0;

    for (const face of faces) {
      for (const corner of QUAD_ORDER) {
        const position = face.points3D[corner];
        const uv = FACE_UV[corner];

        data[cursor++] = position[0];
        data[cursor++] = position[1];
        data[cursor++] = position[2];
        data[cursor++] = face.normal[0];
        data[cursor++] = face.normal[1];
        data[cursor++] = face.normal[2];
        data[cursor++] = uv[0];
        data[cursor++] = uv[1];
        data[cursor++] = face.tint[0];
        data[cursor++] = face.tint[1];
        data[cursor++] = face.tint[2];
        data[cursor++] = face.thickness;
        data[cursor++] = face.density;
        data[cursor++] = face.scatterGain;
        data[cursor++] = face.rimGain;
      }
    }

    faceBatch.length = cursor;
    return cursor / FACE_STRIDE;
  }

  function writeCapsules(lines) {
    ensureCapacity(capsuleBatch, lines.length * 6 * CAPSULE_STRIDE);
    const data = capsuleBatch.data;
    let cursor = 0;

    for (const line of lines) {
      const deltaX = line.x2 - line.x1;
      const deltaY = line.y2 - line.y1;
      const length = Math.max(Math.hypot(deltaX, deltaY), 1e-4);
      const directionX = deltaX / length;
      const directionY = deltaY / length;
      const normalX = -directionY;
      const normalY = directionX;
      const halfLength = length / 2;
      const halfWidth = Math.max(line.width / 2, 0.001);
      const extended = halfLength + halfWidth;
      const centerX = (line.x1 + line.x2) / 2;
      const centerY = (line.y1 + line.y2) / 2;
      const corners = [
        [-extended, -halfWidth],
        [extended, -halfWidth],
        [-extended, halfWidth],
        [extended, halfWidth],
      ];

      for (const index of CAPSULE_ORDER) {
        const [localX, localY] = corners[index];

        data[cursor++] = centerX + directionX * localX + normalX * localY;
        data[cursor++] = centerY + directionY * localX + normalY * localY;
        data[cursor++] = localX;
        data[cursor++] = localY;
        data[cursor++] = halfLength;
        data[cursor++] = halfWidth;
        data[cursor++] = line.color[0];
        data[cursor++] = line.color[1];
        data[cursor++] = line.color[2];
        data[cursor++] = line.intensity;
      }
    }

    capsuleBatch.length = cursor;
    return cursor / CAPSULE_STRIDE;
  }

  function writePoints(vertices) {
    ensureCapacity(pointBatch, vertices.length * 6 * POINT_STRIDE);
    const data = pointBatch.data;
    const corners = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];
    let cursor = 0;

    for (const vertex of vertices) {
      for (const index of CAPSULE_ORDER) {
        const [localX, localY] = corners[index];

        data[cursor++] = vertex.x + localX * vertex.radius;
        data[cursor++] = vertex.y + localY * vertex.radius;
        data[cursor++] = localX;
        data[cursor++] = localY;
        data[cursor++] = vertex.intensity;
        data[cursor++] = vertex.radius;
      }
    }

    pointBatch.length = cursor;
    return cursor / POINT_STRIDE;
  }

  /**
   * One edge becomes three laterally offset spectral samples plus a hot core.
   *
   * The offsets share a direction — the way the nearest light bends the ray —
   * and are ordered red < green < blue, which is the ordering of normal
   * dispersion. Deriving the direction from geometry rather than from the edge
   * index is what makes the fringe read as a prism rather than as noise.
   */
  function edgeLines(edges, passKey, dispersion) {
    const lines = [];

    for (const edge of edges) {
      const pass = edge[passKey];
      if (pass <= 0.004) continue;

      for (const sample of dispersion) {
        const offsetX = edge.bendDirection[0] * sample.offset * edge.spread;
        const offsetY = edge.bendDirection[1] * sample.offset * edge.spread;

        lines.push({
          x1: edge.x1 + offsetX,
          y1: edge.y1 + offsetY,
          x2: edge.x2 + offsetX,
          y2: edge.y2 + offsetY,
          width: edge.coreWidth,
          color: sample.color,
          intensity: edge.spectralStrength * pass,
        });
      }

      lines.push({
        x1: edge.x1,
        y1: edge.y1,
        x2: edge.x2,
        y2: edge.y2,
        width: edge.coreWidth * 0.5,
        color: edge.coreColor,
        intensity: edge.coreIntensity * pass,
      });
    }

    return lines;
  }

  /* ---------------------------------------------------------------- */
  /* Passes                                                           */
  /* ---------------------------------------------------------------- */

  function drawCapsules(lines, scene) {
    if (!lines.length) return;

    const count = writeCapsules(lines);
    uploadBatch(capsuleBuffer, capsuleBatch);
    gl.useProgram(capsulePass.program);
    bindAttributes(
      capsulePass,
      [
        ["a_position", 2],
        ["a_local", 2],
        ["a_half_size", 2],
        ["a_color", 4],
      ],
      CAPSULE_STRIDE,
    );
    gl.uniform2f(capsulePass.uniforms.u_origin, 0, 0);
    gl.uniform2f(capsulePass.uniforms.u_resolution, scene.width, scene.height);
    gl.uniform1f(capsulePass.uniforms.u_pixel_ratio, pixelRatio);
    gl.uniform1f(capsulePass.uniforms.u_exposure_scale, exposureScale);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }

  // The two face passes share one upload: staged once, drawn twice.
  let faceVertexCount = 0;

  function uploadFaces(scene) {
    faceVertexCount = writeFaces(scene.faces);
    if (faceVertexCount) uploadBatch(faceBuffer, faceBatch);
  }

  function drawFaces(scene, mode) {
    const count = faceVertexCount;
    if (!count) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, faceBuffer);
    gl.useProgram(facePass.program);
    bindAttributes(
      facePass,
      [
        ["a_pos3", 3],
        ["a_normal", 3],
        ["a_uv", 2],
        ["a_tint", 3],
        ["a_params", 4],
      ],
      FACE_STRIDE,
    );

    const glass = LOOK.glass;
    const uniforms = facePass.uniforms;

    gl.uniform2f(uniforms.u_center, scene.centerX, scene.centerY);
    gl.uniform2f(uniforms.u_resolution, scene.width, scene.height);
    gl.uniform1f(uniforms.u_scale, scene.scale);
    gl.uniform1f(uniforms.u_z_distance, scene.zDistance);
    gl.uniform3f(
      uniforms.u_camera,
      scene.camera[0],
      scene.camera[1],
      scene.camera[2],
    );

    LOOK.lights.forEach((light, index) => {
      gl.uniform3f(
        uniforms[`u_light_position[${index}]`],
        light.position[0],
        light.position[1],
        light.position[2],
      );
      gl.uniform3f(
        uniforms[`u_light_color[${index}]`],
        light.color[0],
        light.color[1],
        light.color[2],
      );
      gl.uniform1f(uniforms[`u_light_intensity[${index}]`], light.intensity);
    });

    gl.uniform1f(uniforms.u_mode, mode);
    gl.uniform1f(uniforms.u_f0, GLASS_F0);
    gl.uniform1f(uniforms.u_specular_exponent, glass.specularExponent);
    gl.uniform1f(uniforms.u_transmission_wrap, glass.transmissionWrap);
    gl.uniform1f(uniforms.u_projected_radius, scene.projectedRadius);
    gl.uniform1f(uniforms.u_depth_floor, glass.depthScatterFloor);
    gl.uniform1f(uniforms.u_depth_curve, glass.depthScatterCurve);
    gl.uniform1f(uniforms.u_aerial_floor, glass.aerialSaturationFloor);
    gl.uniform1f(uniforms.u_rim_width, glass.rimWidth);
    gl.uniform1f(uniforms.u_sheen, glass.sheen);
    gl.uniform1f(uniforms.u_fresnel_rim, glass.fresnelRim);
    gl.uniform1f(uniforms.u_exposure_scale, exposureScale);

    gl.drawArrays(gl.TRIANGLES, 0, count);
  }

  function drawPoints(scene) {
    const count = writePoints(scene.vertices);
    if (!count) return;

    uploadBatch(pointBuffer, pointBatch);
    gl.useProgram(pointPass.program);
    bindAttributes(
      pointPass,
      [
        ["a_position", 2],
        ["a_local", 2],
        ["a_intensity", 1],
        ["a_radius", 1],
      ],
      POINT_STRIDE,
    );
    gl.uniform2f(pointPass.uniforms.u_origin, 0, 0);
    gl.uniform2f(pointPass.uniforms.u_resolution, scene.width, scene.height);
    gl.uniform1f(pointPass.uniforms.u_pixel_ratio, pixelRatio);
    gl.uniform1f(pointPass.uniforms.u_exposure_scale, exposureScale);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  }

  function drawFullscreen(pass) {
    gl.useProgram(pass.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    bindAttributes(
      pass,
      [
        ["a_position", 2],
        ["a_uv", 2],
      ],
      4,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function renderBloom(enabled) {
    const bloom = LOOK.bloom;
    const width = Math.max(Math.floor(canvas.width / bloom.downscale), 1);
    const height = Math.max(Math.floor(canvas.height / bloom.downscale), 1);

    resizeTarget(bloomTargetA, width, height);
    resizeTarget(bloomTargetB, width, height);

    if (!enabled) {
      bindTarget(bloomTargetA);
      clearBound();
      return;
    }

    bindTarget(bloomTargetA);
    clearBound();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTarget.texture);
    gl.useProgram(brightPass.program);
    gl.uniform1i(brightPass.uniforms.u_texture, 0);
    gl.uniform1f(brightPass.uniforms.u_threshold, bloom.threshold);
    gl.uniform1f(brightPass.uniforms.u_knee, bloom.knee);
    drawFullscreen(brightPass);

    const spacing = (bloom.sigma / bloom.downscale) / 1.637;

    for (const horizontal of [true, false]) {
      const source = horizontal ? bloomTargetA : bloomTargetB;
      const destination = horizontal ? bloomTargetB : bloomTargetA;

      bindTarget(destination);
      clearBound();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.useProgram(blurPass.program);
      gl.uniform1i(blurPass.uniforms.u_texture, 0);
      gl.uniform2f(
        blurPass.uniforms.u_step,
        horizontal ? spacing / width : 0,
        horizontal ? 0 : spacing / height,
      );
      drawFullscreen(blurPass);
    }
  }

  function resize(scene) {
    const nextPixelRatio = Math.min(
      Math.max(window.devicePixelRatio || 1, 1),
      LOOK.quality.maxPixelRatio,
    );
    const width = Math.max(Math.round(scene.width * nextPixelRatio), 1);
    const height = Math.max(Math.round(scene.height * nextPixelRatio), 1);

    if (
      canvasWidth === scene.width &&
      canvasHeight === scene.height &&
      pixelRatio === nextPixelRatio &&
      canvas.width === width &&
      canvas.height === height
    ) {
      return;
    }

    canvasWidth = scene.width;
    canvasHeight = scene.height;
    pixelRatio = nextPixelRatio;
    canvas.width = width;
    canvas.height = height;
    resizeTarget(sceneTarget, width, height);
  }

  function render(scene) {
    resize(scene);

    const dispersion = scene.dispersion;

    bindTarget(sceneTarget);
    clearBound();

    additive();
    drawCapsules(edgeLines(scene.edges, "rearPass", dispersion), scene);

    uploadFaces(scene);
    multiplicative();
    drawFaces(scene, 0);

    additive();
    drawFaces(scene, 1);
    drawCapsules(edgeLines(scene.edges, "frontPass", dispersion), scene);
    drawPoints(scene);

    renderBloom(scene.width >= LOOK.quality.bloomMinWidth);

    bindTarget(null);
    clearBound();
    premultiplied();
    gl.useProgram(compositePass.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTarget.texture);
    gl.uniform1i(compositePass.uniforms.u_scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomTargetA.texture);
    gl.uniform1i(compositePass.uniforms.u_bloom, 1);
    gl.uniform1f(
      compositePass.uniforms.u_bloom_strength,
      scene.width >= LOOK.quality.bloomMinWidth ? LOOK.bloom.strength : 0,
    );
    gl.uniform1f(compositePass.uniforms.u_exposure, LOOK.tone.exposure);
    gl.uniform1f(
      compositePass.uniforms.u_inverse_exposure_scale,
      inverseExposureScale,
    );
    gl.uniform1f(compositePass.uniforms.u_saturation, LOOK.tone.saturation);
    drawFullscreen(compositePass);
    gl.activeTexture(gl.TEXTURE0);
  }

  function destroy() {
    for (const buffer of [faceBuffer, capsuleBuffer, pointBuffer, quadBuffer]) {
      gl.deleteBuffer(buffer);
    }

    for (const target of [sceneTarget, bloomTargetA, bloomTargetB]) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
    }

    for (const pass of [
      facePass,
      capsulePass,
      pointPass,
      brightPass,
      blurPass,
      compositePass,
    ]) {
      gl.deleteProgram(pass.program);
    }
  }

  return { render, destroy, highDynamicRange: hdrType !== gl.UNSIGNED_BYTE };
}
