// Scan sheet: for each of six faces — take a photo (or live frame), fit the grid, then review/correct
// the detected colours before moving on. Confirmed faces teach the colour model for later faces.
import { SCAN_ORDER, SCAN_TEXT, FACE_LABEL, sampleGrid, classifyFace } from './scan.js';
import { createMini, CAPTION } from './scanmini.js';

const DISPLAY = { U: '#f4f4f0', R: '#d8262b', F: '#1f9d55', D: '#f6c91c', L: '#ff7a1a', B: '#1f5fd1' };
const NAMES = { U: 'Putih', R: 'Merah', F: 'Hijau', D: 'Kuning', L: 'Oranye', B: 'Biru' };
const LETTERS = ['U', 'R', 'F', 'D', 'L', 'B'];
const $ = (id) => document.getElementById(id);

export function createScanner({ getN, setN, onDone }) {
  let N = 3, idx = 0, phase = 'capture';
  let faces = {};        // f -> { letters: [], labs: [], doubt: [], crop: canvas }
  let img = null, grid = null, stream = null, drag = null;
  let review = null;     // { letters, labs, doubt, crop } for the face being reviewed
  let pick = 'U';
  let det = null;        // live detection for the face being captured: { letters, labs, doubt }
  let edits = {};        // manual corrections (cell index -> letter) for the current capture
  let liveTimer = null;
  const live = document.createElement('canvas');
  const lctx = live.getContext('2d', { willReadFrequently: true });
  const sheet = $('scan'), canvas = $('scanCanvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const video = $('scanVideo'), fileIn = $('scanFile'), sizeIn = $('scanSize');
  const miniBox = $('scanMini');
  const mini = createMini($('scanMiniGl'));
  let miniFor = null, bigTimer = null;

  // Show the turning animation for the current face: big right after moving to a new face, then docked.
  function updateMini() {
    const f = SCAN_ORDER[idx];
    const capture = phase === 'capture';
    miniBox.hidden = !capture;
    if (!capture) return;
    const key = N + f + Object.keys(faces).join('');
    if (miniFor !== key) {
      miniFor = key;
      const colours = {};
      for (const g of SCAN_ORDER) if (faces[g]) colours[g] = faces[g].letters.map((l) => DISPLAY[l]);
      if (N % 2) for (const g of SCAN_ORDER) if (!colours[g]) {
        colours[g] = new Array(N * N).fill('#3a3f4a');
        colours[g][(N * N) >> 1] = DISPLAY[g]; // known centre colour on odd cubes
      }
      mini.show(N, colours, f);
      $('scanMiniCap').textContent = CAPTION[f];
      miniBox.classList.add('big');
      clearTimeout(bigTimer);
      if (img || stream) bigTimer = setTimeout(() => miniBox.classList.remove('big'), 3200);
    }
    if (img) { miniBox.classList.remove('big'); clearTimeout(bigTimer); }
  }
  miniBox.addEventListener('click', () => {
    miniBox.classList.toggle('big');
    clearTimeout(bigTimer);
  });
  function flash() {
    const el = $('scanFlash');
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  }

  // ---------- open / close / live camera ----------
  function open() {
    N = getN(); idx = 0; faces = {}; img = null; grid = null; det = null; edits = {}; phase = 'capture';
    sheet.hidden = false;
    render();
    tryLive();
  }
  function close() { stopLive(); stopLiveLoop(); mini.stop(); miniFor = null; sheet.hidden = true; }

  async function tryLive() {
    stopLive();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      render();
    } catch (e) {
      stream = null; // camera blocked (e.g. sandboxed preview) -> photo input only
    }
  }
  function stopLive() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  function drawLiveGuide() {
    const g = $('scanGuide');
    g.hidden = video.hidden;
    g.style.setProperty('--n', N);
    if (g.hidden) return;
    const v = video.getBoundingClientRect(), box = video.parentElement.getBoundingClientRect();
    const s = Math.min(v.width, v.height) * 0.62;
    g.style.width = s + 'px';
    g.style.left = (v.left - box.left + (v.width - s) / 2) + 'px';
    g.style.top = (v.top - box.top + (v.height - s) / 2) + 'px';
  }
  video.addEventListener('loadedmetadata', drawLiveGuide);
  window.addEventListener('resize', drawLiveGuide);

  // ---------- rendering ----------
  function render() {
    const f = SCAN_ORDER[idx];
    document.querySelectorAll('.ssize').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === N));
    $('scanTitle').textContent = `Sisi ${idx + 1}/6 · ${FACE_LABEL[f]}`;
    const dot = $('scanDot');
    dot.hidden = N % 2 === 0;
    dot.style.background = DISPLAY[f];

    const capture = phase === 'capture';
    $('scanText').textContent = capture
      ? SCAN_TEXT[N % 2 ? 'odd' : 'even'][f]
      : 'Sisi ini sudah tersimpan. Kotak salah? Pilih warna, lalu ketuk kotaknya.';
    // capture widgets
    video.hidden = !(capture && stream && !img);
    canvas.hidden = !(capture && img);
    $('scanEmpty').hidden = true;
    $('scanAdjust').hidden = !(capture && img);
    $('scanPhoto').hidden = !capture;
    $('scanShoot').hidden = !(capture && stream);
    const liveOn = capture && (img || stream);
    $('scanDetect').hidden = !liveOn;
    $('scanOk').disabled = capture && !img && !(stream && video.videoWidth);
    // review widgets
    $('scanReview').hidden = capture;
    $('scanPalette').hidden = !(liveOn || !capture);
    $('scanRetake').hidden = capture;
    if (!capture) renderReview();
    else { renderDetect(); renderPalette(); }
    if (capture && stream && !img) startLive(); else stopLiveLoop();
    renderThumbs();
    drawLiveGuide();
    updateMini();
  }

  function renderThumbs() {
    const t = $('scanThumbs');
    t.innerHTML = '';
    SCAN_ORDER.forEach((f, i) => {
      const b = document.createElement('button');
      b.className = 'thumb' + (i === idx ? ' on' : '');
      b.style.setProperty('--n', N);
      if (faces[f]) {
        for (const l of faces[f].letters) { const s = document.createElement('i'); s.style.background = DISPLAY[l]; b.appendChild(s); }
      } else {
        b.textContent = FACE_LABEL[f];
      }
      b.onclick = () => {
        idx = i; img = null; det = null; edits = {};
        if (faces[f]) { review = cloneFace(faces[f]); phase = 'review'; } else phase = 'capture';
        render();
      };
      t.appendChild(b);
    });
  }

  const cloneFace = (x) => ({ letters: x.letters.slice(), labs: x.labs, doubt: x.doubt.slice(), crop: x.crop });

  function renderReview() {
    const box = $('scanReview');
    box.innerHTML = '';
    const photo = document.createElement('div');
    photo.className = 'rv-photo';
    photo.appendChild(review.crop);
    const gridEl = document.createElement('div');
    gridEl.className = 'rv-grid';
    gridEl.style.setProperty('--n', N);
    review.letters.forEach((l, k) => {
      const c = document.createElement('button');
      c.className = 'rv-cell' + (review.doubt[k] ? ' doubt' : '');
      c.style.background = DISPLAY[l];
      c.setAttribute('aria-label', NAMES[l]);
      const fixedCentre = N % 2 === 1 && k === ((N * N) >> 1);
      if (fixedCentre) { c.classList.add('fixed'); c.disabled = true; }
      c.onclick = () => {
        review.letters[k] = pick;
        review.doubt[k] = false;
        renderReview();
      };
      gridEl.appendChild(c);
    });
    const arrow = document.createElement('div');
    arrow.className = 'rv-arrow';
    arrow.textContent = '→';
    box.append(photo, arrow, gridEl);
    renderPalette();
  }

  function renderPalette() {
    const p = $('scanPalette');
    p.innerHTML = '';
    for (const l of LETTERS) {
      const b = document.createElement('button');
      b.className = 'swatch' + (l === pick ? ' on' : '');
      b.style.background = DISPLAY[l];
      b.setAttribute('aria-label', NAMES[l]);
      b.onclick = () => { pick = l; renderPalette(); };
      p.appendChild(b);
    }
  }

  // ---------- live detection ----------
  function knownSamples() {
    const f = SCAN_ORDER[idx], known = [];
    for (const g of SCAN_ORDER) if (faces[g] && g !== f) faces[g].labs.forEach((lab, k) => known.push({ lab, letter: faces[g].letters[k] }));
    return known;
  }
  function detect(rgbs) {
    const f = SCAN_ORDER[idx];
    const res = classifyFace(rgbs, N, knownSamples(), N % 2 ? f : null);
    det = {
      letters: res.map((r, k) => edits[k] || r.letter),
      labs: res.map((r) => r.lab),
      doubt: res.map((r, k) => !edits[k] && r.doubt),
    };
    renderDetect();
    return det;
  }
  function renderDetect() {
    const box = $('scanDetectGrid');
    box.innerHTML = '';
    box.style.setProperty('--n', N);
    if (!det) return;
    det.letters.forEach((l, k) => {
      const c = document.createElement('button');
      c.className = 'rv-cell' + (det.doubt[k] ? ' doubt' : '');
      c.style.background = DISPLAY[l];
      c.setAttribute('aria-label', NAMES[l]);
      if (N % 2 === 1 && k === ((N * N) >> 1)) c.disabled = true;
      c.onclick = () => {
        edits[k] = pick; det.letters[k] = pick; det.doubt[k] = false;
        renderDetect(); draw();
      };
      box.appendChild(c);
    });
  }
  // live camera: classify the guide square a few times per second
  function startLive() {
    if (liveTimer) return;
    liveTimer = setInterval(() => {
      if (!stream || img || phase !== 'capture' || !video.videoWidth) return;
      const k = 360 / Math.max(video.videoWidth, video.videoHeight);
      live.width = Math.round(video.videoWidth * k); live.height = Math.round(video.videoHeight * k);
      lctx.drawImage(video, 0, 0, live.width, live.height);
      const data = lctx.getImageData(0, 0, live.width, live.height);
      const sz = Math.min(live.width, live.height) * 0.62;
      const g = { x: (live.width - sz) / 2, y: (live.height - sz) / 2, size: sz };
      detect(sampleGrid(data.data, data.width, data.height, g, N));
      paintGuide();
      $('scanOk').disabled = false;
    }, 250);
  }
  function stopLiveLoop() { clearInterval(liveTimer); liveTimer = null; }
  function paintGuide() {
    const gEl = $('scanGuide');
    gEl.innerHTML = '';
    if (!det) return;
    for (const l of det.letters) { const d = document.createElement('i'); d.style.background = DISPLAY[l]; gEl.appendChild(d); }
  }

  // ---------- capture ----------
  function loadImage(source) {
    const max = 900;
    const w0 = source.videoWidth || source.naturalWidth || source.width;
    const h0 = source.videoHeight || source.naturalHeight || source.height;
    const k = Math.min(1, max / Math.max(w0, h0));
    canvas.width = Math.round(w0 * k); canvas.height = Math.round(h0 * k);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const s = Math.min(canvas.width, canvas.height) * 0.62;
    grid = { x: (canvas.width - s) / 2, y: (canvas.height - s) / 2, size: s };
    sizeIn.value = 62;
    phase = 'capture';
    edits = {};
    flash();
    render();
    draw();
  }

  function draw() {
    if (!img) return;
    ctx.putImageData(img, 0, 0);
    const { x, y, size } = grid, c = size / N;
    ctx.lineWidth = Math.max(2, canvas.width / 220);
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 4;
    for (let i = 0; i <= N; i++) {
      ctx.beginPath(); ctx.moveTo(x + i * c, y); ctx.lineTo(x + i * c, y + size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + i * c); ctx.lineTo(x + size, y + i * c); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    if (!drag || !det) detect(sampleGrid(img.data, img.width, img.height, grid, N));
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const k = i * N + j;
      ctx.beginPath(); ctx.arc(x + (j + 0.5) * c, y + (i + 0.5) * c, c * 0.17, 0, Math.PI * 2);
      ctx.fillStyle = DISPLAY[det.letters[k]]; ctx.fill();
      ctx.lineWidth = Math.max(2, c * 0.04);
      ctx.setLineDash(det.doubt[k] ? [c * 0.06, c * 0.05] : []);
      ctx.strokeStyle = det.doubt[k] ? '#ff6b6b' : '#000'; ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function toImage(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)];
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!img) return;
    const [px, py] = toImage(e);
    if (px < grid.x || py < grid.y || px > grid.x + grid.size || py > grid.y + grid.size) {
      grid.x = px - grid.size / 2; grid.y = py - grid.size / 2; draw();
    }
    drag = { px, py, gx: grid.x, gy: grid.y };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [px, py] = toImage(e);
    grid.x = drag.gx + px - drag.px; grid.y = drag.gy + py - drag.py;
    detect(sampleGrid(img.data, img.width, img.height, grid, N));
    draw();
  });
  canvas.addEventListener('pointerup', () => { drag = null; draw(); });
  sizeIn.addEventListener('input', () => {
    if (!grid) return;
    const cx = grid.x + grid.size / 2, cy = grid.y + grid.size / 2;
    grid.size = Math.min(canvas.width, canvas.height) * (Number(sizeIn.value) / 100);
    grid.x = cx - grid.size / 2; grid.y = cy - grid.size / 2;
    draw();
  });

  fileIn.addEventListener('change', () => {
    const file = fileIn.files && fileIn.files[0];
    if (!file) return;
    const im = new Image();
    im.onload = () => { loadImage(im); URL.revokeObjectURL(im.src); };
    im.src = URL.createObjectURL(file);
    fileIn.value = '';
  });
  $('scanPhoto').onclick = () => fileIn.click();
  $('scanShoot').onclick = () => { if (stream && video.videoWidth) loadImage(video); };
  $('scanCancel').onclick = close;

  $('scanRetake').onclick = () => { img = null; phase = 'capture'; render(); };

  function confirmCapture() {
    if (!img && stream && video.videoWidth) loadImage(video); // live: take the frame and use it right away
    if (!img) return null;
    if (!det) detect(sampleGrid(img.data, img.width, img.height, grid, N));
    const crop = document.createElement('canvas');
    crop.width = crop.height = 240;
    const tmp = document.createElement('canvas');
    tmp.width = img.width; tmp.height = img.height;
    tmp.getContext('2d').putImageData(img, 0, 0);
    crop.getContext('2d').drawImage(tmp, grid.x, grid.y, grid.size, grid.size, 0, 0, 240, 240);
    return { letters: det.letters.slice(), labs: det.labs, doubt: det.doubt.slice(), crop };
  }

  $('scanOk').onclick = () => {
    const face = phase === 'capture' ? confirmCapture() : cloneFace(review);
    if (!face) return;
    faces[SCAN_ORDER[idx]] = face;
    img = null; det = null; edits = {};
    const nextIdx = SCAN_ORDER.findIndex((g) => !faces[g]);
    if (nextIdx === -1) { finish(); return; }
    idx = nextIdx; phase = 'capture';
    render();
  };

  function finish() {
    const letters = {}, doubt = {};
    for (const f of SCAN_ORDER) { letters[f] = faces[f].letters.slice(); doubt[f] = faces[f].letters.map(() => false); }
    close();
    onDone({ letters, doubt });
  }

  document.querySelectorAll('.ssize').forEach((b) => {
    b.onclick = () => {
      const n = Number(b.dataset.n);
      if (n === N) return;
      setN(n);
      N = getN(); idx = 0; faces = {}; img = null; det = null; edits = {}; phase = 'capture';
      render();
    };
  });

  return { open, close };
}
