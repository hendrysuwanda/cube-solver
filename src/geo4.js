// 4x4 geometry: center/wing positions and their permutations under all 36 moves.
import { FACES, NORMALS, rot, dot, cross, eq, parseMove, movesFor } from './model.js';

export const MOVES4 = movesFor(4); // 36: outer + "2X" inner slices

export const CENTER_POS = [];
export const CENTER_FACE = [];
for (const f of FACES) {
  const n = NORMALS[f];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const p = n.map((v) => v * 3);
    const free = [0, 1, 2].filter((i) => n[i] === 0);
    p[free[0]] = a; p[free[1]] = b;
    CENTER_POS.push(p);
    CENTER_FACE.push(f);
  }
}

export const WING_POS = [];
for (const x of [-3, -1, 1, 3]) for (const y of [-3, -1, 1, 3]) for (const z of [-3, -1, 1, 3]) {
  const p = [x, y, z];
  const outer = p.filter((v) => Math.abs(v) === 3).length;
  if (outer === 2) WING_POS.push(p);
}
// ordered face normals (chirality) for each wing position
export const WING_NORMALS = WING_POS.map((p) => {
  const ns = [0, 1, 2].filter((i) => Math.abs(p[i]) === 3).map((i) => { const n = [0, 0, 0]; n[i] = Math.sign(p[i]); return n; });
  return dot(cross(ns[0], ns[1]), p) > 0 ? ns : [ns[1], ns[0]];
});
const faceOf = (n) => FACES.find((f) => eq(NORMALS[f], n));
export const WING_HOME_KEY = WING_NORMALS.map((ns) => faceOf(ns[0]) + faceOf(ns[1]));

function permFor(positions, m) {
  const mv = parseMove(m);
  const layer = 3 - 2 * mv.depth;
  return positions.map((p) => {
    if (dot(p, mv.axis) !== layer) return positions.indexOf(p);
    const np = rot(p, mv.axis, mv.quarter);
    return positions.findIndex((q) => eq(q, np));
  });
}
// perm[m][i] = j : piece at position i moves to position j
export const CPERM = {}, WPERM = {};
for (const m of MOVES4) { CPERM[m] = permFor(CENTER_POS, m); WPERM[m] = permFor(WING_POS, m); }

export function readCenters(cube) {
  return CENTER_POS.map((p) => {
    const c = cube.cubies.find((q) => eq(q.pos, p));
    return c.stickers[0].color;
  });
}

// wing piece ids (= home position index) by position, or null if invalid
export function readWings(cube) {
  const map = {};
  WING_HOME_KEY.forEach((k, i) => { map[k] = i; });
  const out = WING_POS.map((p, i) => {
    const c = cube.cubies.find((q) => eq(q.pos, p));
    const [n0, n1] = WING_NORMALS[i];
    const s0 = c.stickers.find((s) => eq(s.normal, n0)), s1 = c.stickers.find((s) => eq(s.normal, n1));
    const id = map[s0.color + s1.color];
    return id === undefined ? -1 : id;
  });
  if (out.includes(-1) || new Set(out).size !== 24) return null;
  return out;
}

export function permParity(perm) {
  const seen = new Array(perm.length).fill(false);
  let p = 0;
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0, j = i;
    while (!seen[j]) { seen[j] = true; j = perm[j]; len++; }
    p += len - 1;
  }
  return p % 2;
}
