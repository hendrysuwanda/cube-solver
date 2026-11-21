// Mini 3D guide for scanning: a labelled cube that animates the whole-cube turn from the previous
// scanning position to the next one, so "kanan / belakang / kiri / atas / bawah" is unambiguous.
import * as THREE from 'three';

const LABEL = { F: 'DEPAN', R: 'KANAN', B: 'BELAKANG', L: 'KIRI', U: 'ATAS', D: 'BAWAH' };
const NORMAL = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
const LABEL_UP = { U: [0, 0, -1], D: [0, 0, 1], F: [0, 1, 0], R: [0, 1, 0], B: [0, 1, 0], L: [0, 1, 0] };

// Cube orientation (as a rotation) that brings each face to the camera, matching the scan instructions.
const q = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), (deg * Math.PI) / 180);
const POSE = {
  F: q([0, 1, 0], 0),
  R: q([0, 1, 0], -90),   // turn the whole cube left
  B: q([0, 1, 0], -180),
  L: q([0, 1, 0], -270),
  U: q([1, 0, 0], 90),    // tip the top towards the camera (back ends up on top)
  D: q([1, 0, 0], -90),   // tip the bottom towards the camera (front ends up on top)
};
// Path of poses shown for each step (from where the user was holding it).
const PATH = { F: ['F'], R: ['F', 'R'], B: ['R', 'B'], L: ['B', 'L'], U: ['L', 'F', 'U'], D: ['U', 'F', 'D'] };
export const CAPTION = {
  F: 'Sisi berlabel DEPAN menghadap kamera',
  R: '↺ Putar seluruh kubus ke kiri',
  B: '↺ Putar ke kiri lagi',
  L: '↺ Putar ke kiri lagi',
  U: 'Kembali ke DEPAN, lalu miringkan ATAS ke arah kamera',
  D: 'Kembali ke DEPAN, lalu miringkan BAWAH ke arah kamera',
};

function labelTexture(text, highlight) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = highlight ? 'rgba(79,140,255,.95)' : 'rgba(0,0,0,.72)';
  const r = 30;
  g.beginPath();
  g.moveTo(r, 8); g.arcTo(248, 8, 248, 88, r); g.arcTo(248, 88, 8, 88, r); g.arcTo(8, 88, 8, 8, r); g.arcTo(8, 8, 248, 8, r);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 44px -apple-system, Segoe UI, Roboto, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

export function createMini(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(3.4, 3.0, 9.5);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2);
  dl.position.set(3, 6, 8);
  scene.add(dl);

  const cube = new THREE.Group();
  scene.add(cube);
  let ring = null;
  let path = [POSE.F], t0 = performance.now(), running = false;

  // colours: { f: [hex x N*N] } for faces to colour; others dark
  function setCube(N, colours, target) {
    cube.clear();
    const unit = 3 / N;
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }));
    cube.add(body);
    const stickerGeo = new THREE.PlaneGeometry(unit * 0.86, unit * 0.86);
    const M = N - 1;
    for (const f of Object.keys(NORMAL)) {
      const n = new THREE.Vector3(...NORMAL[f]);
      const up = new THREE.Vector3(...LABEL_UP[f]);
      const right = new THREE.Vector3().crossVectors(up, n); // screen-right when this face looks at the camera
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const hex = colours[f] ? colours[f][i * N + j] : '#3a3f4a';
        const m = new THREE.Mesh(stickerGeo, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.4 }));
        const a = (-M + 2 * j) / 2 * unit, b = (M - 2 * i) / 2 * unit;
        m.position.copy(n.clone().multiplyScalar(1.505)).addScaledVector(right, a).addScaledVector(up, b);
        m.up.copy(up);
        m.lookAt(m.position.clone().add(n));
        cube.add(m);
      }
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.82), new THREE.MeshBasicMaterial({ map: labelTexture(LABEL[f], f === target), transparent: true, depthWrite: false }));
      lab.position.copy(n.clone().multiplyScalar(1.53));
      lab.up.copy(up);
      lab.lookAt(lab.position.clone().add(n));
      cube.add(lab);
    }
    // pulsing frame around the face to photograph
    const n = new THREE.Vector3(...NORMAL[target]);
    const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.08, 3.08));
    ring = new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color: 0x4f8cff }));
    ring.position.copy(n.clone().multiplyScalar(1.515));
    ring.up.set(...LABEL_UP[target]);
    ring.lookAt(ring.position.clone().add(n));
    cube.add(ring);
  }

  function play(target) {
    path = PATH[target].map((k) => POSE[k]);
    t0 = performance.now();
  }

  const SEG = 900, HOLD0 = 500, HOLD1 = 1500;
  function frame(now) {
    if (!running) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (w && h) {
      const cw = renderer.domElement.width / renderer.getPixelRatio(), ch = renderer.domElement.height / renderer.getPixelRatio();
      if (Math.abs(cw - w) > 1 || Math.abs(ch - h) > 1) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
      const segs = path.length - 1;
      const total = HOLD0 + segs * SEG + HOLD1;
      let t = (now - t0) % total;
      const qq = new THREE.Quaternion();
      if (segs === 0 || t < HOLD0) qq.copy(path[0]);
      else if ((t -= HOLD0) < segs * SEG) {
        const k = Math.floor(t / SEG), u = (t % SEG) / SEG;
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        qq.slerpQuaternions(path[k], path[k + 1], e);
      } else qq.copy(path[segs]);
      if (segs === 0) qq.multiply(q([0, 1, 0], Math.sin(now / 700) * 10)); // gentle sway on the first face
      cube.quaternion.copy(qq);
      if (ring) ring.material.color.setHSL(0.6, 1, 0.55 + 0.2 * Math.sin(now / 200));
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  return {
    show(N, colours, target) { setCube(N, colours, target); play(target); if (!running) { running = true; requestAnimationFrame(frame); } },
    stop() { running = false; },
  };
}
