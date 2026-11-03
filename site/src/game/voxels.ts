import model from "./shotgun.json";

export type Rgb = readonly [number, number, number];
export type Vec3 = readonly [number, number, number];

export interface Face {
  corners: readonly [Vec3, Vec3, Vec3, Vec3];
  normal: Vec3;
  color: Rgb;
}

// The engine builds weapon voxels as these blocks, with these view colors (mesh_view.hpp).
const WOOD: Rgb = [0.34, 0.22, 0.12];
const GIRDER: Rgb = [0.28, 0.1, 0.08];
const SHEET_METAL: Rgb = [0.48, 0.5, 0.52];

function materialColor(name: string): Rgb {
  if (name === "treated_wood") return WOOD;
  if (name === "girder") return GIRDER;
  return SHEET_METAL;
}

const DIRECTIONS: readonly { normal: Vec3; corners: readonly [Vec3, Vec3, Vec3, Vec3] }[] = [
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { normal: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { normal: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { normal: [0, -1, 0], corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  { normal: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
];

export function cubeFaces(x: number, y: number, z: number, size: number, color: Rgb): Face[] {
  return DIRECTIONS.map(({ normal, corners }) => ({
    normal,
    color,
    corners: corners.map(([a, b, c]) => [x + a * size, y + b * size, z + c * size] as Vec3) as unknown as Face["corners"]
  }));
}

/** Only the faces that can be seen: a face between two solid voxels never draws. */
function buildShotgun(): Face[] {
  const solid = new Map<string, Rgb>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const { runs, palette } = model;
  for (let i = 0; i < runs.length; i += 5) {
    const [y, z, x0, length, material] = runs.slice(i, i + 5) as [number, number, number, number, number];
    for (let x = x0; x < x0 + length; x++) solid.set(key(x, y, z), materialColor(palette[material]!));
  }
  const faces: Face[] = [];
  for (const [position, color] of solid) {
    const [x, y, z] = position.split(",").map(Number) as [number, number, number];
    for (const face of cubeFaces(x, y, z, 1, color)) {
      const [nx, ny, nz] = face.normal;
      if (!solid.has(key(x + nx, y + ny, z + nz))) faces.push(face);
    }
  }
  return faces;
}

export const SHOTGUN = buildShotgun();
export const PIVOT = model.pivot as unknown as Vec3;
/** One voxel past the end of the model, at barrel height. */
export const MUZZLE: Vec3 = [model.dims[0]!, model.sight[1]! - 1, model.sight[2]! + 0.5];
