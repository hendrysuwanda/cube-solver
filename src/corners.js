// Corner solver shared by 2x2 and 4x4.
// Step 1: bring the DLB corner home (short BFS over 24 states, all 18 outer moves).
// Step 2: optimal solve of the remaining 7 corners with <U,R,F> via a full BFS distance table (3,674,160 states).
import { FACES, NORMALS, rot, dot, cross, eq } from './model.js';

const POS = []; // 8 corner positions as sign vectors; index 7 = DLB
for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) POS.push([x, y, z]);
POS.sort((a, b) => (eq(a, [-1, -1, -1]) ? 1 : 0) - (eq(b, [-1, -1, -1]) ? 1 : 0));
const DLB = 7;
const posIndex = (p) => POS.findIndex((q) => eq(q, p));

// Clockwise-ordered face normals for a corner position, starting with its U/D face.
function order(p) {
  const n0 = [0, p[1], 0], a = [p[0], 0, 0], b = [0, 0, p[2]];
  return dot(cross(n0, a), p) > 0 ? [n0, a, b] : [n0, b, a];
}
const ORDER = POS.map(order);

const OUTER = [];
for (const f of FACES) for (const s of ['', "'", '2']) OUTER.push(f + s);
const URF = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2'];

function moveParts(m) {
  const axis = NORMALS[m[0]];
  const q = m.endsWith("'") ? 1 : m.endsWith('2') ? -2 : -1;
  return { axis, q };
}

// (pos, ori) -> (pos', ori') for each move
const T = {};
for (const m of OUTER) {
  const { axis, q } = moveParts(m);
  const pt = [];
  for (let p = 0; p < 8; p++) {
    const row = [];
    for (let o = 0; o < 3; o++) {
      if (dot(POS[p], axis) !== 1) { row.push([p, o]); continue; }
      const np = posIndex(rot(POS[p], axis, q));
      const nn = rot(ORDER[p][o], axis, q);
      row.push([np, ORDER[np].findIndex((v) => eq(v, nn))]);
    }
    pt.push(row);
  }
  T[m] = pt;
}

// state: perm[pos] = piece (home index), ori[pos]
function applyState(st, m) {
  const t = T[m];
  const perm = new Array(8), ori = new Array(8);
  for (let p = 0; p < 8; p++) {
    const [np, no] = t[p][st.ori[p]];
    perm[np] = st.perm[p];
    ori[np] = no;
  }
  return { perm, ori };
}

// ---- coordinates for 7 corners (DLB solved) ----
const FACT = [1, 1, 2, 6, 24, 120, 720, 5040];
function rankPerm(a) { // a: permutation of 0..6
  let r = 0;
  for (let i = 0; i < 7; i++) {
    let s = 0;
    for (let j = i + 1; j < 7; j++) if (a[j] < a[i]) s++;
    r += s * FACT[6 - i];
  }
  return r;
}
function unrankPerm(r) {
  const avail = [0, 1, 2, 3, 4, 5, 6], out = [];
  for (let i = 0; i < 7; i++) {
    const f = FACT[6 - i], k = Math.floor(r / f);
    r %= f;
    out.push(avail.splice(k, 1)[0]);
  }
  return out;
}
const rankOri = (o) => { let r = 0; for (let i = 0; i < 6; i++) r = r * 3 + o[i]; return r; };
function unrankOri(r) {
  const o = new Array(7);
  let s = 0;
  for (let i = 5; i >= 0; i--) { o[i] = r % 3; r = Math.floor(r / 3); s += o[i]; }
  o[6] = (3 - (s % 3)) % 3;
  return o;
}

let dist = null, cpMove = null, coMove = null;
const NCP = 5040, NCO = 729;

export function initCorners() {
  if (dist) return;
  cpMove = new Uint16Array(NCP * 9);
  coMove = new Uint16Array(NCO * 9);
  for (let i = 0; i < NCP; i++) {
    const perm = unrankPerm(i).concat([7]);
    URF.forEach((m, k) => {
      const s = applyState({ perm, ori: new Array(8).fill(0) }, m);
      cpMove[i * 9 + k] = rankPerm(s.perm.slice(0, 7));
    });
  }
  for (let i = 0; i < NCO; i++) {
    const ori = unrankOri(i).concat([0]);
    URF.forEach((m, k) => {
      const s = applyState({ perm: [0, 1, 2, 3, 4, 5, 6, 7], ori }, m);
      coMove[i * 9 + k] = rankOri(s.ori);
    });
  }
  const N = NCP * NCO;
  dist = new Uint8Array(N).fill(255);
  dist[0] = 0;
  let frontier = new Int32Array([0]), depth = 0;
  while (frontier.length) {
    const next = [];
    for (const idx of frontier) {
      const cp = Math.floor(idx / NCO), co = idx % NCO;
      for (let k = 0; k < 9; k++) {
        const n = cpMove[cp * 9 + k] * NCO + coMove[co * 9 + k];
        if (dist[n] === 255) { dist[n] = depth + 1; next.push(n); }
      }
    }
    frontier = next;
    depth++;
  }
}

// Read corner state from a cube model (any N >= 2). Returns null if invalid pieces.
export function readCorners(cube) {
  const M = cube.N - 1;
  const homeByColors = {};
  POS.forEach((p, i) => {
    const key = ORDER[i].map((n) => FACES.find((f) => eq(NORMALS[f], n))).sort().join('');
    homeByColors[key] = i;
  });
  const perm = new Array(8), ori = new Array(8);
  for (const c of cube.cubies) {
    if (c.stickers.length !== 3) continue;
    const p = posIndex(c.pos.map((v) => Math.sign(v)));
    const key = c.stickers.map((s) => s.color).sort().join('');
    const home = homeByColors[key];
    if (home === undefined) return null;
    const ud = c.stickers.findIndex((s) => s.color === 'U' || s.color === 'D');
    perm[p] = home;
    ori[p] = ORDER[p].findIndex((n) => eq(n, c.stickers[ud].normal));
    void M;
  }
  if (new Set(perm).size !== 8) return null;
  return { perm, ori };
}

export function cornersValid(st) {
  return st && st.ori.reduce((a, b) => a + b, 0) % 3 === 0;
}

export function solveCorners(st) {
  initCorners();
  const moves = [];
  // step 1: DLB piece home
  const where = st.perm.indexOf(DLB);
  const start = [where, st.ori[where]];
  if (!(start[0] === DLB && start[1] === 0)) {
    const seen = new Map([[start.join(), []]]);
    let q = [start];
    let found = null;
    while (q.length && !found) {
      const nq = [];
      for (const s of q) {
        for (const m of OUTER) {
          const n = T[m][s[0]][s[1]];
          const k = n.join();
          if (seen.has(k)) continue;
          const path = seen.get(s.join()).concat([m]);
          seen.set(k, path);
          if (n[0] === DLB && n[1] === 0) { found = path; break; }
          nq.push(n);
        }
        if (found) break;
      }
      q = nq;
    }
    for (const m of found) { st = applyState(st, m); moves.push(m); }
  }
  // step 2: optimal <U,R,F>
  let cp = rankPerm(st.perm.slice(0, 7)), co = rankOri(st.ori);
  let d = dist[cp * NCO + co];
  while (d > 0) {
    for (let k = 0; k < 9; k++) {
      const ncp = cpMove[cp * 9 + k], nco = coMove[co * 9 + k];
      if (dist[ncp * NCO + nco] === d - 1) { moves.push(URF[k]); cp = ncp; co = nco; d--; break; }
    }
  }
  return moves;
}
