import { PxlError } from "./types";
import { lerpColor } from "./colors";

export type GradientMode =
  | { type: "linear"; axis: "vertical" | "horizontal" }
  | { type: "radial" }
  | { type: "freeform" };

export interface GradientDef {
  name: string;
  startColor: string; // resolved hex
  endColor: string; // resolved hex
  mode: GradientMode;
}

export interface BBox {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

const RE_LINEAR = /^(?:linear|liner)\s*:\s*(vertical|horizontal|horizonlat|horizonatal)$/i;

export function parseMode(raw: string, line: number): GradientMode {
  const val = raw.trim().toLowerCase();

  const m = val.match(RE_LINEAR);
  if (m) {
    const axis = m[1].startsWith("v") ? "vertical" : "horizontal";
    return { type: "linear", axis };
  }
  if (val === "radial" || val === "radical") return { type: "radial" };
  if (val === "freeform") return { type: "freeform" };

  throw new PxlError(
    `invalid gradient mode "${raw.trim()}" (expected linear:vertical, linear:horizontal, radial, or freeform)`,
    line
  );
}

export function bboxOf(coords: { row: number; col: number }[]): BBox {
  let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;
  for (const { row, col } of coords) {
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
  }
  return { minRow, maxRow, minCol, maxCol };
}

function gradientT(mode: GradientMode, row: number, col: number, bbox: BBox): number {
  const { minRow, maxRow, minCol, maxCol } = bbox;
  switch (mode.type) {
    case "linear": {
      if (mode.axis === "vertical") {
        const span = maxRow - minRow;
        return span === 0 ? 0.5 : (row - minRow) / span;
      } else {
        const span = maxCol - minCol;
        return span === 0 ? 0.5 : (col - minCol) / span;
      }
    }
    case "radial": {
      const cr = (minRow + maxRow) / 2;
      const cc = (minCol + maxCol) / 2;
      const maxDist = Math.max(
        Math.hypot(minRow - cr, minCol - cc),
        Math.hypot(minRow - cr, maxCol - cc),
        Math.hypot(maxRow - cr, minCol - cc),
        Math.hypot(maxRow - cr, maxCol - cc)
      );
      const dist = Math.hypot(row - cr, col - cc);
      return maxDist === 0 ? 0.5 : Math.min(1, dist / maxDist);
    }
    case "freeform": {
      const span = maxRow - minRow + (maxCol - minCol);
      return span === 0 ? 0.5 : (row - minRow + (col - minCol)) / span;
    }
  }
}

export function gradientColorAt(def: GradientDef, row: number, col: number, bbox: BBox): string {
  const t = gradientT(def.mode, row, col, bbox);
  return lerpColor(def.startColor, def.endColor, t);
}
