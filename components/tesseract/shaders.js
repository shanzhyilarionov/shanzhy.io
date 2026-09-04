/**
 * GLSL sources.
 *
 * The whole pipeline works in linear light and renders into an offscreen HDR
 * buffer; the only sRGB encode happens once, in the composite shader, after
 * tone mapping.
 */

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const LUMINANCE = `
float luminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}
`;

/* ------------------------------------------------------------------ */
/* Faces                                                              */
/* ------------------------------------------------------------------ */

/**
 * The 3D -> 2D perspective divide happens here rather than on the CPU, so
 * gl_Position.w carries the real perspective weight and WebGL interpolates
 * every varying projectively. That is what removes the diagonal seam a
 * screen-space quad shows when its two triangles interpolate UVs affinely.
 */
export const faceVertexShader = `
attribute vec3 a_pos3;
attribute vec3 a_normal;
attribute vec2 a_uv;
attribute vec3 a_tint;
attribute vec4 a_params;

uniform vec2 u_center;
uniform vec2 u_resolution;
uniform float u_scale;
uniform float u_z_distance;

varying vec3 v_world;
varying vec3 v_normal;
varying vec2 v_uv;
varying vec3 v_tint;
varying vec4 v_params;

void main() {
  float w = max((u_z_distance - a_pos3.z) / u_z_distance, 0.05);
  vec2 screen = u_center + a_pos3.xy * (1.0 / w) * u_scale;
  vec2 ndc = vec2(
    screen.x / u_resolution.x * 2.0 - 1.0,
    1.0 - screen.y / u_resolution.y * 2.0
  );

  gl_Position = vec4(ndc * w, 0.0, w);
  v_world = a_pos3;
  v_normal = a_normal;
  v_uv = a_uv;
  v_tint = a_tint;
  v_params = a_params;
}
`;

/**
 * Two modes over the same geometry.
 *
 *  mode 0 - transmittance. Beer-Lambert through a slab whose optical path
 *           stretches as 1/|N.V|, blended multiplicatively so the product over
 *           all faces is exp(-sum(sigma * d)) regardless of draw order. This
 *           is what tints and darkens whatever lies behind the glass.
 *
 *  mode 1 - what the glass sends towards the eye: light that entered from the
 *           far side and survived absorption (hence the T factor, which is why
 *           red glass reads red), plus a Schlick-weighted Blinn-Phong lobe for
 *           the surface reflection.
 */
export const faceFragmentShader = `${PRECISION}${LUMINANCE}
varying vec3 v_world;
varying vec3 v_normal;
varying vec2 v_uv;
varying vec3 v_tint;
varying vec4 v_params;

uniform vec3 u_camera;
uniform vec3 u_light_position[2];
uniform vec3 u_light_color[2];
uniform float u_light_intensity[2];

uniform float u_mode;
uniform float u_f0;
uniform float u_specular_exponent;
uniform float u_transmission_wrap;
uniform float u_projected_radius;
uniform float u_depth_floor;
uniform float u_depth_curve;
uniform float u_aerial_floor;
uniform float u_rim_width;
uniform float u_exposure_scale;
uniform float u_sheen;
uniform float u_fresnel_rim;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 view = normalize(u_camera - v_world);
  float cosNV = max(abs(dot(normal, view)), 0.06);

  float path = v_params.x / cosNV;
  vec3 extinction = -log(clamp(v_tint, 0.0015, 0.995)) * v_params.y;
  vec3 transmittance = exp(-extinction * path);

  if (u_mode < 0.5) {
    gl_FragColor = vec4(transmittance, luminance(transmittance));
    return;
  }

  float fresnel = u_f0 + (1.0 - u_f0) * pow(1.0 - cosNV, 5.0);

  vec3 through = vec3(0.0);
  vec3 sheen = vec3(0.0);

  for (int i = 0; i < 2; i++) {
    vec3 toLight = u_light_position[i] - v_world;
    float distanceSquared = max(dot(toLight, toLight), 1e-4);
    vec3 lightDirection = toLight * inversesqrt(distanceSquared);
    float attenuation = u_light_intensity[i] / distanceSquared;
    float alignment = dot(normal, lightDirection);

    // Light reaching the far side of the pane is what we see transmitted;
    // light on our side still contributes a little forward scattering.
    float behind = max(-alignment, 0.0);
    float infront = max(alignment, 0.0);
    float carried = behind + infront * u_transmission_wrap;

    vec3 half_vector = normalize(lightDirection + view);
    float lobe = pow(max(dot(normal, half_vector), 0.0), u_specular_exponent);

    through += u_light_color[i] * attenuation * carried;
    sheen += u_light_color[i] * attenuation * lobe * fresnel * u_sheen;
  }

  // Thicker glass at the outline: a soft lift along the face boundary.
  float edgeDistance = min(
    min(v_uv.x, 1.0 - v_uv.x),
    min(v_uv.y, 1.0 - v_uv.y)
  );
  float rim = 1.0 - smoothstep(0.0, u_rim_width, edgeDistance);

  // At grazing angles a pane stops transmitting and starts mirroring. This
  // term is what gives the silhouette its bright, hard outline.
  vec3 grazing = vec3(1.0, 0.99, 0.98) * fresnel * u_fresnel_rim * length(through) * 0.18;

  vec3 color =
    transmittance * through * v_params.z * (1.0 + rim * v_params.w * 0.5) +
    sheen +
    grazing +
    transmittance * rim * v_params.w * 0.1;

  // Aerial perspective: distance drains chroma before it drains light.
  float front = clamp(
    (v_world.z + u_projected_radius) / (2.0 * u_projected_radius),
    0.0,
    1.0
  );
  float depthGain = mix(u_depth_floor, 1.0, pow(front, u_depth_curve));
  float saturation = mix(u_aerial_floor, 1.0, front);
  color = mix(vec3(luminance(color)), color, saturation) * depthGain;

  color *= u_exposure_scale;
  gl_FragColor = vec4(color, luminance(color));
}
`;

/* ------------------------------------------------------------------ */
/* Capsules (edges and face outlines)                                 */
/* ------------------------------------------------------------------ */

export const capsuleVertexShader = `
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

export const capsuleFragmentShader = `${PRECISION}${LUMINANCE}
varying vec2 v_local;
varying vec2 v_half_size;
varying vec4 v_color;

uniform float u_pixel_ratio;
uniform float u_exposure_scale;

void main() {
  vec2 nearest = vec2(max(abs(v_local.x) - v_half_size.x, 0.0), v_local.y);
  float distanceToEdge = length(nearest) - v_half_size.y;
  float antialias = max(0.7 / u_pixel_ratio, 0.18);
  float coverage = 1.0 - smoothstep(-antialias, antialias, distanceToEdge);
  vec3 color = v_color.rgb * v_color.a * coverage * u_exposure_scale;
  gl_FragColor = vec4(color, luminance(color));
}
`;

/* ------------------------------------------------------------------ */
/* Vertex points                                                      */
/* ------------------------------------------------------------------ */

export const pointVertexShader = `
attribute vec2 a_position;
attribute vec2 a_local;
attribute float a_intensity;
attribute float a_radius;

uniform vec2 u_origin;
uniform vec2 u_resolution;

varying vec2 v_local;
varying float v_intensity;
varying float v_radius;

void main() {
  vec2 position = (a_position - u_origin) / u_resolution;
  gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
  v_local = a_local;
  v_intensity = a_intensity;
  v_radius = a_radius;
}
`;

export const pointFragmentShader = `${PRECISION}${LUMINANCE}
varying vec2 v_local;
varying float v_intensity;
varying float v_radius;

uniform float u_pixel_ratio;
uniform float u_exposure_scale;

void main() {
  float distanceFromCenter = length(v_local);
  float antialias = max(0.8 / max(v_radius * u_pixel_ratio, 1.0), 0.02);
  float coverage = 1.0 - smoothstep(1.0 - antialias, 1.0, distanceFromCenter);
  float falloff = exp(-distanceFromCenter * distanceFromCenter * 6.5);
  vec3 color = vec3(1.0, 0.96, 0.92) * falloff * coverage * v_intensity;
  color *= u_exposure_scale;
  gl_FragColor = vec4(color, luminance(color));
}
`;

/* ------------------------------------------------------------------ */
/* Full-screen passes                                                 */
/* ------------------------------------------------------------------ */

export const quadVertexShader = `
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}
`;

export const brightPassFragmentShader = `${PRECISION}${LUMINANCE}
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_threshold;
uniform float u_knee;

void main() {
  vec3 color = texture2D(u_texture, v_uv).rgb;
  float brightness = luminance(color);
  float soft = clamp(brightness - u_threshold + u_knee, 0.0, 2.0 * u_knee);
  soft = soft * soft / (4.0 * u_knee + 1e-4);
  float contribution =
    max(soft, brightness - u_threshold) / max(brightness, 1e-4);
  gl_FragColor = vec4(color * contribution, 1.0);
}
`;

export const blurFragmentShader = `${PRECISION}
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

/**
 * Exposure, ACES tone mapping (Narkowicz's fit), then the single sRGB encode
 * for the whole pipeline.
 */
export const compositeFragmentShader = `${PRECISION}${LUMINANCE}
varying vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloom_strength;
uniform float u_exposure;
uniform float u_inverse_exposure_scale;
uniform float u_saturation;

vec3 acesFilmic(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 linear) {
  vec3 low = linear * 12.92;
  vec3 high = 1.055 * pow(max(linear, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), linear));
}

void main() {
  vec3 color = texture2D(u_scene, v_uv).rgb;
  color += texture2D(u_bloom, v_uv).rgb * u_bloom_strength;
  color *= u_inverse_exposure_scale * u_exposure;

  color = acesFilmic(color);
  color = mix(vec3(luminance(color)), color, u_saturation);
  color = linearToSrgb(clamp(color, 0.0, 1.0));

  // Premultiplied output. Over the black page this reproduces the colour
  // exactly; where the glass is faint it lets the title underneath show
  // through instead of punching a hole in it.
  float alpha = clamp(luminance(color) * 1.9, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;
