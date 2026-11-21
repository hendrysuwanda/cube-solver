// Generic NxN cube model.
// Coordinates are integers in {-(N-1), ..., N-1} with step 2  (x = right/R, y = up/U, z = front/F).
// A move is "R", "R'", "R2" (outer layer) or "2R", "2R'", "2R2" (second layer from that face).
export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
export const NORMALS = {
  U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1],
  D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1],
};

export const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function makeCube(N) {
  const M = N - 1;
  const vals = [];
  for (let k = 0; k < N; k++) vals.push(2 * k - M);
  const cubies = [];
  for (const x of vals) for (const y of vals) for (const z of vals) {
    const pos = [x, y, z];
    if (Math.abs(x) !== M && Math.abs(y) !== M && Math.abs(z) !== M) continue;
    const stickers = [];
    for (const f of FACES) if (dot(pos, NORMALS[f]) === M) stickers.push({ normal: NORMALS[f].slice(), color: f });
    cubies.push({ pos, stickers });
  }
  return { N, cubies };
}

export function cloneCube(c) {
  return { N: c.N, cubies: c.cubies.map((q) => ({ pos: q.pos.slice(), stickers: q.stickers.map((s) => ({ normal: s.normal.slice(), color: s.color })) })) };
}

// Rotate integer vector v around axis (±x/±y/±z) by q CCW quarter turns (right-hand rule).
export function rot(v, axis, q) {
  q = ((q % 4) + 4) % 4;
  let [x, y, z] = v;
  for (let k = 0; k < q; k++) {
    if (axis[0]) { const s = axis[0]; [y, z] = [-s * z, s * y]; }
    else if (axis[1]) { const s = axis[1]; [z, x] = [-s * x, s * z]; }
    else { const s = axis[2]; [x, y] = [-s * y, s * x]; }
  }
  return [x, y, z];
}

export function parseMove(m) {
  let depth = 0, wide = false;
  if (m[0] === '2') { depth = 1; m = m.slice(1); }
  const face = m[0];
  let suf = m.slice(1);
  if (suf[0] === 'w') { wide = true; suf = suf.slice(1); } // Rw = outer + second layer together
  const quarter = suf === "'" ? 1 : suf === '2' ? -2 : -1; // clockwise face turn = -1 CCW quarter
  return { face, depth, wide, axis: NORMALS[face], quarter };
}

export function inLayer(pos, N, mv) {
  const d = dot(pos, mv.axis);
  if (mv.wide) return d === N - 1 || d === N - 3;
  return d === N - 1 - 2 * mv.depth;
}

export function applyMove(cube, m) {
  const mv = typeof m === 'string' ? parseMove(m) : m;
  for (const c of cube.cubies) {
    if (!inLayer(c.pos, cube.N, mv)) continue;
    c.pos = rot(c.pos, mv.axis, mv.quarter);
    for (const s of c.stickers) s.normal = rot(s.normal, mv.axis, mv.quarter);
  }
}

export function applyMoves(cube, moves) { for (const m of moves) applyMove(cube, m); }

export function invertMove(m) {
  if (m.endsWith('2') && m.length > 1 && !(m.length === 2 && m[0] === '2')) return m;
  if (m.endsWith("'")) return m.slice(0, -1);
  return m + "'";
}

export function movesFor(N) {
  const out = [];
  const depths = N >= 4 ? [0, 1] : [0];
  for (const d of depths) for (const f of FACES) for (const s of ['', "'", '2']) out.push((d ? '2' : '') + f + s);
  return out;
}

// Merge/cancel consecutive moves on the same axis (layers on one axis commute).
export function simplify(moves) {
  const axisOf = (m) => { const p = parseMove(m); return 'xyz'[p.axis.findIndex((v) => v !== 0)]; };
  // layer key: axis + signed layer coordinate (so R and 2L are distinct layers on x)
  const layerKey = (p) => {
    const ai = p.axis.findIndex((v) => v !== 0);
    return ai + ':' + p.axis[ai] * (10 - p.depth); // unique per face+depth
  };
  let cur = moves.slice();
  for (let iter = 0; iter < 50; iter++) {
    const out = [];
    let i = 0, changed = false;
    while (i < cur.length) {
      const ax = axisOf(cur[i]);
      let j = i;
      while (j < cur.length && axisOf(cur[j]) === ax) j++;
      if (j - i === 1) { out.push(cur[i]); i = j; continue; }
      const acc = new Map(); // key -> {face, depth, cw quarter turns}
      for (let k = i; k < j; k++) {
        const p = parseMove(cur[k]);
        const key = layerKey(p);
        const e = acc.get(key) || { face: p.face, depth: p.depth, q: 0 };
        e.q += -p.quarter; // clockwise count
        acc.set(key, e);
      }
      const merged = [];
      for (const e of acc.values()) {
        const q = ((e.q % 4) + 4) % 4;
        if (!q) continue;
        merged.push((e.depth ? '2' : '') + e.face + (q === 1 ? '' : q === 2 ? '2' : "'"));
      }
      if (merged.length !== j - i) changed = true;
      out.push(...merged);
      i = j;
    }
    cur = out;
    if (!changed) break;
  }
  return cur;
}

export function findSticker(cube, pos, normal) {
  for (const c of cube.cubies) {
    if (!eq(c.pos, pos)) continue;
    for (const s of c.stickers) if (eq(s.normal, normal)) return s;
  }
  return null;
}

export function colorCounts(cube) {
  const n = {};
  for (const c of cube.cubies) for (const s of c.stickers) n[s.color] = (n[s.color] || 0) + 1;
  return n;
}

export function isSolved(cube) {
  for (const c of cube.cubies) for (const s of c.stickers) {
    const f = FACES.find((F) => eq(NORMALS[F], s.normal));
    if (f !== s.color) return false;
  }
  return true;
}

// ---- 3x3 facelets (Kociemba URFDLB order) for cubejs ----
function faceletPos3(f, i, j) {
  switch (f) {
    case 'U': return [-1 + j, 1, -1 + i];
    case 'R': return [1, 1 - i, 1 - j];
    case 'F': return [-1 + j, 1 - i, 1];
    case 'D': return [-1 + j, -1, 1 - i];
    case 'L': return [-1, 1 - i, -1 + j];
    case 'B': return [1 - j, 1 - i, -1];
  }
}
export function toFacelets3(cube) {
  let out = '';
  for (const f of FACES)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        out += findSticker(cube, faceletPos3(f, i, j).map((v) => 2 * v), NORMALS[f]).color;
  return out;
}
