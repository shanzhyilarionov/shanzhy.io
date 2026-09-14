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
    /* Fixed 4D orientation, independent of the pointer. */
    biasXY: 0.34,
    biasZW: -0.27,
  },

  camera: {
    position: [0, 0, 5],
    /* Static framing rotations applied after the 4D -> 3D projection. */
    tiltX: 0.4,
    tiltY: -0.5,
    rollZ: 0.1,
    /* Small view rotations in radians, applied after the static framing. */
    pointerStrengthDesktop: 0.4,
    pointerStrengthMobile: 0.5,
    /* Exponential smoothing rate for the pointer, in 1/seconds. */
    pointerResponse: 7.5,
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
    sheen: 1.0,
    fresnelRim: 2.6,
    /* A second, far broader lobe over the same half-vector. The tight one
       above reads as a glint on a polished edge; this one is the soft white
       patch that slides across a pane as it turns, and because the view
       vector is evaluated per pixel it moves with position as well as angle. */
    sweepExponent: 10,
    sweep: 0.12,
    /* Slab thickness in object units, before the 1/|N.V| path stretch. */
    thickness: 0.34,
    /* Extinction density multiplier for the tinted cells. Higher = the pane
       hides more of what is behind it, and its own colour reads more solid. */
    tintedDensity: 5.0,
    /* ... and for the neutral structural glass, which stays deliberately
       clear: it has almost no colour of its own, so making it opaque would
       only punch black holes through the object. */
    structuralDensity: 0.5,
    /* How much of the absorbed light comes back out as in-scattering. Raised
       alongside the density: a denser pane absorbs more, so it needs to give
       more back to stay as bright. */
    scatterTinted: 12.0,
    scatterStructural: 0.08,
    /* How much light on the viewer's side also lights the pane. A pane that
       scatters rather than merely transmits is lit from both faces, so this
       is far higher than it was when the body colour rode on transmission. */
    transmissionWrap: 0.7,
    /* Deeper faces have more glass to escape through. */
    depthScatterFloor: 0.34,
    depthScatterCurve: 1.5,
    /* Aerial perspective: how far rear faces desaturate towards grey. */
    aerialSaturationFloor: 0.9,
    /* The bevel where a pane meets its neighbour: how far in from the
       boundary the glass starts turning the corner, in UV units, and how far
       the normal swings by the time it reaches the join. This is what makes
       the edges appear at all — they are not drawn, they are what two panes
       meeting look like. */
    bevelWidth: 0.09,
    bevel: 0.85,
    /* Order-independent resolve: how much a pane's contribution is weighted
       by how near it is. A floor of 0 would let the nearest pane win
       outright; leaving a little in lets the ones behind tint it, which is
       what makes a stack of panes read as depth rather than as a decal. */
    weightFloor: 0.04,
    weightCurve: 4.0,
    /* Frosted glass. The panes are drawn at 1 / softDownscale of the frame
       and blurred by this many buffer pixels; the edges and highlights are
       drawn afterwards at full size, so they stay sharp against it. */
    softDownscale: 2,
    softness: 2.6,
    /* Frosting: how far the glass scatters what is behind it, in buffer
       pixels. `frost` is roughly one pane's worth and `frostDeep` is where a
       thick stack lands; `frostRamp` scales the accumulated optical depth
       that blends between them, so a single pane stays nearly readable and
       several stacked ones do not. */
    frost: 1.5,
    frostDeep: 5.0,
    frostRamp: 0.5,
  },

  edges: {
    /* Wide enough to read as a drawn glass rod rather than a lit wire. */
    baseWidth: 5.0,
    minWidth: 3.4,
    maxWidth: 9.0,
    /* The bright line down the rod's axis. Kept well below the old value:
       a rod that clips to white everywhere stops looking like glass. */
    coreIntensity: 0.55,
    /* How much of a rod's translucent interior shows. Lower = emptier, more
       glassy — the interior is where you look straight through. */
    bodyGain: 0.3,
    /* ... and how hard the two flanks light up against it. Above 1 so they
       overshoot the interior and read as drawn lines rather than a gradient. */
    flankGain: 1.0,
    /* Lateral offsets, in pixels, of the dispersed copies. Blue bends most,
       which is the ordering of normal dispersion in a real prism. */
    dispersionOffsets: { red: 0.22, green: 0.62, blue: 1.0 },
    dispersionSpread: 2.2,
    dispersionIntensity: 0.9,
    /* The travelling white highlight on each rod: how tight the specular
       lobe is (higher = a shorter, harder bright segment) and how bright. */
    glintExponent: 34,
    glintIntensity: 0.9,
    /* Beer-Lambert density of a rod, over the chord of its circular section.
       This is what lets an edge block: without it a rod could only add light,
       and read as more transparent than the panes it joins. */
    density: 2.6,
    /* The rod's radius in the same object units as the panes' thickness, so
       the two absorb on a comparable scale. */
    radius: 0.09,
    /* How far towards the eye a rod's depth is nudged before it is tested
       against the panes. A rod lies exactly on the boundary of the panes it
       joins, so without a nudge every visible edge z-fights with its own
       glass. In normalised depth units. */
    depthBias: 0.004,
    /* Depth response: how much rear edges dim relative to front ones. */
    depthFloor: 0.24,
    depthCurve: 1.8,
  },

  /* Vertices take their size, brightness and colour from the rods meeting
     there; these two only scale what they inherit. */
  vertices: {
    radiusScale: 1.15,
    intensity: 1.0,
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
    saturation: 1.6,
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
