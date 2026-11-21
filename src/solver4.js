// 4x4 reduction-style solver:
//   1. Centers in 3 table-driven phases (A: U/D colors onto U/D axis, B: L/R colors onto L/R axis, C: solve all).
//   2. Corners with the shared corner solver (outer moves only, keeps centers).
//   3. Wing parity fix (if odd) with a centre/corner-preserving algorithm.
//   4. Wings solved with precomputed centre/corner-preserving 3-cycles (buffer method).
import { makeCube, cloneCube, applyMove, applyMoves, simplify, invertMove, parseMove } from './model.js';
import { CENTER_FACE, CPERM, MOVES4, readCenters, readWings, permParity } from './geo4.js';
import { readCorners, cornersValid, initCorners } from './corners.js';
import Cube from 'cubejs';
import 'cubejs/lib/solve.js';
import { pairEdges } from './pair4.js';
import { toFacelets3, findSticker, NORMALS, FACES } from './model.js';

// ---------- generic mask helpers ----------
function maskOf(colors, pred, positions) {
  let m = 0;
  positions.forEach((p, k) => { if (pred(colors[p])) m |= 1 << k; });
  return m;
}
// Build byte lookup tables for a permutation restricted to `positions` (all positions must map within the set).
function maskTables(moves, positions) {
  const idx = new Map(positions.map((p, k) => [p, k]));
  const nbytes = Math.ceil(positions.length / 8);
  const tabs = {};
  for (const m of moves) {
    const perm = CPERM[m];
    const t = [];
    for (let b = 0; b < nbytes; b++) {
      const arr = new Uint32Array(256);
      for (let v = 0; v < 256; v++) {
        let out = 0;
        for (let bit = 0; bit < 8; bit++) {
          const k = b * 8 + bit;
          if (k >= positions.length || !(v & (1 << bit))) continue;
          const j = idx.get(perm[positions[k]]);
          if (j === undefined) throw new Error('move leaves set: ' + m);
          out |= 1 << j;
        }
        arr[v] = out;
      }
      t.push(arr);
    }
    tabs[m] = t;
  }
  return tabs;
}
function applyMask(t, mask) {
  let o = 0;
  for (let b = 0; b < t.length; b++) o |= t[b][(mask >>> (8 * b)) & 255];
  return o >>> 0;
}
function bfs(size, start, moves, step) {
  const dist = new Uint8Array(size).fill(255);
  dist[start] = 0;
  let frontier = [start], d = 0;
  while (frontier.length) {
    const next = [];
    for (const s of frontier) for (const m of moves) {
      const n = step(s, m);
      if (dist[n] === 255) { dist[n] = d + 1; next.push(n); }
    }
    frontier = next; d++;
  }
  return dist;
}
function descend(dist, s, moves, step) {
  const out = [];
  let d = dist[s];
  if (d === 255) throw new Error('unreachable');
  while (d > 0) {
    let ok = false;
    for (const m of moves) {
      const n = step(s, m);
      if (dist[n] === d - 1) { out.push(m); s = n; d--; ok = true; break; }
    }
    if (!ok) throw new Error('descend stuck');
  }
  return out;
}

// ---------- phase definitions ----------
const ALL = [...Array(24).keys()];
const isUD = (c) => c === 'U' || c === 'D';
const isLR = (c) => c === 'L' || c === 'R';
const UDPOS = ALL.filter((i) => isUD(CENTER_FACE[i]));
const LRPOS = ALL.filter((i) => isLR(CENTER_FACE[i]));
const FBPOS = ALL.filter((i) => CENTER_FACE[i] === 'F' || CENTER_FACE[i] === 'B');
const NONUD = ALL.filter((i) => !isUD(CENTER_FACE[i]));

const MOVES_A = MOVES4;
const MOVES_B = MOVES4.filter((m) => { const p = parseMove(m); return p.depth === 0 || p.face === 'U' || p.face === 'D' || p.quarter === -2; });
const MOVES_C = MOVES4.filter((m) => { const p = parseMove(m); return p.depth === 0 || p.quarter === -2; });

let T = null;
export function init4() {
  if (T) return;
  initCorners();
  Cube.initSolver();
  const tA = maskTables(MOVES_A, ALL);
  const goalA = maskOf(CENTER_FACE, isUD, ALL);
  const distA = bfs(1 << 24, goalA, MOVES_A, (s, m) => applyMask(tA[m], s));

  const tB = maskTables(MOVES_B, NONUD);
  const goalB = maskOf(CENTER_FACE, isLR, NONUD);
  const distB = bfs(1 << 16, goalB, MOVES_B, (s, m) => applyMask(tB[m], s));

  const tU = maskTables(MOVES_C, UDPOS), tL = maskTables(MOVES_C, LRPOS), tF = maskTables(MOVES_C, FBPOS);
  const stepC = (s, m) => (applyMask(tU[m], s >>> 16) << 16) | (applyMask(tL[m], (s >>> 8) & 255) << 8) | applyMask(tF[m], s & 255);
  const keyC = (colors) => (maskOf(colors, (c) => c === 'U', UDPOS) << 16) | (maskOf(colors, (c) => c === 'L', LRPOS) << 8) | maskOf(colors, (c) => c === 'F', FBPOS);
  const goalC = keyC(CENTER_FACE);
  const distC = bfs(1 << 24, goalC, MOVES_C, stepC);
  T = { tA, distA, tB, distB, stepC, keyC, distC };
}

function solveCenters(cube) {
  const out = [];
  let colors = readCenters(cube);
  const sA = descend(T.distA, maskOf(colors, isUD, ALL), MOVES_A, (s, m) => applyMask(T.tA[m], s));
  applyMoves(cube, sA); out.push(...sA);
  colors = readCenters(cube);
  const sB = descend(T.distB, maskOf(colors, isLR, NONUD), MOVES_B, (s, m) => applyMask(T.tB[m], s));
  applyMoves(cube, sB); out.push(...sB);
  colors = readCenters(cube);
  const sC = descend(T.distC, T.keyC(colors), MOVES_C, T.stepC);
  applyMoves(cube, sC); out.push(...sC);
  return out;
}

// ---------- validation + full solve ----------
export function validate4(cube) {
  const counts = {};
  for (const c of readCenters(cube)) counts[c] = (counts[c] || 0) + 1;
  if (!'URFDLB'.split('').every((f) => counts[f] === 4)) return 'centers';
  const st = readCorners(cube);
  if (!st) return 'piece';
  if (!cornersValid(st)) return 'corner';
  if (!readWings(cube)) return 'wing';
  return null;
}

const OLL_PARITY = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2".split(' '); // flips the UF dedge
const PLL_PARITY = "2R2 U2 2R2 Uw2 2R2 2U2".split(' ');                          // swaps UF and UB dedges

// View a reduced 4x4 (centres solved, edges paired) as a 3x3 and return its facelet string.
function reducedFacelets(cube4) {
  const c3 = makeCube(3);
  const to4 = (v) => (v === 0 ? 1 : v * 1.5);
  for (const q of c3.cubies) for (const s of q.stickers) {
    if (q.stickers.length === 1) { s.color = FACES.find((f) => NORMALS[f].every((v, i) => v === s.normal[i])); continue; }
    s.color = findSticker(cube4, q.pos.map(to4), s.normal).color;
  }
  return toFacelets3(c3);
}
function permParity8(p) { return permParity(p); }

export function solve4(input) {
  init4();
  const cube = cloneCube(input);
  const phases = [];
  const add = (label, mv) => {
    const m = simplify(mv);
    if (m.length) phases.push({ label, moves: m });
  };
  // 1. centres
  const centres = solveCenters(cube);
  add('Pusat', centres);
  // 2. pair edges (centres stay solved)
  const pair = pairEdges(readWings(cube));
  applyMoves(cube, pair);
  add('Pasang edge', pair);
  // 3. parity fixes, then solve as 3x3
  const par = [];
  for (let k = 0; k < 3; k++) {
    const c3 = Cube.fromString(reducedFacelets(cube));
    if (c3.eo.reduce((a, b) => a + b, 0) % 2) { applyMoves(cube, OLL_PARITY); par.push(...OLL_PARITY); continue; }
    if (permParity8(c3.cp) !== permParity(c3.ep)) { applyMoves(cube, PLL_PARITY); par.push(...PLL_PARITY); continue; }
    break;
  }
  add('Parity', par);
  const c3 = Cube.fromString(reducedFacelets(cube));
  const sol = c3.isSolved() ? '' : c3.solve(22).trim();
  const tail = sol ? sol.split(/\s+/) : [];
  applyMoves(cube, tail);
  add('Seperti 3×3', tail);
  return { moves: phases.flatMap((p) => p.moves), phases: phases.map((p) => ({ label: p.label, count: p.moves.length })) };
}

export { invertMove, makeCube, applyMove };
