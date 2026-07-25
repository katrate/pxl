import { parse } from "./parser";
import { execute } from "./executor";
import { Grid } from "./grid";

export { parse } from "./parser";
export { execute } from "./executor";
export { Grid } from "./grid";
export { PxlError } from "./types";
export { renderToPNG } from "./renderer";

/** Parse + run a .pxl source string, return the resulting Grid. */
export function run(source: string): Grid {
  const { commands, constants } = parse(source);
  return execute(commands, constants).grid;
}
