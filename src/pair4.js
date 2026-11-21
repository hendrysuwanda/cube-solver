// 4x4 edge pairing (centres must already be solved; they stay solved).
// Moves used: outer face turns, plus "slice macros"  S (X Y X') S'  where S is an inner U/D slice turn,
// X a side-face turn and Y a U/D turn. X Y X' restores every side-centre, so the macro keeps centres solved
// while moving one wing of a dedge relative to its twin.
import { WPERM, WING_POS } from './geo4.js';
import { invertMove } from './model.js';

const slotKey = (p) => p.map((v) => (Math.abs(v) === 1 ? 0 : v)).join(',');
const SLOT = WING_POS.map(slotKey);
const SLOTS = [...new Set(SLOT)];
const SLOT_POS = SLOTS.map((k) => WING_POS.map((_, i) => i).filter((i) => SLOT[i] === k));
const DEDGE = WING_POS.map((_, i) => SLOTS.indexOf(SLOT[i])); // home slot of piece i

function compose(seq) {
  let a = [...Array(24).keys()]; // a[i] = where the piece starting at i ends up
  for (const m of seq) { const p = WPERM[m]; a = a.map((x) => p[x]); }
  return a;
}
const OUTER = [];
for (const f of 'URFDLB') for (const s of ['', "'", '2']) OUTER.push(f + s);
const SIDE = [];
for (const f of 'RFLB') for (const s of ['', "'", '2']) SIDE.push(f + s);
const UDT = [];
for (const f of 'UD') for (const s of ['', "'", '2']) UDT.push(f + s);
const SLICE = ['2U', "2U'", '2U2', '2D', "2D'", '2D2'];

const MACROS = [];
for (const S of SLICE) for (const X of SIDE) for (const Y of UDT) {
  const seq = [S, X, Y, invertMove(X), invertMove(S)];
  MACROS.push({ seq, perm: compose(seq) });
}
// edge-flip triggers (R U R' F R' F' R and mirror, around all four sides, top or bottom): fix last-edge cases
const ROT_Y = { R: 'B', B: 'L', L: 'F', F: 'R', U: 'U', D: 'D' };
const FLIP_X = { U: 'D', D: 'U', R: 'R', L: 'L', F: 'F', B: 'B' }; // upside-down copy (x2-like relabel, mirrored turn)
const rotSeq = (seq, map) => seq.map((m) => map[m[0]] + m.slice(1));
const flipSeq = (seq) => seq.map((m) => FLIP_X[m[0]] + (m.endsWith('2') ? '2' : m.endsWith("'") ? '' : "'"));
const FLIPS = [];
for (let base of [["R", "U", "R'", "F", "R'", "F'", "R"], ["L'", "U'", "L", "F'", "L", "F", "L'"]]) {
  for (const b of [base, flipSeq(base)]) {
    let cur = b;
    for (let k = 0; k < 4; k++) { FLIPS.push(cur); cur = rotSeq(cur, ROT_Y); }
  }
}
for (const S of SLICE) for (const T of FLIPS) {
  const seq = [S, ...T, invertMove(S)];
  MACROS.push({ seq, perm: compose(seq) });
}
// freeslice: two triggers inside one slice offset (built lazily, used only when single macros don't help)
let MACROS2 = null;
function macros2() {
  if (MACROS2) return MACROS2;
  MACROS2 = [];
  const TRIG = [];
  for (const X of SIDE) for (const Y of UDT) TRIG.push([X, Y, invertMove(X)]);
  for (const S of SLICE) for (const t1 of TRIG) for (const t2 of TRIG) {
    if (t1[0][0] === t2[0][0]) continue;
    const seq = [S, ...t1, ...t2, invertMove(S)];
    MACROS2.push({ seq, perm: compose(seq) });
  }
  return MACROS2;
}
const PREFIX = [[]];
for (const a of OUTER) { PREFIX.push([a]); for (const b of OUTER) if (a[0] !== b[0]) PREFIX.push([a, b]); }
const PREFIX_PERM = PREFIX.map(compose);

const apply = (w, perm) => { const o = new Array(24); for (let i = 0; i < 24; i++) o[perm[i]] = w[i]; return o; };
export function pairedCount(w) {
  let n = 0;
  for (const [a, b] of SLOT_POS) if (DEDGE[w[a]] === DEDGE[w[b]]) n++;
  return n;
}
export const allPaired = (w) => pairedCount(w) === 12;

// Greedy search: each round pick (outer prefix + macro [+ second macro]) with the best pairs-gained per move.
export function pairEdges(w0) {
  let w = w0.slice();
  const out = [];
  for (let round = 0; round < 30 && pairedCount(w) < 12; round++) {
    const base = pairedCount(w);
    let best = null;
    for (let pi = 0; pi < PREFIX.length; pi++) {
      const wp = apply(w, PREFIX_PERM[pi]);
      for (const mc of MACROS) {
        const wm = apply(wp, mc.perm);
        const gain = pairedCount(wm) - base;
        if (gain <= 0) continue;
        const cost = PREFIX[pi].length + mc.seq.length;
        const score = gain / cost;
        if (!best || score > best.score) best = { score, seq: PREFIX[pi].concat(mc.seq), w: wm };
      }
    }
    if (!best) {
      for (let pi = 0; pi < 19; pi++) {
        const wp = apply(w, PREFIX_PERM[pi]);
        for (const mc of macros2()) {
          const wm = apply(wp, mc.perm);
          const gain = pairedCount(wm) - base;
          if (gain <= 0) continue;
          const cost = PREFIX[pi].length + mc.seq.length;
          const score = gain / cost;
          if (!best || score > best.score) best = { score, seq: PREFIX[pi].concat(mc.seq), w: wm };
        }
      }
    }
    if (!best) {
      // still nothing: look two macros deep (rare last-edge cases)
      for (let pi = 0; pi < 19 && !best; pi++) {
        const wp = apply(w, PREFIX_PERM[pi]);
        for (const m1 of MACROS) {
          const w1 = apply(wp, m1.perm);
          for (let qi = 0; qi < PREFIX.length && qi < 19; qi++) {
            const wq = apply(w1, PREFIX_PERM[qi]);
            for (const m2 of MACROS) {
              const w2 = apply(wq, m2.perm);
              const gain = pairedCount(w2) - base;
              if (gain <= 0) continue;
              const cost = PREFIX[pi].length + m1.seq.length + PREFIX[qi].length + m2.seq.length;
              const score = gain / cost;
              if (!best || score > best.score) best = { score, seq: PREFIX[pi].concat(m1.seq, PREFIX[qi], m2.seq), w: w2 };
            }
          }
        }
      }
    }
    if (!best) throw new Error('pairing stuck at ' + base);
    out.push(...best.seq);
    w = best.w;
  }
  if (pairedCount(w) < 12) throw new Error('pairing failed');
  return out;
}
