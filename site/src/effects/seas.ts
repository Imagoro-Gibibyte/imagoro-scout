import type { MicroSlatsProps } from "./MicroSlats.jsx";

// MicroSlats backdrops, keyed by route.
export const SEAS: Record<string, MicroSlatsProps> = {
  "/": {
    backgroundColor: "#000000",
    color: "#00c9c7",
    cursorSize: 20,
    cursorStrength: 2,
    fog: 0,
    gap: 1,
    glint: 0,
    glintColor: "#ba3737",
    interactive: true,
    lean: 1,
    perspective: 1,
    preset: "swell",
    roundness: 1,
    slatHeight: 38,
    slatWidth: 2,
    speed: 3,
    stretch: 0.55,
    swirl: 0,
    trail: 4
  },
  "/services": {
    backgroundColor: "#000000",
    color: "#00c9c7",
    chop: 0.6,
    contrast: 1.2,
    cursorSize: 20,
    cursorStrength: 2,
    fog: 0,
    gap: 5,
    glint: 0.25,
    glintColor: "#ba3737",
    interactive: true,
    lean: 1,
    perspective: 0,
    preset: "signal",
    roundness: 1,
    scale: 0.85,
    slatHeight: 64,
    slatWidth: 2,
    speed: 1.2,
    stretch: 0.85,
    swirl: 0,
    trail: 4
  },
  "/insights": {
    backgroundColor: "#000000",
    color: "#00c9c7",
    chop: 1,
    contrast: 1.8,
    cursorSize: 20,
    cursorStrength: 2,
    direction: 236,
    fog: 0.35,
    gap: 1,
    glint: 1.3,
    glintColor: "#ba3737",
    interactive: true,
    lean: 1,
    perspective: 0.8,
    preset: "storm",
    roundness: 1,
    scale: 0.55,
    slatHeight: 38,
    slatWidth: 2,
    speed: 1.6,
    stretch: 0.3,
    swirl: 0,
    trail: 4
  }
};

/** Calmer than the routes above, because these pages are mostly reading. Any other route uses this too. */
export const DEFAULT_SEA: MicroSlatsProps = {
  backgroundColor: "#000000",
  color: "#075c5b",
  cursorSize: 20,
  cursorStrength: 2,
  fog: 0.2,
  gap: 3,
  glint: 0,
  interactive: true,
  lean: 1,
  preset: "tide",
  roundness: 1,
  slatHeight: 52,
  slatWidth: 2,
  speed: 0.5,
  trail: 4
};

SEAS["/skills"] = { ...DEFAULT_SEA, gap: 2, preset: "swell", speed: 0.8 };
SEAS["/devlog"] = { ...DEFAULT_SEA, gap: 5, slatHeight: 38 };
SEAS["/contact"] = { ...DEFAULT_SEA, preset: "signal", speed: 0.8 };
SEAS["/term"] = { ...DEFAULT_SEA, speed: 0.3 };
