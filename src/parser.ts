import { resolveColor } from "./colors";
import { Command, PxlError, Orientation, BorderSpec, BreakSpec, BreakLines } from "./types";
import { parseMode } from "./gradient";

const RE_INIT = /^init\s+canvas\s+(\d+)\s*x\s*(\d+)$/i;
const RE_PEN = /^pen\s*=\s*(.+)$/i;
const RE_ERASER = /^eraser$/i;
const RE_PIXEL = /^fill\s+px\s+(.+)$/i;
const RE_RANGE = /^fill\s+in\s+range\s*\(\s*(\d+)\s*,\s*(\d+)\s*:\s*(horizontal|vertical)\s*\)$/i;
const RE_RECT = /^fill\s+rect\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i;
const RE_CUBE = /^fill\s+cube\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i;
const RE_CIRCLE = /^fill\s+circle\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i;
const RE_DIAG = /^fill\s+dig\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i;
const RE_TNG = /^fill\s+tng\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*:\s*(top|bottom)\s*,\s*(rightangel|normal)\s*\)$/i;
const RE_GRADIENT_HEADER = /^(?:crt|create)\s+(?:gradiant|gradient)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/i;
const RE_GRADIENT_PROP = /^(start|end|mode)\s*=\s*(.+)$/i;
const RE_BORDER = /:\s*border=(px|fill)-colour=([A-Za-z_][A-Za-z0-9_]*|[#][0-9a-fA-F]{3,8})(?:-size=(\d+)px)?\s*\)$/i;
const RE_BREAK = /[,:]\s*break=\s*\((\d+)\s*,\s*(\d+)\)(?:\s+lines-(horizontal|vertical))?\s*\)$/i;
const RE_LET = /^let\s+([A-Za-z_]\w*)\s*=\s*(.+)$/i;
const RE_SET = /^set\s+([A-Za-z_]\w*)\s*=\s*(.+)$/i;
const RE_REPEAT = /^repeat\s+(.+):\s*$/i;
const RE_FOR = /^for\s+([A-Za-z_]\w*)\s*=\s*(.+?)\s+to\s+(.+):\s*$/i;
const RE_IF = /^if\s+(.+):\s*$/i;
const RE_ELIF = /^else\s+if\s+(.+):\s*$/i;
const RE_ELSE = /^else:\s*$/i;

// Regex for (row x col) top-left based position syntax
const RE_POS = /\((\d+)\s*x\s*(\d+)\)/gi;

export function parse(source: string): { commands: Command[]; constants: Map<string, string> } {
  const commands: Command[] = [];
  const lines = source.split(/\r?\n/);
  const gradientNames = new Set<string>();
  const variables = new Map<string, string>();
  let canvasW = 0;
  let canvasH = 0;

  /** Convert (row x col) to pixel number measured from bottom-right */
  function resolvePos(line: string): string {
    return resolvePositions(line, canvasW, canvasH);
  }

  let i = 0;
  while (i < lines.length) {
    const lineNo = i + 1;
    const rawLine = lines[i];
    const indent = rawLine.length - rawLine.trimStart().length;
    let raw = stripComment(rawLine).trim();

    if (raw === "") { i++; continue; }

    // Handle variable assignments: let NAME = value
    const letMatch = raw.match(RE_LET);
    if (letMatch) {
      let varValue = substituteVars(letMatch[2].trim(), variables);
      varValue = resolvePos(varValue);
      if (/^[\d+\-*/\s()]+$/.test(varValue)) {
        varValue = String(evalMath(varValue.replace(/\s+/g, '')));
      } else {
        varValue = resolveMath(varValue);
      }
      variables.set(letMatch[1], varValue);
      i++;
      continue;
    }

    // Handle set: set NAME = expression   (runtime variable)
    const setMatch = raw.match(RE_SET);
    if (setMatch) {
      // Substitute let constants into the expression, keep raw for runtime
      let expr = substituteVars(setMatch[2].trim(), variables);
      expr = resolvePos(expr);
      commands.push({ kind: "set_var", name: setMatch[1], rawExpr: expr, line: lineNo });
      i++;
      continue;
    }

    // Handle repeat COUNT:
    const repeatMatch = raw.match(RE_REPEAT);
    if (repeatMatch) {
      let rawCount = substituteVars(repeatMatch[1].trim(), variables);
      rawCount = resolvePos(rawCount);
      const { block, nextIdx } = readBlockLines(lines, i + 1, indent);
      commands.push({ kind: "repeat", countRaw: rawCount, bodyLines: block, line: lineNo });
      i = nextIdx;
      continue;
    }

    // Handle for NAME = START to END:
    const forMatch = raw.match(RE_FOR);
    if (forMatch) {
      const varName = forMatch[1];
      let rawStart = substituteVars(forMatch[2].trim(), variables);
      let rawEnd = substituteVars(forMatch[3].trim(), variables);
      rawStart = resolvePos(rawStart);
      rawEnd = resolvePos(rawEnd);
      const { block, nextIdx } = readBlockLines(lines, i + 1, indent);
      commands.push({ kind: "for", varName, rawStart, rawEnd, bodyLines: block, line: lineNo });
      i = nextIdx;
      continue;
    }

    // Handle if / else if / else chain
    const ifMatch = raw.match(RE_IF);
    if (ifMatch) {
      let cond = substituteVars(ifMatch[1].trim(), variables);
      cond = resolvePos(cond);
      const { block: body, nextIdx: bodyEnd } = readBlockLines(lines, i + 1, indent);
      const chain: Array<{ cond: string; bodyLines: string[] }> = [{ cond, bodyLines: body }];
      let elseBodyLines: string[] | null = null;
      let nextLineIdx = bodyEnd;

      // Look ahead for else-if / else blocks
      while (nextLineIdx < lines.length) {
        const peekLine = stripComment(lines[nextLineIdx]).trim();
        const peekIndent = lines[nextLineIdx].length - lines[nextLineIdx].trimStart().length;
        if (peekIndent !== indent) break; // different indent level → not ours
        if (peekLine === "") { nextLineIdx++; continue; }

        const elifMatch = peekLine.match(RE_ELIF);
        if (elifMatch) {
          let elifCond = substituteVars(elifMatch[1].trim(), variables);
          elifCond = resolvePos(elifCond);
          const { block: elifBody, nextIdx: elifEnd } = readBlockLines(lines, nextLineIdx + 1, indent);
          chain.push({ cond: elifCond, bodyLines: elifBody });
          nextLineIdx = elifEnd;
          continue;
        }

        const elseMatch = peekLine.match(RE_ELSE);
        if (elseMatch) {
          const { block: elseBody, nextIdx: elseEnd } = readBlockLines(lines, nextLineIdx + 1, indent);
          elseBodyLines = elseBody;
          nextLineIdx = elseEnd;
          break; // else must be last
        }

        break; // not else-if or else → stop looking
      }

      commands.push({ kind: "if_else", chain, elseBodyLines, line: lineNo });
      i = nextLineIdx;
      continue;
    }

    // Substitute let constants and preprocess math for regular commands
    raw = substituteVars(raw, variables);
    raw = resolveMath(raw);
    raw = resolvePos(raw);

    // Extract border and break suffixes
    const afterBorder = extractBorder(raw, lineNo);
    const afterBreak = extractBreak(afterBorder.clean, lineNo);
    const border = afterBorder.border;
    const brk = afterBreak.brk;

    let m: RegExpMatchArray | null;

    if ((m = afterBreak.clean.match(RE_GRADIENT_HEADER))) {
      const name = m[1];
      const { props, nextIndex } = readIndentedBlock(lines, i + 1, variables);
      const startRaw = props.get("start");
      const endRaw = props.get("end");
      const modeRaw = props.get("mode");
      if (!startRaw) throw new PxlError(`gradient "${name}" is missing "start=" color`, lineNo);
      if (!endRaw) throw new PxlError(`gradient "${name}" is missing "end=" color`, lineNo);
      if (!modeRaw) throw new PxlError(`gradient "${name}" is missing "mode="`, lineNo);
      const start = resolveColor(startRaw);
      if (!start) throw new PxlError(`unknown start color "${startRaw}" in gradient "${name}"`, lineNo);
      const end = resolveColor(endRaw);
      if (!end) throw new PxlError(`unknown end color "${endRaw}" in gradient "${name}"`, lineNo);
      const mode = parseMode(modeRaw, lineNo);
      commands.push({ kind: "create_gradient", name, start, end, mode, line: lineNo });
      gradientNames.add(name.toLowerCase());
      i = nextIndex;
      continue;
    }

    if ((m = afterBreak.clean.match(RE_INIT))) {
      const width = parseInt(m[1], 10);
      const height = parseInt(m[2], 10);
      canvasW = width;
      canvasH = height;
      if (width <= 0 || height <= 0) throw new PxlError(`canvas dimensions must be positive, got ${width}x${height}`, lineNo);
      commands.push({ kind: "init_canvas", width, height, line: lineNo });
      i++; continue;
    }

    if (RE_ERASER.test(afterBreak.clean)) {
      commands.push({ kind: "set_eraser", line: lineNo });
      i++; continue;
    }

    if ((m = afterBreak.clean.match(RE_PEN))) {
      const value = m[1].trim();
      if (gradientNames.has(value.toLowerCase())) {
        commands.push({ kind: "set_pen_gradient", name: value, line: lineNo });
      } else {
        const color = resolveColor(value);
        if (!color) throw new PxlError(`unknown color or gradient "${value}"`, lineNo);
        commands.push({ kind: "set_pen", color, line: lineNo });
      }
      i++; continue;
    }

    if ((m = afterBreak.clean.match(RE_PIXEL))) {
      const pixels = m[1].split(",").map((s) => parseInt(s.trim(), 10));
      commands.push({ kind: "fill_pixel", pixels, border, break: brk, line: lineNo });
      i++; continue;
    }

    if ((m = afterBreak.clean.match(RE_RANGE))) {
      commands.push({ kind: "fill_range", start: parseInt(m[1],10), length: parseInt(m[2],10), orientation: m[3].toLowerCase() as Orientation, border, break: brk, line: lineNo });
      i++; continue;
    }

    if ((m = afterBreak.clean.match(RE_RECT))) {
      commands.push({ kind: "fill_rect", start: parseInt(m[1],10), len: parseInt(m[2],10), breadth: parseInt(m[3],10), border, break: brk, line: lineNo });
      i++; continue;
    }

    if ((m = afterBreak.clean.match(RE_CUBE))) {
      commands.push({ kind: "fill_cube", start: parseInt(m[1],10), side: parseInt(m[2],10), border, break: brk, line: lineNo });
      i++; continue;
    }

    if ((m = afterBreak.clean.match(RE_CIRCLE))) {
      commands.push({ kind: "fill_circle", pixel: parseInt(m[1],10), radius: parseInt(m[2],10), border, break: brk, line: lineNo });
      i++; continue;
    }

    if ((m = afterBreak.clean.match(RE_DIAG))) {
      commands.push({ kind: "fill_diagonal", start: parseInt(m[1],10), end: parseInt(m[2],10), border, break: brk, line: lineNo });
      i++; continue;
    }

    if ((m = afterBreak.clean.match(RE_TNG))) {
      const baseStart = parseInt(m[1],10);
      const baseEnd = parseInt(m[2],10);
      const altitude = parseInt(m[3],10);
      const direction = m[4].toLowerCase() as "top" | "bottom";
      const mode = m[5].toLowerCase() as "normal" | "rightangel";
      if (altitude <= 0) throw new PxlError(`triangle altitude must be positive, got ${altitude}`, lineNo);
      commands.push({ kind: "fill_triangle", baseStart, baseEnd, altitude, direction, mode, border, break: brk, line: lineNo });
      i++; continue;
    }

    throw new PxlError(`invalid syntax: "${raw}"`, lineNo);
  }

  return { commands, constants: variables };
}

// ---- Block reader ----

/**
 * Read indented block lines starting at startIdx.
 * Stops when a line has the same or less indent than `parentIndent`.
 * Returns the block lines (with their leading indent preserved relative to parent)
 * and the index of the first line after the block.
 */
function readBlockLines(
  lines: string[],
  startIdx: number,
  parentIndent: number
): { block: string[]; nextIdx: number } {
  const block: string[] = [];
  let j = startIdx;
  for (; j < lines.length; j++) {
    const rawLine = lines[j];
    const trimmed = rawLine.trim();
    // Blank line → stop block
    if (trimmed === "") break;
    const lineIndent = rawLine.length - rawLine.trimStart().length;
    // Line at or above parent indent → end of block
    if (lineIndent <= parentIndent) break;
    // Store the line with its relative indent stripped
    block.push(rawLine.slice(parentIndent + 1));
  }
  return { block, nextIdx: j };
}

// ---- Border extraction ----

function extractBorder(raw: string, lineNo: number): { clean: string; border: BorderSpec | null } {
  const m = raw.match(RE_BORDER);
  if (m) {
    const mode = m[1].toLowerCase() as "px" | "fill";
    const colorRaw = m[2];
    const size = m[3] ? parseInt(m[3], 10) : 1;
    if (size <= 0 || size > 20) throw new PxlError(`border size must be 1-20, got ${size}`, lineNo);
    const color = resolveColor(colorRaw);
    if (!color) throw new PxlError(`unknown border colour "${colorRaw}"`, lineNo);
    return { clean: raw.slice(0, m.index) + ')', border: { mode, color, size } };
  }
  return { clean: raw, border: null };
}

// ---- Break extraction ----

function extractBreak(raw: string, lineNo: number): { clean: string; brk: BreakSpec | null } {
  const m = raw.match(RE_BREAK);
  if (m) {
    const fill = parseInt(m[1], 10);
    const space = parseInt(m[2], 10);
    if (fill <= 0 || space <= 0) throw new PxlError(`break fill/space must be positive, got (${fill},${space})`, lineNo);
    const lines = m[3] ? (m[3].toLowerCase() as BreakLines) : undefined;
    return { clean: raw.slice(0, m.index) + ')', brk: { fill, space, lines } };
  }
  return { clean: raw, brk: null };
}

// ---- Gradient block reader ----

function readIndentedBlock(
  lines: string[],
  startIndex: number,
  variables?: Map<string, string>
): { props: Map<string, string>; nextIndex: number } {
  const props = new Map<string, string>();
  let j = startIndex;
  for (; j < lines.length; j++) {
    const noComment = stripComment(lines[j]);
    if (noComment.trim() === "") break;
    if (!/^[ \t]/.test(noComment)) break;
    const bodyLineNo = j + 1;
    const trimmed = noComment.trim();
    const m = trimmed.match(RE_GRADIENT_PROP);
    if (!m) throw new PxlError(`invalid gradient property: "${trimmed}"`, bodyLineNo);
    let value = m[2].trim();
    if (variables) value = substituteVars(value, variables);
    value = preprocessMath(value);
    props.set(m[1].toLowerCase(), value);
  }
  return { props, nextIndex: j };
}

// ---- Helpers ----

function stripComment(line: string): string {
  const idx = line.indexOf("##");
  return idx === -1 ? line : line.slice(0, idx);
}

function resolveMath(line: string): string {
  let prev: string;
  do {
    prev = line;
    line = line.replace(/\((\d+)\)/g, '$1');
    line = preprocessMath(line);
  } while (line !== prev);
  return line;
}

function preprocessMath(line: string): string {
  const re = /(\d+\s*[+\-*/]\s*)+\d+/;
  while (re.test(line)) {
    line = line.replace(re, (match) => {
      const expr = match.replace(/\s+/g, '');
      return String(evalMath(expr));
    });
  }
  return line;
}

function evalMath(expr: string): number {
  if (!/^[\d+\-*/\s()]+$/.test(expr)) throw new Error(`Invalid arithmetic expression: "${expr}"`);
  return Math.floor(new Function(`return (${expr})`)());
}

export function substituteVars(line: string, vars: Map<string, string>): string {
  const entries = [...vars.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [name, value] of entries) {
    const re = new RegExp(`\\b${escapeRegex(name)}\\b`, 'g');
    line = line.replace(re, value);
  }
  return line;
}

/** Substitute numeric runtime variables into a line (e.g. i → 2) */
export function substituteNumVars(line: string, vars: Map<string, number>): string {
  const entries = [...vars.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [name, value] of entries) {
    const re = new RegExp(`\\b${escapeRegex(name)}\\b`, 'g');
    line = line.replace(re, String(value));
  }
  return line;
}

/** Extract border suffix from a line. Used by runtime body parser. */
export { extractBorder, extractBreak };

/** Full math resolution — strips parens and evaluates flat expressions. */
export { resolveMath };

/** Resolve (row x col) to pixel number measured from top-left. */
export function resolvePositions(line: string, width: number, height: number): string {
  if (width === 0 || height === 0) return line;
  return line.replace(RE_POS, (_m, r, c) => {
    const row = parseInt(r, 10);
    const col = parseInt(c, 10);
    // Standard row-major: pixel = (row - 1) * width + col
    const px = (row - 1) * width + col;
    return String(px);
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a single fully-processed line into a Command.
 * The line must already have variables substituted and math resolved.
 * This is used at RUNTIME to re-parse loop/if body lines.
 */
export function parseProcessedLine(
  raw: string,
  lineNo: number,
  gradientNames: Set<string>
): Command {
  // Extract border and break
  const afterBorder = extractBorder(raw, lineNo);
  const afterBreak = extractBreak(afterBorder.clean, lineNo);
  const border = afterBorder.border;
  const brk = afterBreak.brk;

  let m: RegExpMatchArray | null;

  if (RE_ERASER.test(afterBreak.clean)) {
    return { kind: "set_eraser", line: lineNo };
  }

  if ((m = afterBreak.clean.match(RE_PEN))) {
    const value = m[1].trim();
    if (gradientNames.has(value.toLowerCase())) {
      return { kind: "set_pen_gradient", name: value, line: lineNo };
    }
    const color = resolveColor(value);
    if (!color) throw new PxlError(`unknown color or gradient "${value}"`, lineNo);
    return { kind: "set_pen", color, line: lineNo };
  }

  if ((m = afterBreak.clean.match(RE_SET))) {
    return { kind: "set_var", name: m[1], rawExpr: m[2].trim(), line: lineNo };
  }

  if ((m = afterBreak.clean.match(RE_RECT))) {
    return { kind: "fill_rect", start: parseInt(m[1],10), len: parseInt(m[2],10), breadth: parseInt(m[3],10), border, break: brk, line: lineNo };
  }

  if ((m = afterBreak.clean.match(RE_CUBE))) {
    return { kind: "fill_cube", start: parseInt(m[1],10), side: parseInt(m[2],10), border, break: brk, line: lineNo };
  }

  if ((m = afterBreak.clean.match(RE_CIRCLE))) {
    return { kind: "fill_circle", pixel: parseInt(m[1],10), radius: parseInt(m[2],10), border, break: brk, line: lineNo };
  }

  if ((m = afterBreak.clean.match(RE_RANGE))) {
    return { kind: "fill_range", start: parseInt(m[1],10), length: parseInt(m[2],10), orientation: m[3].toLowerCase() as Orientation, border, break: brk, line: lineNo };
  }

  if ((m = afterBreak.clean.match(RE_DIAG))) {
    return { kind: "fill_diagonal", start: parseInt(m[1],10), end: parseInt(m[2],10), border, break: brk, line: lineNo };
  }

  if ((m = afterBreak.clean.match(RE_PIXEL))) {
    const pixels = m[1].split(",").map((s) => parseInt(s.trim(), 10));
    return { kind: "fill_pixel", pixels, border, break: brk, line: lineNo };
  }

  if ((m = afterBreak.clean.match(RE_TNG))) {
    const baseStart = parseInt(m[1],10);
    const baseEnd = parseInt(m[2],10);
    const altitude = parseInt(m[3],10);
    const direction = m[4].toLowerCase() as "top" | "bottom";
    const mode = m[5].toLowerCase() as "normal" | "rightangel";
    if (altitude <= 0) throw new PxlError(`triangle altitude must be positive, got ${altitude}`, lineNo);
    return { kind: "fill_triangle", baseStart, baseEnd, altitude, direction, mode, border, break: brk, line: lineNo };
  }

  throw new PxlError(`invalid syntax: "${raw}"`, lineNo);
}
