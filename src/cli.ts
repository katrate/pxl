#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { run, renderToPNG } from "./index";
import { PxlError } from "./types";

const args = process.argv.slice(2);

function printUsage(): void {
  console.error(`
  pxl — Pixel Art Language CLI

  USAGE:
    pxl  <file.pxl>                     Render a single file to PNG
    pxl  <file.pxl> -o <output.png>     Render with custom output path
    pxl  <directory>                    Batch render all .pxl files in directory
    plx  <...>                          Alias for the same commands

  EXAMPLES:
    pxl scene.pxl                       → scene.png
    pxl scene.pxl -o artwork.png        → artwork.png
    pxl examples/                       → processes all .pxl files
    pxl .                               → processes current directory
`);
}

if (args.length < 1) {
  printUsage();
  process.exit(1);
}

const inputPath = args[0];

// ---- Determine if input is a file or directory ----
let stat: fs.Stats;
try {
  stat = fs.statSync(inputPath);
} catch {
  console.error(`Error: "${inputPath}" does not exist`);
  process.exit(1);
}

if (stat.isDirectory()) {
  // ======== DIRECTORY MODE ========

  // Warn if -o flag is passed (silently ignored in directory mode)
  if (args.includes("-o")) {
    console.warn("Note: -o flag is ignored in directory mode; each .pxl file outputs to its own .png");
  }

  const files = fs.readdirSync(inputPath)
    .filter(f => f.toLowerCase().endsWith(".pxl"))
    .sort();

  if (files.length === 0) {
    console.error(`Error: no .pxl files found in "${inputPath}"`);
    process.exit(1);
  }

  let success = 0;
  let failed = 0;

  console.log(`Found ${files.length} .pxl file(s) in "${path.resolve(inputPath)}"\n`);

  for (const file of files) {
    const fullPath = path.join(inputPath, file);
    const outName = path.basename(file, ".pxl") + ".png";
    const outPath = path.join(inputPath, outName);

    try {
      const source = fs.readFileSync(fullPath, "utf-8");
      const grid = run(source);
      renderToPNG(grid, outPath);
      console.log(`  OK — ${file} (${grid.width}x${grid.height}) → ${outName}`);
      success++;
    } catch (err) {
      if (err instanceof PxlError) {
        console.error(`  FAIL — ${file}: ${err.message}`);
      } else {
        console.error(`  FAIL — ${file}: ${(err as Error).message}`);
      }
      failed++;
    }
  }

  console.log(`\nDone — ${success} succeeded, ${failed} failed`);
  if (failed > 0) process.exit(1);

} else {
  // ======== SINGLE FILE MODE ========
  const oFlagIdx = args.indexOf("-o");
  const outPath = oFlagIdx !== -1
    ? args[oFlagIdx + 1]
    : path.basename(inputPath, ".pxl") + ".png";

  const source = fs.readFileSync(inputPath, "utf-8");

  try {
    const grid = run(source);
    renderToPNG(grid, outPath);
    console.log(`OK — rendered ${grid.width}x${grid.height} canvas → ${outPath}`);
  } catch (err) {
    if (err instanceof PxlError) {
      console.error(`Error — ${err.message}`);
    } else {
      console.error(`Error — ${(err as Error).message}`);
    }
    process.exit(1);
  }
}
