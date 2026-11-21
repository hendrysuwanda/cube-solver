// Photo scanning: face order/orientation, colour sampling and colour classification.
import { NORMALS } from './model.js';

// Order the user scans faces, with how to hold the cube for each.
// For each face: image cell (row i, col j) -> cubie position on that face (Kociemba layout).
export const SCAN_ORDER = ['F', 'R', 'B', 'L', 'U', 'D'];
export const SCAN_TEXT = {
  odd: {
    F: 'Hijau menghadap kamera, putih di atas.',
    R: 'Putar seluruh kubus ke kiri: merah menghadap kamera, putih tetap di atas.',
    B: 'Putar ke kiri lagi: biru menghadap kamera, putih di atas.',
    L: 'Putar ke kiri lagi: oranye menghadap kamera, putih di atas.',
    U: 'Kembali hijau di depan, lalu miringkan kubus: putih menghadap kamera, biru di atas.',
    D: 'Kembali hijau di depan, miringkan ke arah lain: kuning menghadap kamera, hijau di atas.',
  },
  even: {
    F: 'Pilih satu sisi sebagai "depan" dan hadapkan ke kamera. Ingat sisi mana yang di atas.',
    R: 'Putar seluruh kubus ke kiri (sisi kanan jadi menghadap kamera). Atas tetap di atas.',
    B: 'Putar ke kiri lagi. Atas tetap di atas.',
    L: 'Putar ke kiri lagi. Atas tetap di atas.',
    U: 'Kembali ke posisi awal, lalu miringkan: sisi atas menghadap kamera (sisi depan jadi di bawah foto).',
    D: 'Kembali ke posisi awal, miringkan ke arah lain: sisi bawah menghadap kamera (sisi depan jadi di atas foto).',
  },
};
export const FACE_LABEL = { F: 'Depan', R: 'Kanan', B: 'Belakang', L: 'Kiri', U: 'Atas', D: 'Bawah' };

export function cellPos(face, i, j, N) {
  const M = N - 1;
  const a = -M + 2 * j;  // column, left -> right
  const r = M - 2 * i;   // row, top -> bottom
  switch (face) {
    case 'F': return [a, r, M];
    case 'R': return [M, r, -a];
    case 'B': return [-a, r, -M];
    case 'L': return [-M, r, a];
    case 'U': return [a, M, -r];
    case 'D': return [a, -M, r];
  }
}
export const faceNormal = (f) => NORMALS[f];

// ---------- colour maths ----------
function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function rgbToLab([r, g, b]) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// Sample the median colour of the inner part of each grid cell.
// data: RGBA Uint8ClampedArray of an image w x h; grid: {x, y, size} in image pixels.
export function sampleGrid(data, w, h, grid, N) {
  const cell = grid.size / N;
  const out = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const cx = grid.x + (j + 0.5) * cell, cy = grid.y + (i + 0.5) * cell;
      const half = cell * 0.22;
      const rs = [], gs = [], bs = [];
      const stepPx = Math.max(1, Math.floor(half / 6));
      for (let y = Math.round(cy - half); y <= cy + half; y += stepPx) {
        for (let x = Math.round(cx - half); x <= cx + half; x += stepPx) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const k = (y * w + x) * 4;
          rs.push(data[k]); gs.push(data[k + 1]); bs.push(data[k + 2]);
        }
      }
      const med = (a) => { if (!a.length) return 0; a.sort((p, q) => p - q); return a[a.length >> 1]; };
      out.push([med(rs), med(gs), med(bs)]);
    }
  }
  return out; // row-major N*N rgb
}

// Typical sticker colours (for even cubes, where there are no fixed centres).
const REF_RGB = { U: [235, 235, 230], R: [190, 30, 40], F: [20, 150, 80], D: [240, 210, 30], L: [255, 120, 20], B: [20, 80, 190] };
const LETTERS = ['U', 'R', 'F', 'D', 'L', 'B'];
const REF_LAB = Object.fromEntries(LETTERS.map((l) => [l, rgbToLab(REF_RGB[l])]));

function dist(a, b) {
  // lightness matters less than chroma under uneven lighting
  const dl = (a[0] - b[0]) * 0.6, da = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((v, i) => { for (const p of permutations(arr.slice(0, i).concat(arr.slice(i + 1)))) out.push([v, ...p]); });
  return out;
}

// faces: { F: [rgb...N*N], R: ..., ... } -> { letters: {F: [...]}, doubt: {F: [bool...]} }
// Per-photo brightness normalisation: lighting differs between the six photos.
export function normalise(px) {
  const lum = px.map((p) => Math.max(...p)).sort((a, b) => a - b);
  const ref = lum[Math.floor(lum.length * 0.9)] || 1;
  const k = Math.min(3, 230 / ref);
  return px.map((p) => p.map((v) => Math.min(255, v * k)));
}

export function classify(rawFaces, N) {
  const per = N * N;
  const faces = Object.fromEntries(Object.entries(rawFaces).map(([f, px]) => [f, normalise(px)]));
  const items = [];
  for (const f of SCAN_ORDER) faces[f].forEach((rgb, k) => items.push({ f, k, lab: rgbToLab(rgb) }));
  const center = N % 2 === 1 ? ((N - 1) / 2) * N + (N - 1) / 2 : -1;

  // initial centroids, one cluster per letter
  let cent = {};
  if (center >= 0) {
    // odd cube: the centre sticker of each scanned face defines that face's colour (scan order = face letter)
    for (const it of items) if (it.k === center) cent[it.f] = it.lab.slice();
  } else {
    for (const l of LETTERS) cent[l] = REF_LAB[l].slice();
  }

  let assign = new Array(items.length);
  for (let iter = 0; iter < 8; iter++) {
    // balanced greedy assignment: every colour gets exactly N*N stickers
    const pairs = [];
    items.forEach((it, idx) => {
      for (const l of LETTERS) pairs.push([dist(it.lab, cent[l]), idx, l]);
    });
    pairs.sort((a, b) => a[0] - b[0]);
    const cap = Object.fromEntries(LETTERS.map((l) => [l, per]));
    const done = new Array(items.length).fill(false);
    if (center >= 0) items.forEach((it, idx) => { if (it.k === center) { assign[idx] = it.f; done[idx] = true; cap[it.f]--; } });
    for (const [, idx, l] of pairs) {
      if (done[idx] || cap[l] === 0) continue;
      assign[idx] = l; done[idx] = true; cap[l]--;
    }
    // recompute centroids
    const next = {};
    for (const l of LETTERS) {
      const m = items.filter((_, idx) => assign[idx] === l).map((it) => it.lab);
      next[l] = [0, 1, 2].map((c) => m.reduce((s, v) => s + v[c], 0) / m.length);
    }
    cent = next;
  }

  // even cube: clusters were seeded by reference colours, but re-label by best global match
  let relabel = Object.fromEntries(LETTERS.map((l) => [l, l]));
  if (center < 0) {
    let best = Infinity;
    for (const p of permutations(LETTERS)) {
      let s = 0;
      LETTERS.forEach((l, i) => { s += dist(cent[l], REF_LAB[p[i]]); });
      if (s < best) { best = s; relabel = Object.fromEntries(LETTERS.map((l, i) => [l, p[i]])); }
    }
  }

  const letters = {}, doubt = {};
  for (const f of SCAN_ORDER) { letters[f] = new Array(per); doubt[f] = new Array(per).fill(false); }
  items.forEach((it, idx) => {
    const l = assign[idx];
    letters[it.f][it.k] = relabel[l];
    // doubtful if another cluster is almost as close as the chosen one
    const d0 = dist(it.lab, cent[l]);
    let d1 = Infinity;
    for (const o of LETTERS) if (o !== l) d1 = Math.min(d1, dist(it.lab, cent[o]));
    doubt[it.f][it.k] = it.k !== center && d1 < d0 * 1.6;
  });
  return { letters, doubt };
}

// Write classified colours into a cube model (stickers keyed by position + face normal).
export function applyScan(cube, result) {
  const N = cube.N;
  for (const f of SCAN_ORDER) {
    const n = NORMALS[f];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const p = cellPos(f, i, j, N);
      const c = cube.cubies.find((q) => q.pos[0] === p[0] && q.pos[1] === p[1] && q.pos[2] === p[2]);
      const s = c.stickers.find((st) => st.normal[0] === n[0] && st.normal[1] === n[1] && st.normal[2] === n[2]);
      s.color = result.letters[f][i * N + j];
      s.doubt = result.doubt[f][i * N + j];
    }
  }
}

// Provisional per-face classification while scanning one face at a time.
// known: [{lab, letter}] samples from faces the user already confirmed (their corrections included).
// centreLetter: for odd cubes, the letter the centre of this face must be (scan order fixes it).
export function classifyFace(rgbs, N, known, centreLetter) {
  const labs = normalise(rgbs).map(rgbToLab);
  const cent = {};
  for (const l of LETTERS) {
    const m = known.filter((k) => k.letter === l).map((k) => k.lab);
    const ref = REF_LAB[l];
    if (!m.length) { cent[l] = ref.slice(); continue; }
    const mean = [0, 1, 2].map((c) => m.reduce((s, v) => s + v[c], 0) / m.length);
    const w = Math.min(1, m.length / 3); // trust learned colour more as samples accumulate
    cent[l] = mean.map((v, c) => v * w + ref[c] * (1 - w));
  }
  const center = N % 2 === 1 ? ((N - 1) / 2) * N + (N - 1) / 2 : -1;
  if (center >= 0 && centreLetter) {
    // the centre sticker tells us exactly what this face's own colour looks like in this photo
    cent[centreLetter] = labs[center].slice();
  }
  return labs.map((lab, k) => {
    if (k === center && centreLetter) return { letter: centreLetter, lab, doubt: false };
    let best = null, d0 = Infinity, d1 = Infinity;
    for (const l of LETTERS) {
      const d = dist(lab, cent[l]);
      if (d < d0) { d1 = d0; d0 = d; best = l; } else if (d < d1) d1 = d;
    }
    return { letter: best, lab, doubt: d1 < d0 * 1.6 };
  });
}
