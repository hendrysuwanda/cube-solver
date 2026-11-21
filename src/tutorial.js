// Beginner (layer-by-layer) method for 3x3. Every demo starts from the case the algorithm solves
// (setup = inverse of the algorithm, unless `setup` is given) and ends with the step completed.
// scheme 'white' = white on top, green front. scheme 'yellow' = cube flipped (z2): yellow on top, green front.
// The letter 'U' is always the top colour of the current scheme.

const MOVE_CASES = ['R', "R'", 'U', "U'", 'F', "F'", 'L', 'D', 'B', 'R2'].map((m) => ({
  label: m, alg: m, setup: '', done: 'Begitulah gerakan ' + m + '. Coba gerakan lain.',
}));

export const STEPS = [
  {
    title: 'Kenali kubus & notasi',
    scheme: 'white', mask: 'all',
    text: 'Pusat (1 warna) tidak pernah berpindah, jadi warna pusat menentukan warna sisi itu. Edge punya 2 warna, sudut 3 warna. Huruf = sisi yang diputar searah jarum jam bila dilihat dari sisi itu: R kanan, L kiri, U atas, D bawah, F depan, B belakang. Tanda \' = berlawanan jarum jam, 2 = putar 180°.',
    cases: MOVE_CASES,
  },
  {
    title: '1. Silang putih',
    scheme: 'white', mask: 'cross',
    text: 'Buat tanda + putih di atas. Warna samping tiap edge harus sama dengan pusat di bawahnya (misalnya edge putih-hijau di atas pusat hijau). Kerjakan satu per satu edge.',
    cases: [
      { label: 'Edge di bawah', alg: 'F2', hint: 'Putar D sampai edge berada tepat di bawah tempatnya, lalu F2.' },
      { label: 'Edge di tengah', alg: "F'", hint: 'Edge di lapisan tengah: putar sisi itu supaya edge naik ke atas.' },
      { label: 'Edge terbalik', alg: "F U' R U", hint: 'Edge sudah di tempatnya tapi putihnya menghadap depan.' },
    ],
  },
  {
    title: '2. Sudut putih',
    scheme: 'white', mask: 'layer1',
    text: 'Cari sudut berwarna putih di lapisan bawah. Putar D sampai sudut itu tepat di bawah tempatnya (kanan-depan). Ulangi R\' D\' R D sampai sudut masuk dengan benar: 1, 3, atau 5 kali, tergantung arah putihnya.',
    cases: [
      { label: 'Putih ke kanan', alg: "R' D' R D", hint: 'Cukup 1 kali.' },
      { label: 'Putih ke bawah', alg: "R' D' R D R' D' R D R' D' R D", hint: 'Ulangi 3 kali.' },
      { label: 'Putih ke depan', alg: "R' D' R D R' D' R D R' D' R D R' D' R D R' D' R D", hint: 'Ulangi 5 kali.' },
    ],
  },
  {
    title: '3. Lapisan tengah',
    scheme: 'yellow', mask: 'f2l',
    text: 'Balik kubus: kuning di atas, putih di bawah. Cari edge di atas yang tidak ada kuningnya. Putar U sampai warna depannya sama dengan pusat depan. Lihat warna atas edge itu: kalau sama dengan pusat kanan, masukkan ke kanan; kalau sama dengan pusat kiri, masukkan ke kiri.',
    cases: [
      { label: 'Masuk ke kanan', alg: "U R U' R' U' F' U F" },
      { label: 'Masuk ke kiri', alg: "U' L' U L U F U' F'" },
    ],
  },
  {
    title: '4. Silang kuning',
    scheme: 'yellow', mask: 'oll',
    text: 'Buat tanda + kuning di atas. Abaikan dulu sudut-sudutnya. Lihat bentuk kuning di atas: titik, L, atau garis.',
    cases: [
      { label: 'Garis', alg: "F R U R' U' F'", hint: 'Pegang garis mendatar (kiri–kanan).' },
      { label: 'Bentuk L', alg: "F U R U' R' F'", hint: 'Pegang L di kiri-belakang.' },
      { label: 'Titik', alg: "F R U R' U' F' U2 F U R U' R' F'", hint: 'Rumus garis, putar U2, lalu rumus L.' },
    ],
  },
  {
    title: '5. Cocokkan edge kuning',
    scheme: 'yellow', mask: 'edges',
    text: 'Putar U sampai dua edge cocok dengan pusatnya, lalu pegang kubus sehingga keduanya di belakang dan kanan. Kalau yang cocok saling berseberangan, lakukan rumus sekali, lalu ulangi.',
    cases: [{ label: 'Benar di belakang & kanan', alg: "R U R' U R U2 R' U" }],
  },
  {
    title: '6. Posisi sudut kuning',
    scheme: 'yellow', mask: 'all',
    text: 'Cari sudut yang sudah di tempat yang benar (ketiga warnanya cocok dengan pusat di sekitarnya, arahnya boleh salah). Taruh di kanan-depan-atas, lalu ulangi rumus sampai semua sudut di tempatnya. Kalau belum ada yang benar, lakukan rumus sekali dulu.',
    cases: [{ label: 'Satu sudut benar', alg: "U R U' L' U R' U' L" }],
  },
  {
    title: '7. Putar sudut kuning',
    scheme: 'yellow', mask: 'all',
    text: 'Pegang sudut yang kuningnya belum di atas di kanan-depan-atas. Ulangi R\' D\' R D sampai kuningnya menghadap atas. Lapisan bawah akan terlihat berantakan, itu normal! Lalu putar U saja (bukan seluruh kubus) untuk membawa sudut berikutnya ke kanan-depan. Semua beres di akhir.',
    cases: [{ label: 'Dua sudut terputar', alg: "R' D' R D R' D' R D U R' D' R D R' D' R D R' D' R D R' D' R D U'", hint: '2× rumus, U, 4× rumus, lalu U\'.' }],
  },
];

// ---------------- 2x2 ----------------
const MOVE_CASES_2 = ['R', "R'", 'U', "U'", 'F', 'L'].map((m) => ({ label: m, alg: m, setup: '', done: 'Begitulah gerakan ' + m + '.' }));
export const STEPS_2 = [
  {
    title: 'Kenali kubus 2×2', scheme: 'white', mask: 'all',
    text: '2×2 hanya punya 8 sudut, tanpa pusat. Jadi warna sisi ditentukan oleh sudut yang sudah benar. Notasinya sama seperti 3×3. Kabar baik: kalau sudah bisa 3×3 langkah 2, 6, dan 7, Anda sudah bisa 2×2!',
    cases: MOVE_CASES_2,
  },
  {
    title: '1. Lapisan putih', scheme: 'white', mask: 'layer1',
    text: 'Pilih satu sudut putih sebagai patokan di atas. Sudut putih lain harus cocok warna sampingnya dengan tetangganya. Taruh sudut tepat di bawah tempatnya (kanan-depan), lalu ulangi R\' D\' R D sampai masuk: 1, 3, atau 5 kali.',
    cases: [
      { label: 'Putih ke kanan', alg: "R' D' R D", hint: 'Cukup 1 kali.' },
      { label: 'Putih ke bawah', alg: "R' D' R D R' D' R D R' D' R D", hint: 'Ulangi 3 kali.' },
      { label: 'Putih ke depan', alg: "R' D' R D R' D' R D R' D' R D R' D' R D R' D' R D", hint: 'Ulangi 5 kali.' },
    ],
  },
  {
    title: '2. Posisi sudut kuning', scheme: 'yellow', mask: 'all',
    text: 'Balik kubus: kuning di atas. Putar U sampai minimal satu sudut atas berada di tempat yang benar (warnanya cocok dengan lapisan bawah). Taruh sudut itu di kanan-depan, lalu ulangi rumus sampai semua sudut di tempatnya. Kalau tidak ada yang benar di posisi U mana pun, lakukan rumus sekali dulu.',
    cases: [{ label: 'Satu sudut benar', alg: "U R U' L' U R' U' L" }],
  },
  {
    title: '3. Putar sudut kuning', scheme: 'yellow', mask: 'all',
    text: 'Sama dengan 3×3 langkah 7. Pegang sudut yang kuningnya belum di atas di kanan-depan-atas, ulangi R\' D\' R D sampai kuning menghadap atas. Lalu putar U saja untuk sudut berikutnya. Di akhir, putar U agar lapisan atas pas.',
    cases: [{ label: 'Dua sudut terputar', alg: "R' D' R D R' D' R D U R' D' R D R' D' R D R' D' R D R' D' R D U'", hint: '2× rumus, U, 4× rumus, lalu U\'.' }],
  },
];

// ---------------- 4x4 ----------------
const MOVE_CASES_4 = ['R', '2R', 'Rw', 'U', '2U', 'Uw', "R'", "2R'"].map((m) => ({ label: m, alg: m, setup: '', done: 'Begitulah gerakan ' + m + '.' }));
export const STEPS_4 = [
  {
    title: 'Kenali kubus 4×4', scheme: 'white', mask: 'all',
    text: 'Metode "reduksi": jadikan 4×4 seperti 3×3 besar. Pusat terdiri dari 4 potongan per warna dan bisa berpindah. Edge terdiri dari 2 potongan yang harus dipasangkan. Notasi tambahan: 2R = hanya lapisan kedua dari kanan, Rw = dua lapisan kanan sekaligus.',
    cases: MOVE_CASES_4,
  },
  {
    title: '1. Pusat putih & kuning', scheme: 'white', mask: 'centersWY',
    text: 'Kumpulkan 4 pusat putih di atas. Putar U agar celah berada di kolom yang benar, naikkan potongan putih dengan lapisan dalam (2R), putar U supaya potongan itu keluar dari kolom, lalu kembalikan lapisan dalam. Lakukan hal yang sama untuk kuning di bawah.',
    cases: [
      { label: 'Satu pusat putih', alg: "2R U 2R'", hint: 'Putih ada di depan (kolom kanan-dalam), celah di atas.' },
      { label: 'Sepasang putih', alg: "2R U2 2R'", hint: 'Dua pusat putih berjajar di depan: masuk sekaligus.' },
      { label: 'Pusat kuning', alg: "2R' D 2R", hint: 'Putih di atas tetap aman karena lapisan dalam dikembalikan.' },
    ],
  },
  {
    title: '2. Empat pusat samping', scheme: 'side', mask: 'centers',
    text: 'Pegang putih di kiri dan kuning di kanan. Sekarang 2R dan U tidak mengganggu putih dan kuning. Kerjakan pusat yang di atas dengan cara yang sama. Perhatikan urutan warna: bila putih di atas dan hijau di depan, merah ada di kanan.',
    cases: [
      { label: 'Satu pusat', alg: "2R U 2R'" },
      { label: 'Sepasang', alg: "2R U2 2R'" },
    ],
  },
  {
    title: '3. Pasangkan edge', scheme: 'white', mask: 'pair',
    text: 'Cari dua potongan edge berwarna sama. Taruh satu di kiri-depan dan pasangannya di kanan-depan. Turunkan lapisan dalam (2U\') supaya keduanya bersatu, keluarkan edge yang sudah jadi dengan R U R\' F R\' F\' R, lalu kembalikan lapisan dalam (2U) agar pusat utuh lagi. Ulangi sampai 12 edge berpasangan.',
    cases: [{ label: 'Dua edge belum berpasangan', alg: "2U' R U R' F R' F' R 2U", hint: 'Kiri-depan dan kanan-depan masing-masing berisi separuh edge yang salah.' }],
  },
  {
    title: '4. Selesaikan seperti 3×3', scheme: 'yellow', mask: 'all',
    text: 'Pusat dan edge sudah beres? Sekarang anggap kubus ini 3×3: putar lapisan luar saja (R, U, F, …) dan ikuti tutorial 3×3 langkah 1–7. Ada 2 kasus yang tidak mungkin terjadi di 3×3; itulah "parity" di langkah berikutnya. Contoh di bawah: langkah 5 tutorial 3×3 di kubus 4×4.',
    cases: [{ label: 'Contoh: cocokkan edge kuning', alg: "R U R' U R U2 R' U" }],
  },
  {
    title: '5. Parity: satu edge terbalik', scheme: 'yellow', mask: 'all',
    text: 'Saat membuat silang kuning, kadang hanya satu edge yang terbalik. Ini tidak mungkin di 3×3. Pegang edge itu di depan-atas dan lakukan rumus panjang ini. Tenang, setelah selesai semuanya kembali rapi.',
    cases: [{ label: 'Edge depan terbalik', alg: "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2" }],
  },
  {
    title: '6. Parity: dua edge tertukar', scheme: 'yellow', mask: 'all',
    text: 'Di akhir, kadang hanya dua edge atas yang saling tertukar (berseberangan). Pegang keduanya di depan dan belakang, lalu lakukan rumus ini. Kalau yang tertukar bersebelahan, lakukan rumus langkah 5 (3×3) dulu agar jadi berseberangan.',
    cases: [{ label: 'Depan & belakang tertukar', alg: "2R2 U2 2R2 Uw2 2R2 2U2" }],
  },
];

export const LESSONS = { 2: STEPS_2, 3: STEPS, 4: STEPS_4 };

// Which stickers are shown in colour for a given mask (evaluated on the solved cube, then carried by the stickers).
export function visible(mask, pieceColors, stickerColor) {
  const n = pieceColors.length;
  const top = pieceColors.includes('U');
  switch (mask) {
    case 'cross': return n === 1 || (n === 2 && top);
    case 'layer1': return n === 1 || top;
    case 'f2l': return n === 1 || !top;
    case 'oll': return n === 1 || !top || stickerColor === 'U';
    case 'edges': return n !== 3 || !top || stickerColor === 'U';
    case 'centersWY': return n === 1 && (stickerColor === 'U' || stickerColor === 'D');
    case 'centers': return n === 1;
    case 'pair': {
      if (n === 1) return true;
      if (n !== 2) return false;
      const k = pieceColors.slice().sort().join('');
      return k === 'FL' || k === 'FR';
    }
    default: return true;
  }
}
