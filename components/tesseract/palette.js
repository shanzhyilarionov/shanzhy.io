/**
 * Colour authoring and the sRGB <-> linear boundary.
 *
 * Everything the shaders see is linear light. The only place sRGB numbers
 * survive is the authored palette below and the final encode in the composite
 * shader.
 */

export function srgbToLinear(channel) {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

export function toLinear(color) {
  return color.map(srgbToLinear);
}

/**
 * Authored in sRGB. These are the same three primaries the original used —
 * a deep red, an ultramarine blue and a viridian green.
 */
const AUTHORED = {
  red: [0.82, 0.008, 0.018],
  blue: [0.0, 0.09, 0.74],
  green: [0.0, 0.56, 0.12],
  /* Neutral structural glass: a cold, nearly colourless pane. */
  structural: [0.072, 0.092, 0.125],
};

export const PRIMARIES = {
  red: toLinear(AUTHORED.red),
  blue: toLinear(AUTHORED.blue),
  green: toLinear(AUTHORED.green),
  structural: toLinear(AUTHORED.structural),
};

function mixColor(first, second, amount) {
  return [
    first[0] + (second[0] - first[0]) * amount,
    first[1] + (second[1] - first[1]) * amount,
    first[2] + (second[2] - first[2]) * amount,
  ];
}

/**
 * Tints for the two "corner" cells.
 *
 * Cell 0 is the cool family (green folded into blue, so it reads as teal
 * rather than as a hard primary green); cell 1 is the warm family. The two
 * are complementary, which is what gives the object its warm/cool split.
 */
const CELL_TINTS = [
  [
    mixColor(PRIMARIES.green, PRIMARIES.blue, 0.35),
    mixColor(PRIMARIES.blue, PRIMARIES.green, 0.18),
    mixColor(PRIMARIES.green, PRIMARIES.blue, 0.62),
    PRIMARIES.blue,
    mixColor(PRIMARIES.green, PRIMARIES.blue, 0.2),
    mixColor(PRIMARIES.blue, PRIMARIES.green, 0.42),
  ],
  [
    PRIMARIES.red,
    mixColor(PRIMARIES.red, PRIMARIES.blue, 0.34),
    mixColor(PRIMARIES.red, PRIMARIES.blue, 0.12),
    mixColor(PRIMARIES.red, PRIMARIES.blue, 0.5),
    PRIMARIES.red,
    mixColor(PRIMARIES.red, PRIMARIES.blue, 0.26),
  ],
];

/** The tint of a face, given which cell it belongs to and its orientation. */
export function faceTint(cellLayer, orientationIndex) {
  if (cellLayer < 0) return PRIMARIES.structural;
  const family = CELL_TINTS[cellLayer % CELL_TINTS.length];
  return family[orientationIndex % family.length];
}

/**
 * Dispersion sample colours, in wavelength order.
 *
 * A prism separates by wavelength, so the offsets and the colours must agree:
 * blue refracts most, red least. Ordering these by geometry rather than by
 * edge index is what makes the fringe read as dispersion instead of noise.
 */
export const DISPERSION = [
  { color: PRIMARIES.red, key: "red" },
  { color: PRIMARIES.green, key: "green" },
  { color: PRIMARIES.blue, key: "blue" },
];
