import Cube from 'cubejs';
import 'cubejs/lib/solve.js';
import { toFacelets3, colorCounts, isSolved } from './model.js';
import { initCorners, readCorners, cornersValid, solveCorners } from './corners.js';
import { init4, validate4, solve4 } from './solver4.js';

const ready = { 2: false, 3: false, 4: false };
function init(n) {
  if (ready[n]) return;
  if (n === 2) initCorners();
  if (n === 3) Cube.initSolver();
  if (n === 4) init4();
  ready[n] = true;
}

function parity(perm) {
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
const isPerm = (arr, n) =>
  arr.length === n && new Set(arr).size === n && arr.every((v) => Number.isInteger(v) && v >= 0 && v < n);

export function validate3(facelets) {
  let c;
  try { c = Cube.fromString(facelets); } catch (e) { return { ok: false, reason: 'piece' }; }
  if (!isPerm(c.cp, 8) || !isPerm(c.ep, 12)) return { ok: false, reason: 'piece' };
  if (c.asString() !== facelets) return { ok: false, reason: 'piece' };
  if (c.co.reduce((a, b) => a + b, 0) % 3) return { ok: false, reason: 'corner' };
  if (c.eo.reduce((a, b) => a + b, 0) % 2) return { ok: false, reason: 'edge' };
  if (parity(c.cp) !== parity(c.ep)) return { ok: false, reason: 'parity' };
  return { ok: true, cube: c };
}

function solve(cube) {
  const N = cube.N;
  const counts = colorCounts(cube);
  for (const f of 'URFDLB') if (counts[f] !== N * N) return { reason: 'count' };
  if (isSolved(cube)) return { moves: [] };
  init(N);
  if (N === 3) {
    const v = validate3(toFacelets3(cube));
    if (!v.ok) return { reason: v.reason };
    const sol = v.cube.solve(22).trim();
    return { moves: sol ? sol.split(/\s+/) : [] };
  }
  if (N === 2) {
    const st = readCorners(cube);
    if (!st) return { reason: 'piece' };
    if (!cornersValid(st)) return { reason: 'corner' };
    return { moves: solveCorners(st) };
  }
  const bad = validate4(cube);
  if (bad) return { reason: bad };
  return solve4(cube);
}

if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.onmessage = (e) => {
    const { type, cube, id, size } = e.data;
    try {
      if (type === 'init') { init(size); self.postMessage({ type: 'ready', size }); return; }
      if (type === 'solve') {
        const r = solve(cube);
        if (r.reason) self.postMessage({ type: 'invalid', id, reason: r.reason });
        else self.postMessage({ type: 'solution', id, moves: r.moves, phases: r.phases || null });
      }
    } catch (err) {
      self.postMessage({ type: 'error', id, message: String(err && err.message || err) });
    }
  };
}
