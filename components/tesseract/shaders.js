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


export const faceVertexShader = `
attribute vec3 a_pos3;
attribute vec3 a_tangent;
attribute vec3 a_bitangent;
attribute vec2 a_uv;
attribute vec3 a_tint;
attribute vec4 a_params;

uniform vec2 u_center;
uniform vec2 u_resolution;
uniform float u_scale;
uniform float u_z_distance;
uniform float u_projected_radius;

varying vec3 v_world;
varying vec3 v_tangent;
varying vec3 v_bitangent;
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

  float ndcZ = clamp(-a_pos3.z / u_projected_radius, -1.0, 1.0);

  gl_Position = vec4(ndc * w, ndcZ * w, w);
  v_world = a_pos3;
  v_tangent = a_tangent;
  v_bitangent = a_bitangent;
  v_uv = a_uv;
  v_tint = a_tint;
  v_params = a_params;
}
`;

export const faceFragmentShader = `${PRECISION}${LUMINANCE}
varying vec3 v_world;
varying vec3 v_tangent;
varying vec3 v_bitangent;
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
uniform float u_bevel_width;
uniform float u_bevel;
uniform float u_exposure_scale;
uniform float u_sheen;
uniform float u_fresnel_rim;
uniform float u_sweep_exponent;
uniform float u_sweep;
uniform float u_weight_floor;
uniform float u_weight_curve;

void main() {
  vec3 tangent = normalize(v_tangent);
  vec3 bitangent = normalize(v_bitangent);

  float toU = min(v_uv.x, 1.0 - v_uv.x);
  float toV = min(v_uv.y, 1.0 - v_uv.y);
  float edgeDistance = min(toU, toV);
  float bevel = 1.0 - smoothstep(0.0, u_bevel_width, edgeDistance);

  vec3 outward = toU < toV
    ? tangent * sign(v_uv.x - 0.5)
    : bitangent * sign(v_uv.y - 0.5);

  vec3 flat_normal = normalize(cross(tangent, bitangent));
  vec3 normal = normalize(mix(flat_normal, outward, bevel * u_bevel));

  vec3 view = normalize(u_camera - v_world);
  float cosNV = max(abs(dot(normal, view)), 0.06);

  float path = v_params.x / cosNV * v_params.w;
  vec3 extinction = -log(clamp(v_tint, 0.0015, 0.995)) * v_params.y;
  vec3 transmittance = exp(-extinction * path);

  if (u_mode < 0.5) {
    gl_FragColor = vec4(transmittance, luminance(transmittance));
    return;
  }

  float front = clamp(
    (v_world.z + u_projected_radius) / (2.0 * u_projected_radius),
    0.0,
    1.0
  );
  float depthGain = mix(u_depth_floor, 1.0, pow(front, u_depth_curve));
  float saturation = mix(u_aerial_floor, 1.0, front);

  float fresnel = u_f0 + (1.0 - u_f0) * pow(1.0 - cosNV, 5.0);

  vec3 through = vec3(0.0);
  vec3 sheen = vec3(0.0);

  for (int i = 0; i < 2; i++) {
    vec3 toLight = u_light_position[i] - v_world;
    float distanceSquared = max(dot(toLight, toLight), 1e-4);
    vec3 lightDirection = toLight * inversesqrt(distanceSquared);
    float attenuation = u_light_intensity[i] / distanceSquared;
    float alignment = dot(normal, lightDirection);

    float behind = max(-alignment, 0.0);
    float infront = max(alignment, 0.0);
    float carried = behind + infront * u_transmission_wrap;

    vec3 half_vector = normalize(lightDirection + view);
    float alignedHalf = max(dot(normal, half_vector), 0.0);

    float glint = pow(alignedHalf, u_specular_exponent);
    float sweep = pow(alignedHalf, u_sweep_exponent);

    through += u_light_color[i] * attenuation * carried;
    sheen +=
      u_light_color[i] *
      attenuation *
      (glint * fresnel * u_sheen + sweep * mix(0.3, 1.0, fresnel) * u_sweep);
  }

  if (u_mode < 1.5) {
    vec3 body = v_tint * (1.0 - transmittance) * through * v_params.z;
    body = mix(vec3(luminance(body)), body, saturation) * depthGain;

    float alpha = clamp(1.0 - luminance(transmittance), 0.0, 1.0);
    float weight = alpha * mix(u_weight_floor, 1.0, pow(front, u_weight_curve));

    gl_FragColor = vec4(body * weight * u_exposure_scale, weight);
    return;
  }

  vec3 grazing =
    vec3(1.0, 0.99, 0.98) * fresnel * u_fresnel_rim * length(through) * 0.18;
  vec3 highlight = sheen + grazing;
  highlight = mix(vec3(luminance(highlight)), highlight, saturation) * depthGain;
  highlight *= u_exposure_scale * v_params.w;

  gl_FragColor = vec4(highlight, luminance(highlight));
}
`;


export const capsuleVertexShader = `
attribute vec2 a_position;
attribute vec2 a_local;
attribute vec2 a_half_size;
attribute vec4 a_color;
attribute vec4 a_glint;
attribute float a_depth;
attribute vec3 a_tint;

uniform vec2 u_origin;
uniform vec2 u_resolution;
uniform float u_projected_radius;
uniform float u_depth_bias;

varying vec2 v_local;
varying vec2 v_half_size;
varying vec4 v_color;
varying vec4 v_glint;
varying vec3 v_tint;

void main() {
  vec2 position = (a_position - u_origin) / u_resolution;

  float ndcZ = clamp(-a_depth / u_projected_radius, -1.0, 1.0) - u_depth_bias;

  gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, ndcZ, 1.0);
  v_local = a_local;
  v_half_size = a_half_size;
  v_color = a_color;
  v_glint = a_glint;
  v_tint = a_tint;
}
`;

export const capsuleFragmentShader = `${PRECISION}${LUMINANCE}
varying vec2 v_local;
varying vec2 v_half_size;
varying vec4 v_color;
varying vec4 v_glint;
varying vec3 v_tint;

uniform float u_mode;
uniform float u_density;
uniform float u_radius;
uniform float u_pixel_ratio;
uniform float u_exposure_scale;
uniform float u_f0;
uniform float u_body_gain;
uniform float u_flank_gain;
uniform float u_glint_exponent;

void main() {
  vec2 nearest = vec2(max(abs(v_local.x) - v_half_size.x, 0.0), v_local.y);
  float distanceToEdge = length(nearest) - v_half_size.y;
  float antialias = max(0.7 / u_pixel_ratio, 0.18);
  float coverage = 1.0 - smoothstep(-antialias, antialias, distanceToEdge);

  float across = clamp(v_local.y / max(v_half_size.y, 1e-4), -1.0, 1.0);

  float chord = 2.0 * u_radius * sqrt(max(1.0 - across * across, 0.0));
  vec3 extinction = -log(clamp(v_tint, 0.0015, 0.995)) * u_density;
  vec3 transmittance = mix(vec3(1.0), exp(-extinction * chord), coverage);

  if (u_mode < 0.5) {
    gl_FragColor = vec4(transmittance, luminance(transmittance));
    return;
  }

  float cosNV = sqrt(max(1.0 - across * across, 0.0));

  float flank = u_f0 + (1.0 - u_f0) * pow(1.0 - cosNV, 2.0);
  float rod = u_body_gain + flank * u_flank_gain;

  float first = pow(max(1.0 - v_glint.x * v_glint.x, 0.0), u_glint_exponent);
  float second = pow(max(1.0 - v_glint.z * v_glint.z, 0.0), u_glint_exponent);
  float glint = first * v_glint.y + second * v_glint.w;

  vec3 body = v_color.rgb * v_color.a * rod;
  vec3 highlight = vec3(1.0, 0.99, 0.97) * glint * mix(0.35, 1.0, rod);

  vec3 color = (body + highlight) * coverage * u_exposure_scale;

  gl_FragColor = vec4(
    color,
    clamp(luminance(color) + 1.0 - luminance(transmittance), 0.0, 1.0)
  );
}
`;


export const quadVertexShader = `
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}
`;

export const copyFragmentShader = `${PRECISION}
varying vec2 v_uv;
uniform sampler2D u_texture;

void main() {
  gl_FragColor = texture2D(u_texture, v_uv);
}
`;

export const glassCompositeFragmentShader = `${PRECISION}${LUMINANCE}
varying vec2 v_uv;
uniform sampler2D u_backdrop;
uniform sampler2D u_backdrop_soft;
uniform sampler2D u_backdrop_deep;
uniform sampler2D u_accum;
uniform sampler2D u_reveal;
uniform float u_frost_ramp;

void main() {
  vec4 accum = texture2D(u_accum, v_uv);
  vec3 reveal = texture2D(u_reveal, v_uv).rgb;

  float coverage = clamp(1.0 - luminance(reveal), 0.0, 1.0);
  vec3 glass = accum.rgb / max(accum.a, 1e-4);

  float crossed = -log(max(luminance(reveal), 1e-3)) * u_frost_ramp;

  vec4 sharp = texture2D(u_backdrop, v_uv);
  vec4 soft = texture2D(u_backdrop_soft, v_uv);
  vec4 deep = texture2D(u_backdrop_deep, v_uv);

  vec4 behind = mix(
    mix(sharp, soft, clamp(crossed, 0.0, 1.0)),
    deep,
    clamp(crossed - 1.0, 0.0, 1.0)
  );

  gl_FragColor = vec4(
    behind.rgb * reveal + glass * coverage,
    clamp(behind.a * luminance(reveal) + coverage, 0.0, 1.0)
  );
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
  vec4 scene = texture2D(u_scene, v_uv);
  vec3 color = scene.rgb;
  color += texture2D(u_bloom, v_uv).rgb * u_bloom_strength;
  color *= u_inverse_exposure_scale * u_exposure;

  color = acesFilmic(color);
  color = mix(vec3(luminance(color)), color, u_saturation);
  color = linearToSrgb(clamp(color, 0.0, 1.0));

  float alpha = clamp(max(scene.a, luminance(color)), 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;
