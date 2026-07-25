import { PNG } from "pngjs";
import * as fs from "fs";
import { Grid } from "./grid";
import { hexToRgba } from "./colors";

const SCALE = 12; // upscale so pixels are visible

export function renderToPNG(grid: Grid, outPath: string): void {
  const png = new PNG({ width: grid.width * SCALE, height: grid.height * SCALE });
  const pixels = grid.toArray();

  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const color = pixels[row * grid.width + col];
      const [r, g, b, a] = color ? hexToRgba(color) : [255, 255, 255, 255];
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const px = col * SCALE + sx;
          const py = row * SCALE + sy;
          const idx = (png.width * py + px) << 2;
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = a;
        }
      }
    }
  }

  png.pack().pipe(fs.createWriteStream(outPath));
}
