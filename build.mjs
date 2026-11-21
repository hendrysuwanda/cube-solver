// Bundles the app into a single self-contained dist/index.html (worker + main inlined).
import { build } from 'esbuild';
import fs from 'fs';

fs.mkdirSync('dist', { recursive: true });
await build({ entryPoints: ['src/worker.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/worker.js', logLevel: 'warning' });
await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', outfile: 'dist/main.js', logLevel: 'warning' });
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
let html = fs.readFileSync('src/template.html', 'utf8');
html = html
  .split('/*WORKER*/').join(esc(fs.readFileSync('dist/worker.js', 'utf8')))
  .split('/*MAIN*/').join(esc(fs.readFileSync('dist/main.js', 'utf8')));
fs.writeFileSync('dist/index.html', html);
fs.rmSync('dist/worker.js'); fs.rmSync('dist/main.js');
console.log(`dist/index.html  ${(html.length / 1024).toFixed(0)} KB`);
