// Standard CSS3 named colors -> hex
export const NAMED_COLORS: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000",
  lime: "#00ff00", blue: "#0000ff", yellow: "#ffff00", cyan: "#00ffff",
  magenta: "#ff00ff", silver: "#c0c0c0", gray: "#808080", grey: "#808080",
  maroon: "#800000", olive: "#808000", purple: "#800080", teal: "#008080",
  navy: "#000080", orange: "#ffa500", pink: "#ffc0cb", brown: "#a52a2a",
  gold: "#ffd700", indigo: "#4b0082", violet: "#ee82ee", coral: "#ff7f50",
  salmon: "#fa8072", khaki: "#f0e68c", crimson: "#dc143c", chocolate: "#d2691e",
  turquoise: "#40e0d0", tan: "#d2b48c", plum: "#dda0dd", orchid: "#da70d6",
  skyblue: "#87ceeb", steelblue: "#4682b4", tomato: "#ff6347", beige: "#f5f5dc",
  ivory: "#fffff0", lavender: "#e6e6fa", darkred: "#8b0000", darkgreen: "#006400",
  darkblue: "#00008b", lightgray: "#d3d3d3", lightgrey: "#d3d3d3",
  lightblue: "#add8e6", lightgreen: "#90ee90", hotpink: "#ff69b4",
  transparent: "#00000000",
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function resolveColor(raw: string): string | null {
  const val = raw.trim().toLowerCase();
  if (HEX_RE.test(val)) return normalizeHex(val);
  if (val in NAMED_COLORS) return NAMED_COLORS[val];
  return null;
}

function normalizeHex(hex: string): string {
  if (hex.length === 4) {
    // #abc -> #aabbcc
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return hex;
}

export function hexToRgba(hex: string): [number, number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

export function rgbaToHex(rgba: [number, number, number, number]): string {
  const [r, g, b, a] = rgba;
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return a < 255 ? `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}` : `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function lerpColor(hexA: string, hexB: string, t: number): string {
  const clampedT = Math.max(0, Math.min(1, t));
  const [r1, g1, b1, a1] = hexToRgba(hexA);
  const [r2, g2, b2, a2] = hexToRgba(hexB);
  const lerp = (x: number, y: number) => x + (y - x) * clampedT;
  return rgbaToHex([lerp(r1, r2), lerp(g1, g2), lerp(b1, b2), lerp(a1, a2)]);
}
