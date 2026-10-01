export const LOOK = {
  motion: {
    speedXW: 0.43,
    speedYZ: 0.19,
    biasXY: 0.34,
    biasZW: -0.27,
  },

  camera: {
    position: [0, 0, 5],
    tiltX: 0.4,
    tiltY: -0.5,
    rollZ: 0.1,
    pointerStrengthDesktop: 0.4,
    pointerStrengthMobile: 0.5,
    pointerResponse: 7.5,
  },

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
    ior: 1.52,
    specularExponent: 68,
    sheen: 1.0,
    fresnelRim: 2.6,
    sweepExponent: 10,
    sweep: 0.12,
    thickness: 0.34,
    tintedDensity: 5.0,
    structuralDensity: 0.5,
    scatterTinted: 12.0,
    scatterStructural: 0.08,
    transmissionWrap: 0.7,
    depthScatterFloor: 0.34,
    depthScatterCurve: 1.5,
    aerialSaturationFloor: 0.9,
    bevelWidth: 0.09,
    bevel: 0.85,
    weightFloor: 0.04,
    weightCurve: 4.0,
    softDownscale: 2,
    softness: 2.6,
    frost: 1.5,
    frostDeep: 5.0,
    frostRamp: 0.5,
  },

  edges: {
    baseWidth: 5.0,
    minWidth: 3.4,
    maxWidth: 9.0,
    coreIntensity: 0.55,
    bodyGain: 0.3,
    flankGain: 1.0,
    dispersionOffsets: { red: 0.22, green: 0.62, blue: 1.0 },
    dispersionSpread: 2.2,
    dispersionIntensity: 0.9,
    glintExponent: 34,
    glintIntensity: 0.9,
    density: 2.6,
    radius: 0.09,
    depthBias: 0.004,
    depthFloor: 0.24,
    depthCurve: 1.8,
  },

  vertices: {
    radiusScale: 1.15,
    intensity: 1.0,
  },

  bloom: {
    threshold: 0.75,
    knee: 0.4,
    strength: 0.6,
    sigma: 3.4,
    downscale: 3,
  },

  tone: {
    exposure: 1.24,
    saturation: 1.6,
    lowPrecisionScale: 0.32,
  },

  fourD: {
    weight: 0.26,
    direction: [0.35, 0.2, 0.3, 0.86],
    ambient: 0.55,
  },

  quality: {
    bloomMinWidth: 640,
    maxPixelRatio: 1.75,
  },

  layout: {
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

export const GLASS_F0 = ((LOOK.glass.ior - 1) / (LOOK.glass.ior + 1)) ** 2;
