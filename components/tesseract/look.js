/**
 * Every tunable number for the tesseract, in one place.
 *
 * Colours here are authored in sRGB (the numbers you would type into a design
 * tool). They are converted to linear light once, at module load, by
 * `palette.js` — all shading maths downstream happens in linear space.
 */

export const LOOK = {
  motion: {
    /* Two rotations in orthogonal planes: a genuine SO(4) double rotation. */
    speedXW: 0.43,
    speedYZ: 0.19,
    /* Pointer tilt, applied after the animation so it reads as a view tilt. */
    pointerBiasXY: 0.34,
    pointerBiasZW: -0.27,
    pointerStrengthDesktop: 0.62,
    pointerStrengthMobile: 0.82,
    /* Exponential smoothing rate for the pointer, in 1/seconds. */
    pointerResponse: 7.5,
  },

  camera: {
    position: [0, 0, 5],
    /* Static framing rotations applied after the 4D -> 3D projection. */
    tiltX: 0.4,
    tiltY: -0.5,
    rollZ: 0.1,
  },

  /* Point lights, positioned in the same 3D space as the projected object. */
  lights: [
    {
      position: [-3.8, -3.1, 4.6],
      color: [1, 0.97, 0.94],
      intensity: 11,
    },
    {
      position: [3.6, 2.8, -3.4],
      color: [0.9, 0.95, 1],
      intensity: 8,
    },
  ],

  glass: {
    /* Index of refraction of the notional glass; F0 = ((n-1)/(n+1))^2. */
    ior: 1.52,
    /* Blinn-Phong lobe. Higher = tighter, more polished highlight. */
    specularExponent: 68,
    /* Strength of the Blinn-Phong lobe and of the grazing-angle mirror. */
    sheen: 0.4,
    fresnelRim: 1.0,
    /* Slab thickness in object units, before the 1/|N.V| path stretch. */
    thickness: 0.34,
    /* Extinction density multiplier for the tinted cells. */
    tintedDensity: 2.35,
    /* ... and for the neutral structural glass. */
    structuralDensity: 0.85,
    /* How much of the absorbed light comes back out as in-scattering. */
    scatterTinted: 2.2,
    scatterStructural: 0.05,
    /* Wrap-around term: glass lit from behind still glows. */
    transmissionWrap: 0.1,
    /* Deeper faces have more glass to escape through. */
    depthScatterFloor: 0.34,
    depthScatterCurve: 1.5,
    /* Aerial perspective: how far rear faces desaturate towards grey. */
    aerialSaturationFloor: 0.8,
    /* Softening of the face's own outline, in UV units. */
    rimWidth: 0.16,
    rimGain: 0.85,
  },

  edges: {
    baseWidth: 1.9,
    minWidth: 1.35,
    maxWidth: 3.4,
    coreIntensity: 3.2,
    /* Lateral offsets, in pixels, of the dispersed copies. Blue bends most,
       which is the ordering of normal dispersion in a real prism. */
    dispersionOffsets: { red: 0.22, green: 0.62, blue: 1.0 },
    dispersionSpread: 1.15,
    dispersionIntensity: 2.1,
    /* Depth response: how much rear edges dim relative to front ones. */
    depthFloor: 0.24,
    depthCurve: 1.8,
  },

  vertices: {
    radius: 2.4,
    intensity: 0.85,
  },

  bloom: {
    /* Luminance above which pixels start to bleed. */
    threshold: 0.75,
    knee: 0.4,
    strength: 0.6,
    sigma: 3.4,
    /* Bloom is computed at 1/N resolution. */
    downscale: 3,
  },

  tone: {
    exposure: 1.24,
    /* Extra chroma after tone mapping. 1 = untouched. */
    saturation: 1.38,
    /* Headroom when the platform cannot give us a half-float target. */
    lowPrecisionScale: 0.32,
  },

  /**
   * Optional 4D lighting term.
   *
   * Light does not travel through four dimensions, so there is no "correct"
   * answer here. What this does is well defined though: it takes each face's
   * 4D normal, rotates it with the object, dots it against a fixed 4D light
   * direction, and brightens faces that turn to face it. The result is that
   * the w-rotation reads as a change in illumination rather than only as a
   * change in shape. Set `weight` to 0 for pure 3D shading.
   */
  fourD: {
    weight: 0.26,
    direction: [0.35, 0.2, 0.3, 0.86],
    ambient: 0.55,
  },

  quality: {
    /* Below this width the bloom pass is skipped entirely. */
    bloomMinWidth: 640,
    maxPixelRatio: 1.75,
  },

  layout: {
    /* Preserved verbatim from the original: sizing and breakpoints. */
    baseScale: 0.105,
    plateauScale: 87,
    compactStart: 900,
    compactRange: 300,
    compactAmount: 0.17,
    narrowStart: 700,
    narrowRange: 200,
    narrowFloor: 50,
    mobileWidth: 768,
  },
};

/** Fresnel reflectance at normal incidence, derived from the IOR. */
export const GLASS_F0 = ((LOOK.glass.ior - 1) / (LOOK.glass.ior + 1)) ** 2;
