/**
 * GLSL sources.
 *
 * Every shader below is a template literal, so a backtick inside GLSL — even
 * inside a comment — ends the string early and the file stops parsing. Write
 * identifiers in comments bare.
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

  // A real depth, so the rods can be tested against the panes per pixel.
  // Nearer is larger z here and smaller z in clip space, hence the negation.
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

  // The pane is not a sheet with nothing at its rim: where it meets its
  // neighbour the glass turns a corner. Modelling that corner as a bevel —
  // bending the normal outwards over the last fraction of the pane — is what
  // makes an edge a consequence of the two faces that meet there rather than
  // something drawn on afterwards. Everything downstream follows from it: the
  // optical path lengthens because the glass is no longer face-on, Fresnel
  // climbs, and the specular lobe catches along the join.
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

  // How near this pane is: 0 at the back of the object, 1 at the front.
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

    // A pane that scatters is lit from both of its faces, not only from
    // behind, so the near side counts too.
    float behind = max(-alignment, 0.0);
    float infront = max(alignment, 0.0);
    float carried = behind + infront * u_transmission_wrap;

    vec3 half_vector = normalize(lightDirection + view);
    float alignedHalf = max(dot(normal, half_vector), 0.0);

    // Two lobes over the same half-vector: a tight glint, and a broad sweep
    // that only partly follows Fresnel so it is visible across the pane and
    // not just at its edges. Both are white — they are surface reflections,
    // so they carry the light's colour rather than the glass's.
    float glint = pow(alignedHalf, u_specular_exponent);
    float sweep = pow(alignedHalf, u_sweep_exponent);

    through += u_light_color[i] * attenuation * carried;
    sheen +=
      u_light_color[i] *
      attenuation *
      (glint * fresnel * u_sheen + sweep * mix(0.3, 1.0, fresnel) * u_sweep);
  }

  if (u_mode < 1.5) {
    // The pane's body colour.
    //
    // Not T * through, which is the light that passed straight through and
    // would vanish exactly when the glass gets dense enough to be opaque.
    // The light that did NOT get through was absorbed or scattered, and the
    // part that scatters back out carries the glass's own colour — so the
    // brightness rides on 1 - T and the hue on the tint.
    vec3 body = v_tint * (1.0 - transmittance) * through * v_params.z;
    body = mix(vec3(luminance(body)), body, saturation) * depthGain;

    // Weight for the order-independent resolve. Every pane adds its colour
    // times this weight, and the resolve divides by the total — a weighted
    // average rather than a sum, so overlapping panes do not pile up to
    // white and the nearest one dominates.
    //
    // The weight varies continuously with depth, which is the whole point:
    // when two panes cross, their influence trades over smoothly. A sorted
    // painter's algorithm has to swap their draw order in a single frame
    // instead, and with opaque panes that is a visible jump.
    float alpha = clamp(1.0 - luminance(transmittance), 0.0, 1.0);
    float weight = alpha * mix(u_weight_floor, 1.0, pow(front, u_weight_curve));

    gl_FragColor = vec4(body * weight * u_exposure_scale, weight);
    return;
  }

  // Surface reflections. These sit on the glass rather than inside it, so
  // they are added to the frame directly instead of being averaged into the
  // body colour — and they stay sharp while the body is softened.
  vec3 grazing =
    vec3(1.0, 0.99, 0.98) * fresnel * u_fresnel_rim * length(through) * 0.18;
  vec3 highlight = sheen + grazing;
  highlight = mix(vec3(luminance(highlight)), highlight, saturation) * depthGain;
  highlight *= u_exposure_scale * v_params.w;

  gl_FragColor = vec4(highlight, luminance(highlight));
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

  // The rod's own depth, interpolated from its two ends, so the depth test
  // splits it where it actually passes behind a pane rather than sending the
  // whole rod to one side. The bias leans it towards the eye: a rod sits on
  // the boundary of the panes it joins, so without it every visible edge
  // would z-fight with the glass it belongs to.
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

  // A rod is glass, not a drawn line, so it absorbs what is behind it before
  // it adds anything of its own — the same two steps the panes take. The
  // chord of a circle is how much glass a ray crosses at this offset from the
  // axis: longest down the middle, nothing at the silhouette. Additive
  // blending alone can never darken, which is why an edge used to read as
  // more transparent than the faces meeting along it.
  //
  // u_radius is the rod's radius in the same units as the panes' thickness,
  // which is what keeps the two comparable: a rod is thinner than a pane, so
  // it should absorb a little less, not saturate to black. The tints are deep
  // in linear light, so without that scale any density at all is opaque.
  float chord = 2.0 * u_radius * sqrt(max(1.0 - across * across, 0.0));
  vec3 extinction = -log(clamp(v_tint, 0.0015, 0.995)) * u_density;
  vec3 transmittance = mix(vec3(1.0), exp(-extinction * chord), coverage);

  if (u_mode < 0.5) {
    gl_FragColor = vec4(transmittance, luminance(transmittance));
    return;
  }

  // Shade the capsule as the cross-section of a round glass rod rather than
  // as a flat stroke. Across its width the surface turns away from the eye,
  // so |u| = 1 at the silhouette and 0 down the axis; the rod's own Fresnel
  // then brightens both flanks and leaves the middle translucent, which is
  // what makes a wide edge read as glass instead of as a painted band.
  float cosNV = sqrt(max(1.0 - across * across, 0.0));

  // Softer than Schlick's fifth power on purpose. Near the silhouette of a
  // round rod two things grow at once: the Fresnel reflection, and the length
  // of glass the ray travels through. This single term stands in for both, so
  // the flanks brighten over a visible width instead of a one-pixel sliver.
  float flank = u_f0 + (1.0 - u_f0) * pow(1.0 - cosNV, 2.0);
  float rod = u_body_gain + flank * u_flank_gain;

  // A white glint that slides along the rod.
  //
  // v_glint carries T.H and a brightness for each of the two lights,
  // interpolated from the rod's ends. Kajiya-Kay for a cylinder responds as
  // sin of the angle between tangent and half-vector, so the highlight sits
  // wherever T.H passes through zero — and evaluating that here, per pixel,
  // is what lets it travel smoothly. Picking one position per rod on the CPU
  // cannot: the position has to jump when the crossing leaves one end of the
  // segment and comes back in at the other.
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

/** Straight texture copy, used to multiply one target into another. */
export const copyFragmentShader = `${PRECISION}
varying vec2 v_uv;
uniform sampler2D u_texture;

void main() {
  gl_FragColor = texture2D(u_texture, v_uv);
}
`;

/**
 * Lays the glass over everything drawn behind it.
 *
 * `u_accum` holds sum(colour * weight) and sum(weight); `u_reveal` holds the
 * product of every pane's transmittance. Dividing gives the weighted average
 * colour of the panes covering this pixel, and the reveal says how much of
 * the backdrop they hide between them. Both inputs are built with commutative
 * blending, so nothing here depends on the order the panes were drawn in.
 *
 * The backdrop arrives twice, sharp and blurred, and this pass chooses
 * between them by coverage. That is what frosted glass actually does: it does
 * not merely dim what is behind it, it scatters it, so a line seen through a
 * pane goes soft while the same line seen beside the pane stays sharp.
 *
 * Alpha carries coverage, not brightness. Deriving it from luminance — as the
 * final composite used to — lets a saturated pane read as half transparent
 * just because pure red is a dark colour, and the page shows through.
 */
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

  // How much glass the ray actually crossed. Beer-Lambert says the reveal is
  // exp(-sum of optical depths), so its log is that sum — one pane through
  // to several, as a continuous number rather than a count. Scattering
  // compounds with it, so the blur grows the same way: one pane is nearly
  // clear, a stack of them is not.
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
  vec4 scene = texture2D(u_scene, v_uv);
  vec3 color = scene.rgb;
  color += texture2D(u_bloom, v_uv).rgb * u_bloom_strength;
  color *= u_inverse_exposure_scale * u_exposure;

  color = acesFilmic(color);
  color = mix(vec3(luminance(color)), color, u_saturation);
  color = linearToSrgb(clamp(color, 0.0, 1.0));

  // Premultiplied output. Alpha comes from the coverage the passes actually
  // accumulated, not from how bright the result happens to be — a saturated
  // pane is a dark colour, and reading its opacity off its luminance is what
  // let the page show through solid glass. The luminance term stays only as
  // a floor, so bloom and thin bright lines still register.
  float alpha = clamp(max(scene.a, luminance(color)), 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;
