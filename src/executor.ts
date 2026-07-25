import { Command, PxlError, BorderSpec, BreakSpec } from "./types";
import { Grid } from "./grid";
import { GradientDef } from "./gradient";
import { parseProcessedLine, substituteVars, substituteNumVars, resolveMath } from "./parser";

export interface ExecResult {
  grid: Grid;
}

type Tool =
  | { kind: "color"; color: string }
  | { kind: "eraser" }
  | { kind: "gradient"; def: GradientDef };

// Regex patterns for detecting commands inside body lines
const RE_SET_LOCAL = /^set\s+([A-Za-z_]\w*)\s*=\s*(.+)$/i;
const RE_REPEAT = /^repeat\s+(.+):\s*$/i;
const RE_FOR = /^for\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s+to\s+(.+):\s*$/i;
const RE_IF = /^if\s+(.+):\s*$/i;
const RE_ELIF = /^else\s+if\s+(.+):\s*$/i;
const RE_ELSE = /^else:\s*$/i;

export function execute(commands: Command[], constants?: Map<string, string>): ExecResult {
  let grid: Grid | null = null;
  let tool: Tool | null = null;
  const gradients = new Map<string, GradientDef>();
  const gradientNames = new Set<string>();
  const runtimeVars = new Map<string, number>();

  // Pre-populate runtime vars with numeric let constants
  if (constants) {
    for (const [name, value] of constants) {
      const num = parseInt(value, 10);
      if (!isNaN(num)) runtimeVars.set(name, num);
    }
  }

  const ctx: ExecCtx = { grid, tool, gradients, gradientNames, runtimeVars, constants: constants || new Map() };

  for (const cmd of commands) {
    executeCommand(cmd, ctx);
  }

  if (!ctx.grid) {
    throw new PxlError("script must start with 'init canvas WxH'", 1);
  }

  return { grid: ctx.grid };
}

// ---- Context object passed through execution ----

interface ExecCtx {
  grid: Grid | null;
  tool: Tool | null;
  gradients: Map<string, GradientDef>;
  gradientNames: Set<string>;
  runtimeVars: Map<string, number>;
  constants: Map<string, string>;
}

// ---- Main command dispatcher ----

function executeCommand(cmd: Command, ctx: ExecCtx): void {
  switch (cmd.kind) {
    case "init_canvas":
      if (ctx.grid) throw new PxlError("canvas already initialized (only one 'init canvas' allowed)", cmd.line);
      ctx.grid = new Grid(cmd.width, cmd.height);
      break;

    case "create_gradient":
      ctx.gradients.set(cmd.name.toLowerCase(), {
        name: cmd.name,
        startColor: cmd.start,
        endColor: cmd.end,
        mode: cmd.mode,
      });
      ctx.gradientNames.add(cmd.name.toLowerCase());
      break;

    case "set_pen":
      ctx.tool = { kind: "color", color: cmd.color };
      break;

    case "set_eraser":
      ctx.tool = { kind: "eraser" };
      break;

    case "set_pen_gradient": {
      const def = ctx.gradients.get(cmd.name.toLowerCase());
      if (!def) throw new PxlError(`gradient "${cmd.name}" not defined before use`, cmd.line);
      ctx.tool = { kind: "gradient", def };
      break;
    }

    // ---- Runtime variable assignment ----
    case "set_var": {
      const val = evalNumericExpr(cmd.rawExpr, ctx.runtimeVars, ctx.constants, cmd.line);
      ctx.runtimeVars.set(cmd.name, val);
      break;
    }

    // ---- Repeat loop ----
    case "repeat": {
      const count = evalNumericExpr(cmd.countRaw, ctx.runtimeVars, ctx.constants, cmd.line);
      for (let iter = 0; iter < count; iter++) {
        executeBodyLines(cmd.bodyLines, ctx);
      }
      break;
    }

    // ---- For loop ----
    case "for": {
      const start = evalNumericExpr(cmd.rawStart, ctx.runtimeVars, ctx.constants, cmd.line);
      const end = evalNumericExpr(cmd.rawEnd, ctx.runtimeVars, ctx.constants, cmd.line);
      for (let i = start; i <= end; i++) {
        ctx.runtimeVars.set(cmd.varName, i);
        executeBodyLines(cmd.bodyLines, ctx);
      }
      break;
    }

    // ---- If-else chain ----
    case "if_else": {
      let matched = false;
      for (let idx = 0; idx < cmd.chain.length; idx++) {
        const { cond, bodyLines } = cmd.chain[idx];
        if (evalCondition(cond, ctx.runtimeVars, ctx.constants, cmd.line)) {
          executeBodyLines(bodyLines, ctx);
          matched = true;
          break;
        }
      }
      if (!matched && cmd.elseBodyLines) {
        executeBodyLines(cmd.elseBodyLines, ctx);
      }
      break;
    }

    // ---- Fill commands ----
    case "fill_pixel": {
      requireCanvas(ctx.grid, cmd.line);
      requireTool(ctx.tool, cmd.line);
      let nums = ctx.grid!.validatePixelList(cmd.pixels, cmd.line);
      if (cmd.break) nums = applyBreak(ctx.grid!, nums, cmd.break, "pixel");
      applyFill(ctx.grid!, ctx.tool!, nums);
      if (cmd.border) applyBorder(ctx.grid!, nums, cmd.border);
      break;
    }

    case "fill_diagonal": {
      requireCanvas(ctx.grid, cmd.line);
      requireTool(ctx.tool, cmd.line);
      let nums = ctx.grid!.diagonalPixelNums(cmd.start, cmd.end, cmd.line);
      if (cmd.break) nums = applyBreak(ctx.grid!, nums, cmd.break, "linear");
      applyFill(ctx.grid!, ctx.tool!, nums);
      if (cmd.border) applyBorder(ctx.grid!, nums, cmd.border);
      break;
    }

    case "fill_range": {
      requireCanvas(ctx.grid, cmd.line);
      requireTool(ctx.tool, cmd.line);
      let nums = ctx.grid!.rangePixelNums(cmd.start, cmd.length, cmd.orientation, cmd.line);
      if (cmd.break) nums = applyBreak(ctx.grid!, nums, cmd.break, "linear");
      applyFill(ctx.grid!, ctx.tool!, nums);
      if (cmd.border) applyBorder(ctx.grid!, nums, cmd.border);
      break;
    }

    case "fill_rect": {
      requireCanvas(ctx.grid, cmd.line);
      requireTool(ctx.tool, cmd.line);
      let nums = ctx.grid!.rectPixelNums(cmd.start, cmd.len, cmd.breadth, cmd.line);
      if (cmd.break) nums = applyBreak(ctx.grid!, nums, cmd.break, "grid");
      applyFill(ctx.grid!, ctx.tool!, nums);
      if (cmd.border) applyBorder(ctx.grid!, nums, cmd.border);
      break;
    }

    case "fill_cube": {
      requireCanvas(ctx.grid, cmd.line);
      requireTool(ctx.tool, cmd.line);
      let nums = ctx.grid!.cubePixelNums(cmd.start, cmd.side, cmd.line);
      if (cmd.break) nums = applyBreak(ctx.grid!, nums, cmd.break, "grid");
      applyFill(ctx.grid!, ctx.tool!, nums);
      if (cmd.border) applyBorder(ctx.grid!, nums, cmd.border);
      break;
    }

    case "fill_circle": {
      requireCanvas(ctx.grid, cmd.line);
      requireTool(ctx.tool, cmd.line);
      let nums = ctx.grid!.circlePixelNums(cmd.pixel, cmd.radius, cmd.line);
      if (cmd.break) nums = applyBreak(ctx.grid!, nums, cmd.break, "circle", cmd.pixel);
      applyFill(ctx.grid!, ctx.tool!, nums);
      if (cmd.border) applyBorder(ctx.grid!, nums, cmd.border);
      break;
    }

    case "fill_triangle": {
      requireCanvas(ctx.grid, cmd.line);
      requireTool(ctx.tool, cmd.line);
      let nums = ctx.grid!.trianglePixelNums(cmd.baseStart, cmd.baseEnd, cmd.altitude, cmd.direction, cmd.mode, cmd.line);
      if (cmd.break) nums = applyBreak(ctx.grid!, nums, cmd.break, "grid");
      applyFill(ctx.grid!, ctx.tool!, nums);
      if (cmd.border) applyBorder(ctx.grid!, nums, cmd.border);
      break;
    }
  }
}

// ---- Body line execution (for loops / ifs) ----
// Supports nested repeat/for/if by detecting block commands and reading ahead.

function executeBodyLines(bodyLines: string[], ctx: ExecCtx): void {
  let i = 0;
  while (i < bodyLines.length) {
    const rawLine = bodyLines[i];
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("##")) { i++; continue; }

    // Detect base indent of this line relative to the block
    const lineIndent = rawLine.length - rawLine.trimStart().length;    // Check for block commands BEFORE general substitution (protect var names)
    const setMatch = trimmed.match(RE_SET_LOCAL);
    if (setMatch) {
      const setName = setMatch[1];
      const expr = setMatch[2];
      let rawExpr = substituteVars(expr, ctx.constants);
      rawExpr = substituteNumVars(rawExpr, ctx.runtimeVars);
      const cmd = { kind: "set_var" as const, name: setName, rawExpr: rawExpr, line: 0 };
      executeCommand(cmd, ctx);
      i++;
      continue;
    }

    // For nested for/repeat/if: check the ORIGINAL trimmed line (before substitution)
    // to protect the variable name from being replaced by substituteNumVars
    const innerForMatch = trimmed.match(RE_FOR);
    if (innerForMatch) {
      const varName = innerForMatch[1];
      let rawStart = innerForMatch[2];
      let rawEnd = innerForMatch[3];
      rawStart = substituteVars(rawStart, ctx.constants);
      rawStart = substituteNumVars(rawStart, ctx.runtimeVars);
      rawEnd = substituteVars(rawEnd, ctx.constants);
      rawEnd = substituteNumVars(rawEnd, ctx.runtimeVars);
      const start = evalNumericExpr(rawStart, ctx.runtimeVars, ctx.constants, 0);
      const end = evalNumericExpr(rawEnd, ctx.runtimeVars, ctx.constants, 0);
      const { bodyLines: innerBody, nextIdx } = readInnerBlock(bodyLines, i + 1, lineIndent);
      for (let v = start; v <= end; v++) {
        ctx.runtimeVars.set(varName, v);
        executeBodyLines(innerBody, ctx);
      }
      i = nextIdx;
      continue;
    }

    const innerRepeatMatch = trimmed.match(RE_REPEAT);
    if (innerRepeatMatch) {
      let rawCount = substituteVars(innerRepeatMatch[1].trim(), ctx.constants);
      rawCount = substituteNumVars(rawCount, ctx.runtimeVars);
      const count = evalNumericExpr(rawCount, ctx.runtimeVars, ctx.constants, 0);
      const { bodyLines: innerBody, nextIdx } = readInnerBlock(bodyLines, i + 1, lineIndent);
      for (let iter = 0; iter < count; iter++) executeBodyLines(innerBody, ctx);
      i = nextIdx;
      continue;
    }

    const innerIfMatch = trimmed.match(RE_IF);
    if (innerIfMatch) {
      let cond = substituteVars(innerIfMatch[1].trim(), ctx.constants);
      cond = substituteNumVars(cond, ctx.runtimeVars);
      const { bodyLines: body, nextIdx: bodyEnd } = readInnerBlock(bodyLines, i + 1, lineIndent);
      const chain: Array<{ cond: string; bodyLines: string[] }> = [{ cond, bodyLines: body }];
      let elseBody: string[] | null = null;
      let peekIdx = bodyEnd;
      while (peekIdx < bodyLines.length) {
        const peekTrimmed = bodyLines[peekIdx].trim();
        const peekIndent = bodyLines[peekIdx].length - bodyLines[peekIdx].trimStart().length;
        if (peekIndent !== lineIndent) break;
        if (peekTrimmed === "") { peekIdx++; continue; }
        const elifMatch = peekTrimmed.match(RE_ELIF);
        if (elifMatch) {
          let elifCond = substituteVars(elifMatch[1].trim(), ctx.constants);
          elifCond = substituteNumVars(elifCond, ctx.runtimeVars);
          const { bodyLines: elifBody, nextIdx: elifEnd } = readInnerBlock(bodyLines, peekIdx + 1, lineIndent);
          chain.push({ cond: elifCond, bodyLines: elifBody });
          peekIdx = elifEnd;
          continue;
        }
        const elseMatch = peekTrimmed.match(RE_ELSE);
        if (elseMatch) {
          const { bodyLines: elseBodyBlock, nextIdx: elseEnd } = readInnerBlock(bodyLines, peekIdx + 1, lineIndent);
          elseBody = elseBodyBlock;
          peekIdx = elseEnd;
          break;
        }
        break;
      }
      let matched = false;
      for (let ci = 0; ci < chain.length; ci++) {
        if (evalCondition(chain[ci].cond, ctx.runtimeVars, ctx.constants, 0)) {
          executeBodyLines(chain[ci].bodyLines, ctx);
          matched = true;
          break;
        }
      }
      if (!matched && elseBody) executeBodyLines(elseBody, ctx);
      i = peekIdx;
      continue;
    }

    // General substitution for regular commands (fill, pen, eraser)
    let processed = substituteVars(trimmed, ctx.constants);
    processed = substituteNumVars(processed, ctx.runtimeVars);
    processed = resolveMath(processed);

    // Regular command — parse and execute
    const cmd = parseProcessedLine(processed, 0, ctx.gradientNames);
    executeCommand(cmd, ctx);
    i++;
  }
}

/**
 * Read inner block lines that have a deeper indent than `parentIndent`.
 * Returns the block lines (with parentIndent+1 stripped) and the next index.
 */
function readInnerBlock(
  lines: string[],
  startIdx: number,
  parentIndent: number
): { bodyLines: string[]; nextIdx: number } {
  const bodyLines: string[] = [];
  let j = startIdx;
  for (; j < lines.length; j++) {
    const trimmed = lines[j].trim();
    if (trimmed === "") break;
    const lineIndent = lines[j].length - lines[j].trimStart().length;
    if (lineIndent <= parentIndent) break;
    bodyLines.push(lines[j].slice(parentIndent + 1));
  }
  return { bodyLines, nextIdx: j };
}

// ---- Runtime expression evaluation ----

/**
 * Evaluate a numeric expression at runtime.
 * Substitutes both let constants and runtime variables, then evaluates the ENTIRE expression as one unit.
 */
function evalNumericExpr(
  expr: string,
  runtimeVars: Map<string, number>,
  constants: Map<string, string>,
  line: number
): number {
  let resolved = substituteVars(expr, constants);
  resolved = substituteNumVars(resolved, runtimeVars);
  // Keep spaces — they prevent "0--2" (decrement syntax) issues
  // when a substituted value is negative, e.g. "0 - -2" ✓ but "0--2" ✗
  if (!/^[\d+\-*/\s()]+$/.test(resolved)) {
    throw new PxlError(`cannot evaluate expression: "${expr}" (resolved: "${resolved}")`, line);
  }
  try {
    return Math.floor(new Function(`return (${resolved})`)());
  } catch {
    throw new PxlError(`cannot evaluate expression: "${expr}" (resolved: "${resolved}")`, line);
  }
}

/**
 * Evaluate a boolean condition at runtime.
 * Supports: >, <, >=, <=, ==, !=
 */
function evalCondition(
  cond: string,
  runtimeVars: Map<string, number>,
  constants: Map<string, string>,
  line: number
): boolean {
  let resolved = substituteVars(cond, constants);
  resolved = substituteNumVars(resolved, runtimeVars);
  if (!/^[\d+\-*/\s()><!=]+$/.test(resolved)) {
    throw new PxlError(`invalid condition: "${cond}" (resolved: "${resolved}")`, line);
  }
  try {
    return !!new Function(`return (${resolved})`)();
  } catch {
    throw new PxlError(`cannot evaluate condition: "${cond}" (resolved: "${resolved}")`, line);
  }
}

// ---- Border overlay ----

function applyBorder(grid: Grid, pixelNums: number[], border: BorderSpec): void {
  const pixelSet = new Set(pixelNums);
  const expand = (pixels: Set<number>, layers: number): Set<number> => {
    let current = new Set(pixels);
    for (let i = 0; i < layers; i++) {
      const next = new Set(current);
      for (const p of current) {
        const { row, col } = grid.pixelToRowCol(p);
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const r = row + dr, c = col + dc;
            if (grid.inBounds(r, c)) next.add(grid.rowColToPixel(r, c));
          }
        }
      }
      current = next;
    }
    return current;
  };

  if (border.mode === "fill") {
    const expanded = expand(pixelSet, border.size);
    const outline = [...expanded].filter((p) => !pixelSet.has(p));
    grid.paint(outline, border.color);
  } else {
    const result = new Set<number>();
    for (const p of pixelNums) {
      const single = new Set([p]);
      const expanded = expand(single, border.size);
      for (const bp of expanded) {
        if (bp !== p) result.add(bp);
      }
    }
    grid.paint([...result], border.color);
  }
}

// ---- Break / pattern system ----

function applyBreak(
  grid: Grid,
  pixelNums: number[],
  brk: BreakSpec,
  kind: "linear" | "grid" | "circle" | "pixel",
  centerPixel?: number
): number[] {
  const { fill, space } = brk;
  const total = fill + space;

  if (kind === "linear" || kind === "pixel") {
    return pixelNums.filter((_, idx) => (idx % total) < fill);
  }

  if (kind === "circle" && centerPixel) {
    const { row: cr, col: cc } = grid.pixelToRowCol(centerPixel);
    const distanceGroups = new Map<number, number[]>();
    for (const p of pixelNums) {
      const { row, col } = grid.pixelToRowCol(p);
      const euclid = Math.round(Math.sqrt((row - cr) ** 2 + (col - cc) ** 2));
      if (!distanceGroups.has(euclid)) distanceGroups.set(euclid, []);
      distanceGroups.get(euclid)!.push(p);
    }
    const result: number[] = [];
    for (const [dist, pixels] of distanceGroups) {
      if ((dist % total) < fill) result.push(...pixels);
    }
    return result;
  }

  if (kind === "grid") {
    const lines = brk.lines || "vertical";
    if (lines === "vertical") {
      const rowMap = new Map<number, number[]>();
      for (const p of pixelNums) {
        const { row } = grid.pixelToRowCol(p);
        if (!rowMap.has(row)) rowMap.set(row, []);
        rowMap.get(row)!.push(p);
      }
      const result: number[] = [];
      for (const [, rowPixels] of rowMap) {
        rowPixels.sort((a, b) => grid.pixelToRowCol(a).col - grid.pixelToRowCol(b).col);
        for (let idx = 0; idx < rowPixels.length; idx++) {
          if ((idx % total) < fill) result.push(rowPixels[idx]);
        }
      }
      return result;
    } else {
      const colMap = new Map<number, number[]>();
      for (const p of pixelNums) {
        const { col } = grid.pixelToRowCol(p);
        if (!colMap.has(col)) colMap.set(col, []);
        colMap.get(col)!.push(p);
      }
      const result: number[] = [];
      for (const [, colPixels] of colMap) {
        colPixels.sort((a, b) => grid.pixelToRowCol(a).row - grid.pixelToRowCol(b).row);
        for (let idx = 0; idx < colPixels.length; idx++) {
          if ((idx % total) < fill) result.push(colPixels[idx]);
        }
      }
      return result;
    }
  }

  return pixelNums;
}

function applyFill(grid: Grid, tool: Tool, pixelNums: number[]): void {
  if (tool.kind === "gradient") {
    grid.paintGradient(pixelNums, tool.def);
  } else {
    grid.paint(pixelNums, tool.kind === "eraser" ? null : tool.color);
  }
}

function requireCanvas(grid: Grid | null, line: number): void {
  if (!grid) throw new PxlError("no canvas initialized — use 'init canvas WxH' first", line);
}

function requireTool(tool: Tool | null, line: number): void {
  if (!tool) throw new PxlError("no pen or eraser selected — use 'pin=color' or 'eraser' first", line);
}
