import { Pixel, PxlError, Orientation, TriangleDir, TriangleMode } from "./types";
import { GradientDef, bboxOf, gradientColorAt } from "./gradient";

export class Grid {
  readonly width: number;
  readonly height: number;
  private pixels: Pixel[]; // 0-indexed internally, size width*height

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Array(width * height).fill(null);
  }

  get totalPixels(): number {
    return this.width * this.height;
  }

  // pixel numbers are 1-indexed, row-major
  private toIndex(pixelNum: number): number {
    return pixelNum - 1;
  }

  private assertInBounds(pixelNum: number, line: number, context: string): void {
    if (!Number.isInteger(pixelNum) || pixelNum < 1 || pixelNum > this.totalPixels) {
      throw new PxlError(
        `${context}: pixel ${pixelNum} is out of bounds (canvas has ${this.totalPixels} pixels, 1-${this.totalPixels})`,
        line
      );
    }
  }

  pixelToRowCol(pixelNum: number): { row: number; col: number } {
    const idx = this.toIndex(pixelNum);
    return { row: Math.floor(idx / this.width), col: idx % this.width };
  }

  rowColToPixel(row: number, col: number): number {
    return row * this.width + col + 1;
  }

  inBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.height && col >= 0 && col < this.width;
  }

  // ---- shape -> pixel number enumeration (no coloring) ----

  validatePixelList(pixelNums: number[], line: number): number[] {
    for (const p of pixelNums) this.assertInBounds(p, line, "fill px");
    return pixelNums;
  }

  rangePixelNums(start: number, length: number, orientation: Orientation, line: number): number[] {
    this.assertInBounds(start, line, "range start");
    if (length <= 0) throw new PxlError(`range length must be positive, got ${length}`, line);

    const result: number[] = [];
    if (orientation === "horizontal") {
      const end = start + length - 1;
      this.assertInBounds(end, line, "range end");
      for (let p = start; p <= end; p++) result.push(p);
    } else {
      const { row, col } = this.pixelToRowCol(start);
      for (let k = 0; k < length; k++) {
        const r = row + k;
        if (!this.inBounds(r, col)) {
          throw new PxlError(`vertical range runs past canvas bottom (row ${r + 1} of ${this.height})`, line);
        }
        result.push(this.rowColToPixel(r, col));
      }
    }
    return result;
  }

  rectPixelNums(start: number, len: number, breadth: number, line: number): number[] {
    this.assertInBounds(start, line, "rect start");
    if (len <= 0 || breadth <= 0) {
      throw new PxlError(`rect len/breadth must be positive, got (${len},${breadth})`, line);
    }
    const { row, col } = this.pixelToRowCol(start);
    const result: number[] = [];
    for (let r = row; r < row + breadth; r++) {
      for (let c = col; c < col + len; c++) {
        if (!this.inBounds(r, c)) {
          throw new PxlError(`rect extends past canvas edge at row ${r + 1}, col ${c + 1}`, line);
        }
        result.push(this.rowColToPixel(r, c));
      }
    }
    return result;
  }

  cubePixelNums(start: number, side: number, line: number): number[] {
    return this.rectPixelNums(start, side, side, line);
  }

  circlePixelNums(centerPixel: number, radius: number, line: number): number[] {
    this.assertInBounds(centerPixel, line, "circle center");
    if (radius <= 0) throw new PxlError(`circle radius must be positive, got ${radius}`, line);
    const { row: cr, col: cc } = this.pixelToRowCol(centerPixel);

    const result: number[] = [];
    for (let r = cr - radius; r <= cr + radius; r++) {
      for (let c = cc - radius; c <= cc + radius; c++) {
        if (!this.inBounds(r, c)) continue; // circle silently clips at canvas edge
        const dx = c - cc;
        const dy = r - cr;
        if (dx * dx + dy * dy <= radius * radius) {
          result.push(this.rowColToPixel(r, c));
        }
      }
    }
    return result;
  }

  trianglePixelNums(
    baseStart: number,
    baseEnd: number,
    altitude: number,
    direction: TriangleDir,
    mode: TriangleMode,
    line: number
  ): number[] {
    this.assertInBounds(baseStart, line, "tng base_start");
    this.assertInBounds(baseEnd, line, "tng base_end");
    if (altitude <= 0) throw new PxlError(`triangle altitude must be positive, got ${altitude}`, line);

    const { row: r1, col: c1 } = this.pixelToRowCol(baseStart);
    const { row: r2, col: c2 } = this.pixelToRowCol(baseEnd);

    let ax: number, ay: number, bx: number, by: number, cx: number, cy: number;

    if (r1 === r2) {
      // --- Horizontal base (top/bottom facing) ---
      const baseRow = r1;
      const colStart = Math.min(c1, c2);
      const colEnd = Math.max(c1, c2);

      if (mode === "normal") {
        // Isosceles: apex centered above/below base
        const midCol = (colStart + colEnd) / 2;
        const apexRow = direction === "bottom" ? baseRow + altitude : baseRow - altitude;
        ax = colStart; ay = baseRow;
        bx = colEnd;   by = baseRow;
        cx = midCol;   cy = apexRow;
      } else {
        // Right-angle: right angle at baseStart, altitude perpendicular
        const rightAngleCol = c1; // original base_start col (before min/max sort)
        const otherCol = c2;
        const altRow = direction === "bottom" ? baseRow + altitude : baseRow - altitude;
        ax = rightAngleCol; ay = baseRow;  // right angle vertex
        bx = otherCol;      by = baseRow;  // other base endpoint
        cx = rightAngleCol; cy = altRow;   // altitude tip
      }
    } else if (c1 === c2) {
      // --- Vertical base (left/right facing) ---
      const baseCol = c1;
      const rowStart = Math.min(r1, r2);
      const rowEnd = Math.max(r1, r2);

      if (mode === "normal") {
        // Isosceles: apex centered left/right of base
        const midRow = (rowStart + rowEnd) / 2;
        const apexCol = direction === "bottom" ? baseCol + altitude : baseCol - altitude;
        ax = baseCol; ay = rowStart;
        bx = baseCol; by = rowEnd;
        cx = apexCol; cy = midRow;
      } else {
        // Right-angle: right angle at baseStart, altitude perpendicular
        const rightAngleRow = r1; // original base_start row
        const otherRow = r2;
        const altCol = direction === "bottom" ? baseCol + altitude : baseCol - altitude;
        ax = baseCol;        ay = rightAngleRow;  // right angle vertex
        bx = baseCol;        by = otherRow;       // other base endpoint
        cx = altCol;         cy = rightAngleRow;  // altitude tip
      }
    } else {
      throw new PxlError(
        `tng base pixels ${baseStart} and ${baseEnd} must share the same row (horizontal base) or same column (vertical base)`,
        line
      );
    }

    // Determine bounding box (clamped to canvas)
    const minRow = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxRow = Math.min(this.height - 1, Math.ceil(Math.max(ay, by, cy)));
    const minCol = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxCol = Math.min(this.width - 1, Math.ceil(Math.max(ax, bx, cx)));

    if (minRow > maxRow || minCol > maxCol) {
      throw new PxlError("triangle extends out of canvas bounds", line);
    }

    const result: number[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (isInsideTriangle(col, row, ax, ay, bx, by, cx, cy)) {
          result.push(this.rowColToPixel(row, col));
        }
      }
    }
    return result;
  }

  diagonalPixelNums(start: number, end: number, line: number): number[] {
    this.assertInBounds(start, line, "diagonal start");
    this.assertInBounds(end, line, "diagonal end");
    const { row: r1, col: c1 } = this.pixelToRowCol(start);
    const { row: r2, col: c2 } = this.pixelToRowCol(end);
    const rowDiff = r2 - r1;
    const colDiff = c2 - c1;

    if (Math.abs(rowDiff) !== Math.abs(colDiff)) {
      throw new PxlError(
        `dig(${start},${end}) is not a straight diagonal (start and end must differ equally in row and column)`,
        line
      );
    }

    const steps = Math.abs(rowDiff);
    const rowStep = rowDiff === 0 ? 0 : Math.sign(rowDiff);
    const colStep = colDiff === 0 ? 0 : Math.sign(colDiff);

    const result: number[] = [];
    for (let k = 0; k <= steps; k++) {
      result.push(this.rowColToPixel(r1 + k * rowStep, c1 + k * colStep));
    }
    return result;
  }

  // ---- painting ----

  /** Paint a flat color (or null to erase) over the given pixels. */
  paint(pixelNums: number[], color: string | null): void {
    for (const p of pixelNums) {
      this.pixels[this.toIndex(p)] = color;
    }
  }

  /** Paint a gradient over the given pixels, blended across their bounding box. */
  paintGradient(pixelNums: number[], def: GradientDef): void {
    if (pixelNums.length === 0) return;
    const coords = pixelNums.map((p) => this.pixelToRowCol(p));
    const bbox = bboxOf(coords);
    for (let idx = 0; idx < pixelNums.length; idx++) {
      const { row, col } = coords[idx];
      const color = gradientColorAt(def, row, col, bbox);
      this.pixels[this.toIndex(pixelNums[idx])] = color;
    }
  }

  // ---- convenience wrappers (solid fill in one call) ----

  fillTriangle(
    baseStart: number,
    baseEnd: number,
    altitude: number,
    direction: TriangleDir,
    mode: TriangleMode,
    color: string | null,
    line: number
  ): void {
    this.paint(this.trianglePixelNums(baseStart, baseEnd, altitude, direction, mode, line), color);
  }

  fillRange(start: number, length: number, orientation: Orientation, color: string | null, line: number): void {
    this.paint(this.rangePixelNums(start, length, orientation, line), color);
  }

  fillRect(start: number, len: number, breadth: number, color: string | null, line: number): void {
    this.paint(this.rectPixelNums(start, len, breadth, line), color);
  }

  fillCube(start: number, side: number, color: string | null, line: number): void {
    this.paint(this.cubePixelNums(start, side, line), color);
  }

  fillCircle(centerPixel: number, radius: number, color: string | null, line: number): void {
    this.paint(this.circlePixelNums(centerPixel, radius, line), color);
  }

  fillPixels(pixelNums: number[], color: string | null, line: number): void {
    this.paint(this.validatePixelList(pixelNums, line), color);
  }

  // ---- export ----

  toArray(): Pixel[] {
    return [...this.pixels];
  }

  get(pixelNum: number): Pixel {
    return this.pixels[this.toIndex(pixelNum)];
  }
}

/**
 * Point-in-triangle test using cross-product (same-side) method.
 * Returns true if (px,py) is inside or on the edge of triangle (ax,ay)-(bx,by)-(cx,cy).
 */
function isInsideTriangle(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): boolean {
  const cross = (x1: number, y1: number, x2: number, y2: number) => x1 * y2 - y1 * x2;

  const d1 = cross(bx - ax, by - ay, px - ax, py - ay);
  const d2 = cross(cx - bx, cy - by, px - bx, py - by);
  const d3 = cross(ax - cx, ay - cy, px - cx, py - cy);

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

  return !(hasNeg && hasPos);
}
