# PXL — Pixel Art Language

**PXL** is a domain-specific language for creating pixel art through code. Write `.pxl` scripts that define a canvas, set colors, draw shapes, and render the result as a high-resolution PNG image.

```
init canvas 64x64
pen = #FF6B35
fill circle(1760, 10)
```

---

## 📦 Installation

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- npm (ships with Node.js)

### Setup

```bash
# 1. Clone or download the project
git clone <repository-url>
cd pxl-lang

# 2. Install dependencies
npm install

# 3. Build from TypeScript source
npm run build

# 4. (Optional) Install globally for `pxl` CLI command
npm install -g .
pxl examples/night.pxl

# Or run directly without global install
node dist/cli.js examples/night.pxl
```

---

## 🚀 Usage

```bash
pxl <input.pxl> [-o output.png]    # Single file
pxl <directory>                     # Batch render all .pxl files
```

| Argument | Description |
|---|---|
| `<file.pxl>` | Path to a single `.pxl` script |
| `<directory>` | Directory containing `.pxl` files to batch render |
| `-o output.png` | Custom output path (single-file mode only; default: `<basename>.png`) |

### Quick start

```bash
# Render a single file
pxl scene.pxl
pxl scene.pxl -o artwork.png

# Batch render all .pxl files in a directory (auto-generates .png outputs)
pxl examples/

# Or with the 'plx' alias (same command)
plx examples/
```

When given a **directory**, PXL scans for all `.pxl` files, renders each one to a `.png` image of the same name, and prints a summary of successes and failures.

```bash
$ pxl .
Found 1 .pxl file(s) in "/home/user/project"

  OK — night.pxl (48x48) → night.png

Done — 1 succeeded, 0 failed
```

### Using as a library

```typescript
import { run, renderToPNG } from "pxl-lang";

const source = `
init canvas 16x16
pen = red
fill circle(137, 5)
`;

const grid = run(source);
renderToPNG(grid, "output.png");
```

---

## 🎨 Language Reference

### Pixel Numbering System

The canvas is **1-indexed, row-major**. Pixel numbers increase left-to-right, top-to-bottom:

```
pixel(row, col) = (row - 1) × width + col
```

For a 90-wide canvas, pixel(5, 3) = (5-1)×90 + 3 = 363.

---

### `init canvas W x H` — Create the canvas

Creates the pixel grid. Must be the first command in any script.

```
init canvas 64x64        # 64 columns × 64 rows = 4096 pixels
init canvas 90x160       # HD portrait: 90×160 = 14,400 pixels
init canvas 8*8 x 8*8    # Math works: 64×64
```

---

### `pen = <color>` — Set the drawing tool

Sets the active pen to a color or gradient. All subsequent fill commands use this tool until changed.

```
pen = red                # Named CSS3 color
pen = #FF6B35            # Hex RGB: #RRGGBB
pen = #F60               # Hex shorthand: #RGB
pen = #FF008844          # Hex RGBA with alpha: #RRGGBBAA
pen = transparent        # Fully transparent
pen = skyGrad            # Reference a gradient (must be defined first)
```

#### Named Colors

PXL supports all standard CSS3 named colors:

`black`, `white`, `red`, `green`, `lime`, `blue`, `yellow`, `cyan`, `magenta`, `silver`, `gray`, `grey`, `maroon`, `olive`, `purple`, `teal`, `navy`, `orange`, `pink`, `brown`, `gold`, `indigo`, `violet`, `coral`, `salmon`, `khaki`, `crimson`, `chocolate`, `turquoise`, `tan`, `plum`, `orchid`, `skyblue`, `steelblue`, `tomato`, `beige`, `ivory`, `lavender`, `darkred`, `darkgreen`, `darkblue`, `lightgray`, `lightgrey`, `lightblue`, `lightgreen`, `hotpink`, `transparent`

---

### `eraser` — Switch to eraser tool

Switches the active tool to eraser mode. Subsequent fills **clear** pixels rather than coloring them.

```
eraser
fill rect(1, 4, 4)       # Erases the top-left 4×4 area
```

---

### `crt gradient <name>:` — Define a gradient

Creates a reusable gradient that blends between two colors. The keyword accepts common typos: `crt`/`create`, `gradiant`/`gradient`.

```
crt gradient skyGrad:
    start = #0D0B2E
    end   = #FF6B35
    mode  = linear:vertical
```

**Properties:**

| Property | Values | Description |
|---|---|---|
| `start` | Color | Starting color (top/left/center) |
| `end` | Color | Ending color (bottom/right/outer) |
| `mode` | See below | Blend direction |

**Modes:**

| Mode | Description |
|---|---|
| `linear:vertical` | Blends top-to-bottom |
| `linear:horizontal` | Blends left-to-right |
| `radial` / `radical` | Blends outward from center |
| `freeform` | Blends diagonally (row + col) |

**Usage:**
```
pen = skyGrad
fill rect(1, 90, 42)     # Sky gradient applied
```

---

### Shape Fill Commands

All fill commands can optionally accept **border** and **break** modifiers (see below).

#### `fill px <n1>, <n2>, ...` — Paint individual pixels

Fills specific pixel numbers by their 1D index.

```
fill px 1, 10, 20, 30                    # Four individual pixels
fill px 10+3, 20+5, 30+7                 # Math works: 13, 25, 37
```

#### `fill in range(start, length: direction)` — Paint a line

Fills a contiguous line of pixels.

```
fill in range(5, 10: horizontal)         # 10 pixels to the right from pixel 5
fill in range(3, 8: vertical)            # 8 pixels downward from pixel 3
```

#### `fill rect(start, width, height)` — Paint a rectangle

Fills a solid rectangle from a starting pixel.

```
fill rect(1, 64, 10)                     # Top 10 rows, full 64-col width
fill rect(1236, 25, 19)                  # Starting at pixel 1236, 25 wide × 19 tall
```

#### `fill cube(start, side)` — Paint a square

Shorthand for `fill rect` with equal width and height.

```
fill cube(1, 64)                         # Fill entire 64×64 canvas
fill cube(1, 5: border=px-colour=red)    # 5×5 with per-pixel red border
```

#### `fill circle(center, radius)` — Paint a circle

Fills a circle using the midpoint circle algorithm. Silently clips at canvas edges.

```
fill circle(1760, 10)                    # Center at pixel 1760, radius 10
fill circle(1760, 7: break=(3,2))        # Concentric ring pattern
```

#### `fill tng(base1, base2, altitude: dir, mode)` — Paint a triangle

Fills a triangle. The base pixels must share the **same row** (for a horizontal base) or **same column** (for a vertical base).

```
fill tng(1992, 2040, 24: top, normal)    # Isosceles pointing UP
fill tng(2964, 2989, 16: top, rightangel)  # Right-angle pointing UP
fill tng(244, 269, 16: bottom, rightangel) # Right-angle pointing DOWN
```

**Parameters:**

| Param | Description |
|---|---|
| `base1` | First endpoint of the base (pixel number) |
| `base2` | Second endpoint (must share row or col with base1) |
| `altitude` | Height of the triangle (in pixels) |

**Direction:**

| Value | Horizontal Base | Vertical Base |
|---|---|---|
| `top` | Points UP | Points LEFT |
| `bottom` | Points DOWN | Points RIGHT |

**Mode:**

| Mode | Description |
|---|---|
| `normal` | Isosceles — apex centered on the base |
| `rightangel` | Right-angle — right angle at `base1`, altitude extending perpendicular |

#### `fill dig(start, end)` — Paint a 45° diagonal

Fills a perfect 45° diagonal line. Start and end must differ equally in rows and columns.

```
fill dig(1, 66)                          # From (1,1) to (2,2) — 45° angle
fill dig(1685, 2595)                     # From (19,65) to (29,75)
```

> ⚠️ **Constraint:** `|rowDiff| === |colDiff|` — only 45° diagonals are supported.

---

### 🎨 Border Modifier — `: border=<mode>-colour=<color>[-size=Npx]`

Attaches to any fill command to add an outline.

```
fill rect(B1, 7, 30: border=fill-colour=NPK-size=1px)
fill cube(1, 5: border=px-colour=red-size=2px)
```

**Two modes:**

| Mode | Behavior |
|---|---|
| `border=px-colour=...` | **Per-pixel border**: Each pixel in the shape gets its own `size`-pixel border. Creates a grid/net effect. |
| `border=fill-colour=...` | **Shape outline**: Expands the entire shape's boundary outward by `size` pixels. Paints only the expanded pixels not in the original shape. |

**Size:** `-size=Npx` (optional, default `1px`, range `1-20`)

---

### 🔲 Break Modifier — `: break=(fill, space)[ lines-dir]`

Creates rhythmic patterns by skipping pixels during fill. Perfect for stripes, dashed lines, and window grids.

```
fill in range(3, 30: vertical, break=(3,2))        # 3px fill, 2px skip
fill cube(133, 8: break=(3,1) lines-vertical)       # 3 filled cols, 1 gap col
fill cube(325, 8: break=(2,2) lines-horizontal)     # 2 filled rows, 2 gap rows
fill circle(1190, 10: break=(3,2))                  # 3 rings fill, 2 rings skip
```

| Parameter | Description |
|---|---|
| `fill` | Number of pixels/rows/cols/rings to fill |
| `space` | Number to skip |
| `lines-vertical` | For grid shapes: patterns columns (the default) |
| `lines-horizontal` | For grid shapes: patterns rows |

**Behavior by shape type:**

| Shape | Behavior |
|---|---|
| **linear** (range, diagonal) | Patterns along the line: fill N, skip M |
| **pixel** (fill px) | Patterns through the pixel list in order |
| **grid** (rect, cube, tng) | Row-by-row or column-by-column striping |
| **circle** | Concentric rings sorted by distance from center |

**Combined border + break:**
```
fill cube(55, 6: break=(2,1) lines-vertical: border=fill-colour=#CE93D8-size=1px)
```

---

### 🔢 Variables

#### `let NAME = expression` — Compile-time constant

Evaluated at **parse time**. Supports full arithmetic. Constants are substituted into the source as string values.

```
let C      = 90                    # Canvas width
let H      = 160                   # Canvas height
let TOTAL  = C * H                 # Total pixels: 14400
let MOON_X = 68
let MOON_Y = 9
let MOON_PX = (MOON_Y - 1) * C + MOON_X  # = 788
```

**Key behaviors:**
- Math expressions are fully evaluated during parsing
- `let` values can reference previously defined `let` variables
- Supports `+`, `-`, `*`, `/`, and parentheses

#### `set NAME = expression` — Runtime variable

Created or updated **during execution**. Essential for counters and dynamic calculations inside loops.

```
set px = (col - 1) * 8 + 3         # Calculate pixel number
set rep = rep + 1                  # Increment
set dist = dx + dy                 # Math with other runtime vars
```

> ⚠️ **Variable Name Gotcha:** Short variable names (1-2 characters) may collide with substrings inside longer names or hex codes. Prefer names with 3+ characters (e.g., `COL` instead of `C`, `WID` instead of `W`).

---

### 🔁 Flow Control

#### `repeat COUNT:`

Repeats a block of commands a fixed number of times.

```
set rep_ct = 1
repeat 6:
    set rp = (130 + rep_ct * 3 - 1) * COL + 68
    fill rect(rp, 18, 1)
    set rep_ct = rep_ct + 1
```

#### `for VAR = START to END:`

Loops from `start` to `end` (inclusive). The loop variable is available as a runtime variable.

```
for col = 1 to 8:
    set px = (col - 1) * 8 + 3
    fill rect(px, 5, 24)
```

**Nested loops:**
```
for r = 1 to 4:
    for c = 1 to 4:
        set px = (r * 3 + 3 - 1) * C + c * 3 + 50
        fill rect(px, 2, 2)
```

#### `if / else if / else:`

Conditional execution with chainable branches.

```
if r < 125:
    set wp = (r - 1) * COL + 50
    fill rect(wp, 10, 1)
else if r < 128:
    pen = BLUE
    fill rect(wp, 5, 1)
else:
    pen = GREEN
    fill rect(wp, 10, 1)
```

**Supported operators:** `>`, `<`, `>=`, `<=`, `==`, `!=`

**Indentation:** All block commands (`for`, `repeat`, `if/elif/else`) use **indentation** to define their body. The body must be indented deeper than the control statement. Blank lines end blocks.

---

### 💬 Comments

Everything after `##` on a line is ignored.

```
## This is a comment
fill rect(1, 10, 5)  ## Inline comment
```

---

## 🧮 Math in Arguments

All numeric arguments support arithmetic expressions using `+`, `-`, `*`, `/`, and parentheses. Expressions are evaluated at parse time before commands are executed.

```
fill rect(3*8+1, 2+2, 3+1: border=fill-colour=red-size=1px)  # start=25, w=4, h=4 + red outline
fill tng(4*8+1, 6*8-1, 2+2: top, normal)           # base 33-47, alt 4, isosceles up
fill circle(4*8+4, 10/2)                            # center at pixel 36, radius 5
```

---

## 📁 Example

```bash
# Render the night scene
pxl examples/night.pxl
```

---

## 🏗 Architecture

```
.pxl file
    │
    ▼
┌──────────┐
│  parser  │  → Parses source into Command[] + let constants
└────┬─────┘
     ▼
┌──────────┐
│ executor │  → Executes commands, operates on Grid
└────┬─────┘
     ▼
┌──────────┐
│   Grid   │  → 2D pixel array with shape enumeration
└────┬─────┘
     ▼
┌──────────┐
│ renderer │  → Renders Grid to 12× scaled PNG
└──────────┘
     │
     ▼
   output.png
```

| Module | File | Responsibility |
|---|---|---|
| Parser | `src/parser.ts` | Tokenizes source, resolves `let` constants & math, produces `Command[]` |
| Executor | `src/executor.ts` | Runtime: evaluates `set`/`for`/`repeat`/`if`, dispatches fills |
| Grid | `src/grid.ts` | 2D pixel array, shape enumeration, painting, bounds checking |
| Gradient | `src/gradient.ts` | Gradient mode parsing, color interpolation, bounding box calculation |
| Colors | `src/colors.ts` | Named color map, hex parsing, RGBA conversion, color lerp |
| Renderer | `src/renderer.ts` | PNG generation (12× upscale), RGBA pixel output |
| CLI | `src/cli.ts` | Command-line interface: reads file, calls `run()`, writes PNG |
| Types | `src/types.ts` | TypeScript types for all commands and data structures |

---

## ⚠️ Constraints & Edge Cases

| Constraint | Detail |
|---|---|
| **Canvas** | Only one `init canvas` allowed per script |
| **Positive dimensions** | Canvas width/height must be positive integers |
| **Diagonal lines** | `fill dig` requires |rowDiff| === |colDiff| (45° only) |
| **Triangle base** | `fill tng` base pixels must share the same row OR same column |
| **Bounds** | `fill rect`, `fill range`, `fill cube` throw if any pixel is out of bounds |
| **Circle clipping** | `fill circle` silently clips pixels outside canvas |
| **Border size** | `-size=Npx` must be 1-20 |
| **Break values** | `fill` and `space` must be positive integers |
| **Variable names** | Avoid single-letter names (may collide with hex digits or substrings) |

---

## 🧪 Building from Source

```bash
# TypeScript compilation
npx tsc

# Or watch mode for development
npx tsc --watch
```

### Dependencies

| Package | Version | Purpose |
|---|---|---|
| `typescript` | ^7.0.2 | TypeScript compiler |
| `pngjs` | ^7.0.0 | PNG image encoding |
| `@types/node` | ^26.1.1 | Node.js type definitions |
| `@types/pngjs` | ^6.0.5 | pngjs type definitions |

---

## 📄 License

ISC
