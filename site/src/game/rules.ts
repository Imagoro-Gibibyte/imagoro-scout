import type { MicroSlatsProps } from "../effects/MicroSlats.jsx";

/** Both curves use this rate, so a run stops being survivable within about 15 hits. */
const GROWTH = 0.5;
const BASE_SPEED = 140; // CSS px/s
const BASE_SPAWN = 1.6; // seconds between targets
const MIN_SPAWN = 1 / 60;

export function targetSpeed(score: number): number {
  return BASE_SPEED * Math.exp(GROWTH * score);
}

export function spawnInterval(score: number): number {
  return Math.max(MIN_SPAWN, BASE_SPAWN * Math.exp(-GROWTH * score));
}

/** Pellet count is the engine's shotgun_light. Its 6.5 degree spread is tightened for this game. */
export const PELLETS = 7;
export const SPREAD_DEG = 2.5;

/** Centre of each slat row between two heights, using the same grid as MicroSlats' layout. */
export function slatLanes(height: number, top: number, bottom: number, sea: MicroSlatsProps): number[] {
  const slatH = sea.slatHeight ?? 25;
  const gap = sea.gap ?? 0;
  const pitch = slatH + gap;
  const rows = Math.ceil((height + gap) / pitch) + 1;
  const origin = (height - (rows * pitch - gap)) / 2;
  const lanes: number[] = [];
  for (let row = 0; row < rows; row++) {
    const y = origin + row * pitch + slatH / 2;
    if (y - slatH / 2 >= top && y + slatH / 2 <= bottom) lanes.push(y);
  }
  return lanes;
}
