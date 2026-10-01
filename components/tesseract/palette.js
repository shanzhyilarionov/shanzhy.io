export function srgbToLinear(channel) {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

export function toLinear(color) {
  return color.map(srgbToLinear);
}

const AUTHORED = {
  red: [0.38, 0.003, 0.008],
  blue: [0.0, 0.035, 0.34],
  green: [0.0, 0.25, 0.05],
  structural: [0.05, 0.065, 0.09],
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

export function faceTint(cellLayer, orientationIndex) {
  if (cellLayer < 0) return PRIMARIES.structural;
  const family = CELL_TINTS[cellLayer % CELL_TINTS.length];
  return family[orientationIndex % family.length];
}

export const DISPERSION = [
  { color: PRIMARIES.red, key: "red" },
  { color: PRIMARIES.green, key: "green" },
  { color: PRIMARIES.blue, key: "blue" },
];
