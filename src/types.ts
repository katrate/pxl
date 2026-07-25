import { GradientMode } from "./gradient";

export type Orientation = "horizontal" | "vertical";
export type BreakLines = "horizontal" | "vertical";

export interface BorderSpec {
  mode: "px" | "fill";
  color: string; // resolved hex
  size: number;  // border thickness in pixels (default 1)
}

export interface BreakSpec {
  fill: number;   // how many to fill before breaking
  space: number;  // how many to skip for the break
  lines?: BreakLines; // direction of break lines (for rect/cube/tng)
}

export interface InitCanvasCmd {
  kind: "init_canvas";
  width: number;
  height: number;
  line: number;
}

export interface SetPenCmd {
  kind: "set_pen";
  color: string; // resolved hex
  line: number;
}

export interface SetEraserCmd {
  kind: "set_eraser";
  line: number;
}

export interface SetPenGradientCmd {
  kind: "set_pen_gradient";
  name: string;
  line: number;
}

export interface CreateGradientCmd {
  kind: "create_gradient";
  name: string;
  start: string; // resolved hex
  end: string; // resolved hex
  mode: GradientMode;
  line: number;
}

export interface FillDiagonalCmd {
  kind: "fill_diagonal";
  start: number;
  end: number;
  border: BorderSpec | null;
  break: BreakSpec | null;
  line: number;
}

export interface FillRangeCmd {
  kind: "fill_range";
  start: number;
  length: number;
  orientation: Orientation;
  border: BorderSpec | null;
  break: BreakSpec | null;
  line: number;
}

export interface FillPixelCmd {
  kind: "fill_pixel";
  pixels: number[];
  border: BorderSpec | null;
  break: BreakSpec | null;
  line: number;
}

export interface FillRectCmd {
  kind: "fill_rect";
  start: number;
  len: number;
  breadth: number;
  border: BorderSpec | null;
  break: BreakSpec | null;
  line: number;
}

export interface FillCubeCmd {
  kind: "fill_cube";
  start: number;
  side: number;
  border: BorderSpec | null;
  break: BreakSpec | null;
  line: number;
}

export interface FillCircleCmd {
  kind: "fill_circle";
  pixel: number;
  radius: number;
  border: BorderSpec | null;
  break: BreakSpec | null;
  line: number;
}

export type TriangleDir = "top" | "bottom";
export type TriangleMode = "normal" | "rightangel";

export interface FillTriangleCmd {
  kind: "fill_triangle";
  baseStart: number;
  baseEnd: number;
  altitude: number;
  direction: TriangleDir;
  mode: TriangleMode;
  border: BorderSpec | null;
  break: BreakSpec | null;
  line: number;
}

// ---- Flow control commands ----

export interface SetVarCmd {
  kind: "set_var";
  name: string;
  rawExpr: string; // evaluated at runtime
  line: number;
}

export interface RepeatCmd {
  kind: "repeat";
  countRaw: string;
  bodyLines: string[];
  line: number;
}

export interface ForCmd {
  kind: "for";
  varName: string;
  rawStart: string;
  rawEnd: string;
  bodyLines: string[];
  line: number;
}

export interface IfElseCmd {
  kind: "if_else";
  chain: Array<{ cond: string; bodyLines: string[] }>;
  elseBodyLines: string[] | null;
  line: number;
}

export type Command =
  | InitCanvasCmd
  | SetPenCmd
  | SetEraserCmd
  | SetPenGradientCmd
  | CreateGradientCmd
  | FillPixelCmd
  | FillDiagonalCmd
  | FillRangeCmd
  | FillRectCmd
  | FillCubeCmd
  | FillCircleCmd
  | FillTriangleCmd
  | SetVarCmd
  | RepeatCmd
  | ForCmd
  | IfElseCmd;

export class PxlError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`Line ${line}: ${message}`);
    this.line = line;
  }
}

// RGBA pixel, null = unset/transparent
export type Pixel = string | null;
