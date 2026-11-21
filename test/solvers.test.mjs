// Solver regression tests: random scrambles must be solved, and the 4x4 must stay reasonably short.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Cube from 'cubejs';
import 'cubejs/lib/solve.js';
import * as M from '../src/model.js';
import { readCorners, solveCorners } from '../src/corners.js';
import { solve4, init4 } from '../src/solver4.js';
import { classify, applyScan, cellPos, SCAN_ORDER } from '../src/scan.js';

const scramble = (N, n) => {
  const c = M.makeCube(N), all = M.movesFor(N);
  for (let i = 0; i < n; i++) M.applyMove(c, all[Math.floor(Math.random() * all.length)]);
  return c;
};

test('model moves match cubejs (3x3)', () => {
  for (const m of M.movesFor(3)) {
    const c = M.makeCube(3); M.applyMove(c, m);
    const ref = new Cube(); ref.move(m);
    assert.equal(M.toFacelets3(c), ref.asString(), m);
  }
});

test('2x2 solver', () => {
  for (let t = 0; t < 50; t++) {
    const c = scramble(2, 30);
    const sol = solveCorners(readCorners(c));
    M.applyMoves(c, sol);
    assert.ok(M.isSolved(c));
    assert.ok(sol.length <= 14);
  }
});

test('4x4 solver', () => {
  init4();
  let total = 0;
  for (let t = 0; t < 25; t++) {
    const c = scramble(4, 60);
    const r = solve4(c);
    M.applyMoves(c, r.moves);
    assert.ok(M.isSolved(c));
    total += r.moves.length;
  }
  assert.ok(total / 25 < 110, 'average 4x4 solution should stay well under 110 moves');
});

test('colour classification from synthetic photos', () => {
  const REAL = { U: [225, 228, 222], R: [183, 18, 52], F: [0, 155, 72], D: [255, 213, 0], L: [255, 88, 0], B: [0, 70, 173] };
  for (const N of [2, 3, 4]) {
    const cube = scramble(N, 40);
    const faces = {};
    for (const f of SCAN_ORDER) {
      const light = 0.75 + Math.random() * 0.3;
      faces[f] = [];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const s = M.findSticker(cube, cellPos(f, i, j, N), M.NORMALS[f]);
        faces[f].push(REAL[s.color].map((v) => Math.min(255, v * light + (Math.random() * 2 - 1) * 6)));
      }
    }
    const scanned = M.makeCube(N);
    applyScan(scanned, classify(faces, N));
    let wrong = 0;
    cube.cubies.forEach((q) => q.stickers.forEach((s) => {
      const t = scanned.cubies.find((x) => M.eq(x.pos, q.pos)).stickers.find((x) => M.eq(x.normal, s.normal));
      if (t.color !== s.color) wrong++;
    }));
    assert.equal(wrong, 0, `${N}x${N}`);
  }
});
