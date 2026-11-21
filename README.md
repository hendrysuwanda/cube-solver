# Cube Solver

Aplikasi web untuk menyelesaikan kubus Rubik **2×2, 3×3, dan 4×4**, lengkap dengan scan warna lewat foto/kamera dan tutorial metode pemula. Semua berjalan di browser: tanpa server, bisa offline setelah dibuka.

## Fitur
- **Solver**
  - 2×2: hampir optimal (rata-rata ±10 langkah)
  - 3×3: algoritma Kociemba two-phase via [cubejs](https://github.com/ldez/cubejs) (≤ 22 langkah)
  - 4×4: reduksi — pusat → pasang edge → parity → 3×3 (rata-rata ±87 langkah), dengan label tahap
- **Scan**: foto per sisi atau kamera live (butuh HTTPS), deteksi warna otomatis, koreksi per kotak, animasi panduan putar kubus
- **Belajar**: tutorial metode pemula 2×2, 3×3, 4×4 dengan demo 3D interaktif
- Input manual dengan mewarnai stiker, validasi (jumlah warna, sudut terputar, edge terbalik, parity)

## Menjalankan
```bash
npm install
npm run build        # hasil: dist/index.html (satu file, ±650 KB)
npm run serve        # build + http://localhost:8000 (kamera live jalan di localhost)
npm test             # tes solver & deteksi warna
```

## Deploy (GitHub Pages)
Workflow `.github/workflows/pages.yml` otomatis build + test + deploy setiap push ke `main`.
Setup sekali: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Alamat: `https://<username>.github.io/cube-solver/`

## Struktur
| File | Isi |
|---|---|
| `src/main.js` | UI utama, 3D (three.js), mode Solver & Belajar |
| `src/model.js` | Model kubus NxN, notasi gerakan (R, R', R2, 2R, Rw) |
| `src/worker.js` | Web Worker solver (2×2 / 3×3 / 4×4) |
| `src/corners.js` | Solver sudut (2×2 dan sudut 4×4) |
| `src/solver4.js`, `src/pair4.js`, `src/geo4.js` | Solver 4×4 (pusat, pasang edge, parity) |
| `src/scan.js`, `src/scanui.js`, `src/scanmini.js` | Scan: sampling & klasifikasi warna, UI, animasi panduan |
| `src/tutorial.js` | Materi tutorial (teks, kasus, rumus) |
| `src/template.html` | Kerangka HTML + CSS |

## Lisensi pihak ketiga
three.js (MIT), cubejs (MIT).
