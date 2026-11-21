import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as M from './model.js';
import { LESSONS, visible } from './tutorial.js';
import { applyScan } from './scan.js';
import { createScanner } from './scanui.js';

const COLORS = {
  U: '#f4f4f0', // putih
  R: '#d8262b', // merah
  F: '#1f9d55', // hijau
  D: '#f6c91c', // kuning
  L: '#ff7a1a', // oranye
  B: '#1f5fd1', // biru
};
const COLOR_NAMES = { U: 'Putih', R: 'Merah', F: 'Hijau', D: 'Kuning', L: 'Oranye', B: 'Biru' };
const FACE_NAMES = { U: 'atas', R: 'kanan', F: 'depan', D: 'bawah', L: 'kiri', B: 'belakang' };
const SCRAMBLE_LEN = { 2: 12, 3: 20, 4: 40 };
// display colour per letter for each scheme (yellow = cube flipped with z2)
const SCHEMES = {
  white: COLORS,
  yellow: { U: COLORS.D, D: COLORS.U, R: COLORS.L, L: COLORS.R, F: COLORS.F, B: COLORS.B },
  // cube rolled so white is on the left and yellow on the right (green still in front)
  side: { L: COLORS.U, D: COLORS.L, R: COLORS.D, U: COLORS.R, F: COLORS.F, B: COLORS.B },
};
const HIDDEN = '#4a505c';

// ---------- state ----------
let N = 3;
let cube = M.makeCube(N);
let selected = 'U';
let solution = [];
let phases = null; // [{label, count}] for 4x4 solutions
let step = 0;
let busy = false;
let playing = false;
let worker = null;
const solverReady = { 2: false, 3: false, 4: false };
const solverLoading = { 2: false, 3: false, 4: false };
let reqId = 0;
let mode = 'solve';     // 'solve' | 'learn'
let scheme = 'white';
let solverCube = null;  // cube kept while in learn mode
let lesson = 0, lessonCase = 0, learnN = 3;
const STEPS_FOR = () => LESSONS[learnN];

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const statusEl = $('status');
function setStatus(msg, kind = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + kind;
}

// ---------- three.js ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(5.2, 4.6, 6.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
scene.add(new THREE.AmbientLight(0xffffff, 1.6));
const dir = new THREE.DirectionalLight(0xffffff, 1.4);
dir.position.set(4, 8, 6);
scene.add(dir);

const root = new THREE.Group();
scene.add(root);
const bodyGeo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 });
const stickerGeo = new THREE.PlaneGeometry(0.84, 0.84);
const matCache = {};
function mat(hex) {
  if (!matCache[hex]) matCache[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.35, side: THREE.DoubleSide });
  return matCache[hex];
}
const doubtCache = {};
function doubtMat(hex) {
  if (!doubtCache[hex]) doubtCache[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.35, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.45 });
  return doubtCache[hex];
}
const matFor = (s) => s.hide ? mat(HIDDEN) : s.doubt ? doubtMat(SCHEMES[scheme][s.color]) : mat(SCHEMES[scheme][s.color]);
const stickerMats = {};
for (const f of M.FACES) stickerMats[f] = mat(COLORS[f]);

let cubieMeshes = [];
const stickerTargets = [];

function build() {
  root.clear();
  cubieMeshes = [];
  stickerTargets.length = 0;
  cube.cubies.forEach((c, ci) => {
    const g = new THREE.Group();
    g.position.set(c.pos[0] / 2, c.pos[1] / 2, c.pos[2] / 2);
    g.add(new THREE.Mesh(bodyGeo, bodyMat));
    c.stickers.forEach((s, si) => {
      const m = new THREE.Mesh(stickerGeo, matFor(s));
      const n = new THREE.Vector3(...s.normal);
      m.position.copy(n.clone().multiplyScalar(0.485));
      m.lookAt(n.clone().multiplyScalar(2));
      m.userData = { ci, si };
      g.add(m);
      stickerTargets.push(m);
    });
    root.add(g);
    cubieMeshes.push(g);
  });
}

function fitCamera() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const dist = 9.6 * (N / 3) * Math.max(1, 0.95 / camera.aspect);
  camera.position.setLength(dist);
  controls.minDistance = dist * 0.7;
  controls.maxDistance = dist * 1.8;
}
new ResizeObserver(fitCamera).observe(stage);

let anim = null;
function tick(t) {
  if (anim) {
    const k = Math.min(1, (t - anim.start) / anim.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    anim.pivot.setRotationFromAxisAngle(anim.axis, anim.target * e);
    if (k >= 1) { const d = anim.done; anim = null; d(); }
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

const speed = () => Number($('speed').value);

function animateMove(move, dur = speed()) {
  return new Promise((resolve) => {
    const mv = M.parseMove(move);
    const pivot = new THREE.Group();
    root.add(pivot);
    cube.cubies.forEach((c, i) => { if (M.inLayer(c.pos, N, mv)) pivot.attach(cubieMeshes[i]); });
    anim = {
      pivot, axis: new THREE.Vector3(...mv.axis), target: (mv.quarter * Math.PI) / 2,
      start: performance.now(), dur: Math.abs(mv.quarter) === 2 ? dur * 1.4 : dur,
      done: () => { M.applyMove(cube, mv); build(); resolve(); },
    };
  });
}

// ---------- painting ----------
const raycaster = new THREE.Raycaster();
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 6 || busy || mode === 'learn') return;
  const r = renderer.domElement.getBoundingClientRect();
  const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(p, camera);
  const hit = raycaster.intersectObjects(stickerTargets, false)[0];
  if (!hit) return;
  const { ci, si } = hit.object.userData;
  const c = cube.cubies[ci];
  if (N === 3 && c.stickers.length === 1) { setStatus('Stiker tengah 3×3 tetap — jadi patokan warna tiap sisi.', 'warn'); return; }
  c.stickers[si].color = selected;
  delete c.stickers[si].doubt;
  hit.object.material = matFor(c.stickers[si]);
  clearSolution();
  updateCounts();
});

// ---------- palette ----------
const palette = $('palette');
for (const f of M.FACES) {
  const b = document.createElement('button');
  b.className = 'swatch' + (f === selected ? ' on' : '');
  b.style.background = COLORS[f];
  b.dataset.f = f;
  b.setAttribute('aria-label', COLOR_NAMES[f]);
  b.innerHTML = '<span class="cnt"></span>';
  b.onclick = () => {
    selected = f;
    palette.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x.dataset.f === f));
  };
  palette.appendChild(b);
}
function updateCounts() {
  const counts = M.colorCounts(cube);
  palette.querySelectorAll('.swatch').forEach((b) => {
    const n = counts[b.dataset.f] || 0;
    const el = b.querySelector('.cnt');
    el.textContent = n;
    el.classList.toggle('bad', n !== N * N);
  });
}

// ---------- solver worker ----------
function loadSolver(n) {
  if (solverReady[n] || solverLoading[n]) return;
  solverLoading[n] = true;
  worker.postMessage({ type: 'init', size: n });
}
function startWorker() {
  const src = document.getElementById('worker-src').textContent;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  worker = new Worker(url);
  worker.onmessage = (e) => {
    const d = e.data;
    if (d.type === 'ready') {
      solverReady[d.size] = true;
      solverLoading[d.size] = false;
      if (d.size === N) setStatus(`Solver ${N}×${N} siap. Acak kubus atau warnai sesuai kubus asli Anda.`);
      setControls();
      return;
    }
    if (d.id !== reqId) return;
    busy = false;
    if (d.type === 'invalid') setStatus(invalidMsg(d.reason), 'err');
    else if (d.type === 'error') setStatus('Solver error: ' + d.message, 'err');
    else if (d.type === 'solution') {
      solution = d.moves; step = 0;
      phases = d.phases;
      renderSolution();
      setStatus(d.moves.length ? `Solusi: ${d.moves.length} langkah. Tekan ▶ untuk memutar.` : 'Kubus sudah selesai 🎉', 'ok');
    }
    setControls();
  };
  loadSolver(3);
}

function invalidMsg(reason) {
  const per = N * N;
  return {
    count: `Setiap warna harus tepat ${per} kotak. Cek angka di palet.`,
    piece: 'Ada sudut dengan kombinasi warna yang mustahil (mis. dua warna berlawanan). Cek lagi pewarnaannya.',
    corner: 'Satu sudut terputar — kubus seperti ini tidak bisa diselesaikan. Cek orientasi sudut.',
    edge: 'Satu sisi (edge) terbalik — kubus seperti ini tidak bisa diselesaikan.',
    parity: 'Dua bagian tertukar (parity) — kemungkinan salah input dua kotak.',
    centers: 'Setiap warna harus punya tepat 4 kotak tengah.',
    wing: 'Ada potongan edge dengan kombinasi warna yang mustahil atau dobel. Cek lagi pewarnaan edge.',
  }[reason] || 'Kondisi kubus tidak valid.';
}

// ---------- solution UI ----------
function moveText(m) {
  const p = M.parseMove(m);
  const f = FACE_NAMES[p.face];
  const where = p.wide ? `dua lapisan ${f}` : p.depth ? `lapisan ke-2 dari ${f}` : `sisi ${f}`;
  if (p.quarter === -2) return `Putar ${where} 180°`;
  if (p.quarter === 1) return `Putar ${where} berlawanan jarum jam`;
  return `Putar ${where} searah jarum jam`;
}

function renderSolution() {
  const list = $('moves');
  list.innerHTML = '';
  solution.forEach((m, i) => {
    const s = document.createElement('button');
    s.className = 'mv' + (i < step ? ' done' : '') + (i === step ? ' cur' : '');
    if (phases && mode === 'solve') {
      let acc = 0;
      for (const p of phases) { if (i === acc && i > 0) s.classList.add('phase-start'); acc += p.count; }
    }
    s.textContent = m;
    s.onclick = () => goTo(i);
    list.appendChild(s);
  });
  $('panel').hidden = solution.length === 0;
  $('alg').textContent = solution.join(' ');
  const cur = solution[step];
  $('now').textContent = cur ? cur : '✓';
  const doneText = mode === 'learn'
    ? (STEPS_FOR()[lesson].cases[lessonCase].done || 'Langkah ini selesai ✓ Tekan ⏮ untuk mengulang.')
    : 'Selesai! Sisi depan hijau, atas putih.';
  $('nowText').textContent = cur ? moveText(cur) : doneText;
  $('progress').textContent = solution.length ? `${step} / ${solution.length}` : '';
  // phase label (4x4): which stage the current move belongs to
  let phaseText = '';
  if (phases && solution.length && mode === 'solve') {
    let start = 0;
    for (const p of phases) {
      if (step < start + p.count || p === phases[phases.length - 1]) {
        phaseText = `Tahap: ${p.label} · ${Math.min(step - start + 1, p.count)}/${p.count}`;
        if (step >= solution.length) phaseText = phases.map((x) => `${x.label} ${x.count}`).join(' · ');
        break;
      }
      start += p.count;
    }
  }
  $('phase').textContent = phaseText;
  $('phase').hidden = !phaseText;
  const curEl = list.querySelector('.cur');
  if (curEl) curEl.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

function clearSolution() {
  playing = false;
  solution = []; step = 0; phases = null;
  renderSolution();
  setControls();
}

function setControls() {
  const has = solution.length > 0;
  $('solve').disabled = !solverReady[N] || busy;
  $('solve').textContent = solverReady[N] ? 'Selesaikan' : 'Memuat…';
  $('scramble').disabled = busy;
  $('scanOpen').disabled = busy;
  $('reset').disabled = busy;
  $('prev').disabled = !has || busy || step === 0;
  $('next').disabled = !has || busy || step >= solution.length;
  $('play').disabled = !has || (step >= solution.length && !playing);
  $('play').textContent = playing ? '⏸' : '▶';
  $('first').disabled = !has || busy || step === 0;
  document.querySelectorAll('.lesson, .case, .lsize').forEach((b) => { b.disabled = busy; });
  document.querySelectorAll('.mode').forEach((b) => { b.classList.toggle('on', b.dataset.mode === mode); b.disabled = busy; });
  document.querySelectorAll('.size').forEach((b) => {
    b.classList.toggle('on', Number(b.dataset.n) === N);
    b.disabled = busy;
  });
}

async function next() {
  if (step >= solution.length) return;
  busy = true; setControls();
  await animateMove(solution[step]);
  step++;
  busy = false; renderSolution(); setControls();
}
async function prev() {
  if (step === 0) return;
  busy = true; setControls();
  await animateMove(M.invertMove(solution[step - 1]));
  step--;
  busy = false; renderSolution(); setControls();
}
async function goTo(i) {
  if (busy) return;
  playing = false;
  while (step < i) await next();
  while (step > i) await prev();
}
async function play() {
  if (playing) { playing = false; setControls(); return; }
  playing = true; setControls();
  while (playing && step < solution.length) await next();
  playing = false; setControls();
}

$('next').onclick = () => { playing = false; next(); };
$('prev').onclick = () => { playing = false; prev(); };
$('first').onclick = () => goTo(0);
$('play').onclick = play;

$('solve').onclick = () => {
  if (busy || !solverReady[N]) return;
  busy = true; setControls();
  setStatus('Menghitung solusi…');
  reqId++;
  worker.postMessage({ type: 'solve', cube: JSON.parse(JSON.stringify(cube)), id: reqId });
};

$('scramble').onclick = async () => {
  if (busy) return;
  clearSolution();
  busy = true; setControls();
  const all = M.movesFor(N);
  const seq = [];
  let lastAxis = -1, lastFace = '';
  while (seq.length < SCRAMBLE_LEN[N]) {
    const m = all[Math.floor(Math.random() * all.length)];
    const p = M.parseMove(m);
    const key = p.face + p.depth;
    if (key === lastFace) continue;
    lastFace = key; void lastAxis;
    seq.push(m);
  }
  setStatus('Acak: ' + seq.join(' '));
  const dur = N === 4 ? 70 : 90;
  for (const m of seq) await animateMove(m, dur);
  busy = false; setControls(); updateCounts();
};

$('reset').onclick = () => {
  if (busy) return;
  cube = M.makeCube(N); build(); clearSolution(); updateCounts();
  setStatus('Kubus direset ke kondisi selesai.');
};

function setSize(n) {
  if (busy || n === N) return;
  N = n;
  cube = M.makeCube(N);
  build(); fitCamera(); clearSolution(); updateCounts();
  $('notation4').hidden = N !== 4;
  if (solverReady[N]) setStatus(`Kubus ${N}×${N}. Acak atau warnai sesuai kubus Anda.`);
  else { setStatus(`Memuat solver ${N}×${N}…`); loadSolver(N); }
  setControls();
}
document.querySelectorAll('.size').forEach((b) => { b.onclick = () => setSize(Number(b.dataset.n)); });

// ---------- learn mode ----------
function renderLessons() {
  const bar = $('lessons');
  bar.innerHTML = '';
  STEPS_FOR().forEach((st, i) => {
    const b = document.createElement('button');
    b.className = 'lesson' + (i === lesson ? ' on' : '');
    b.textContent = i === 0 ? 'Dasar' : String(i);
    b.onclick = () => openLesson(i, 0);
    bar.appendChild(b);
  });
  const st = STEPS_FOR()[lesson];
  $('lessonTitle').textContent = st.title;
  $('lessonText').textContent = st.text;
  const cs = $('cases');
  cs.innerHTML = '';
  st.cases.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'case' + (i === lessonCase ? ' on' : '');
    b.textContent = c.label;
    b.onclick = () => openLesson(lesson, i);
    cs.appendChild(b);
  });
  $('caseHint').textContent = st.cases[lessonCase].hint || '';
  $('lessonPrev').disabled = lesson === 0;
  $('lessonNext').disabled = lesson === STEPS_FOR().length - 1;
  const on = bar.querySelector('.on');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

function openLesson(i, ci) {
  if (busy) return;
  playing = false;
  lesson = i; lessonCase = ci;
  const st = STEPS_FOR()[i], c = st.cases[ci];
  scheme = st.scheme;
  N = learnN;
  cube = M.makeCube(N);
  for (const q of cube.cubies) {
    const colors = q.stickers.map((s) => s.color);
    for (const s of q.stickers) s.hide = !visible(st.mask, colors, s.color);
  }
  const alg = c.alg.trim().split(/\s+/);
  const setup = c.setup !== undefined ? (c.setup ? c.setup.split(/\s+/) : []) : alg.slice().reverse().map(M.invertMove);
  M.applyMoves(cube, setup);
  build(); fitCamera();
  solution = alg; step = 0; phases = null;
  renderSolution(); renderLessons(); setControls();
  setStatus('');
}

function setMode(m) {
  if (busy || m === mode) return;
  playing = false;
  mode = m;
  document.body.classList.toggle('learning', m === 'learn');
  if (m === 'learn') {
    solverCube = { N, cube };
    if (!$('speed').dataset.touched) $('speed').value = 520;
    openLesson(lesson, lessonCase);
  } else {
    scheme = 'white';
    N = solverCube ? solverCube.N : 3;
    cube = solverCube ? solverCube.cube : M.makeCube(N);
    for (const q of cube.cubies) for (const s of q.stickers) delete s.hide;
    build(); fitCamera(); clearSolution(); updateCounts();
    setStatus(solverReady[N] ? `Kubus ${N}×${N}. Acak atau warnai sesuai kubus Anda.` : `Memuat solver ${N}×${N}…`);
  }
  setControls();
}
document.querySelectorAll('.mode').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
document.querySelectorAll('.lsize').forEach((b) => {
  b.onclick = () => {
    const n = Number(b.dataset.n);
    if (busy || n === learnN) return;
    learnN = n;
    document.querySelectorAll('.lsize').forEach((x) => x.classList.toggle('on', Number(x.dataset.n) === n));
    openLesson(0, 0);
  };
});
$('lessonPrev').onclick = () => openLesson(Math.max(0, lesson - 1), 0);
$('lessonNext').onclick = () => openLesson(Math.min(STEPS_FOR().length - 1, lesson + 1), 0);
$('speed').addEventListener('input', () => { $('speed').dataset.touched = '1'; });

// ---------- scan ----------
const scanner = createScanner({
  getN: () => N,
  setN: (n) => setSize(n),
  onDone: (result) => {
    cube = M.makeCube(N);
    applyScan(cube, result);
    build(); clearSolution(); updateCounts();
    let doubts = 0;
    for (const q of cube.cubies) for (const s of q.stickers) if (s.doubt) doubts++;
    const counts = M.colorCounts(cube);
    const off = M.FACES.filter((f) => counts[f] !== N * N);
    setStatus(off.length
      ? `Scan selesai, tapi jumlah warna belum pas (lihat angka merah di palet). Ketuk kotak yang salah untuk memperbaiki.`
      : 'Scan selesai. Tekan Selesaikan.', off.length ? 'warn' : 'ok');
    void doubts;
  },
});
$('scanOpen').onclick = () => { if (!busy) scanner.open(); };

$('help').onclick = () => { $('helpBox').hidden = !$('helpBox').hidden; };

build();
fitCamera();
updateCounts();
setControls();
startWorker();
