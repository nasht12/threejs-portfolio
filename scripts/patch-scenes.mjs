// Make the scene pages fast on any GPU and quick to start. Idempotent: run it again after
// re-copying scenes from scene-director.
// Usage: node scripts/patch-scenes.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', 'public', 'scenes');

function replaceOnce(s, find, repl, page) {
  const i = s.indexOf(find);
  if (i < 0 || s.indexOf(find, i + 1) >= 0) throw new Error(`${page}: expected exactly one "${find.slice(0, 60)}"`);
  return s.slice(0, i) + repl + s.slice(i + find.length);
}

/* 1. Adaptive quality (public/scenes/adaptive-quality.js) in the pages with the shared grass engine.
      The pixel-ratio cap matches what each page used before. */
const ADAPTIVE = {
  'merced-river.html': 2,
  'fog-hollow.html': 2,
  'isle-of-the-dead.html': 2,
  'indigo-ridge.html': 1.5,
  'dents-du-midi.html': 1.5,
};

for (const [page, cap] of Object.entries(ADAPTIVE)) {
  const path = join(DIR, page);
  let s = await readFile(path, 'utf8');
  if (s.includes('adaptQuality(')) { console.log('adaptive: already patched', page); continue; }

  s = replaceOnce(s, "import * as THREE from 'three';", "import * as THREE from 'three';\nimport { adaptQuality, terrainGrid } from './adaptive-quality.js';", page);
  // the pixel ratio becomes adjustable
  s = s.replace(/^const dpr = /m, 'let dpr = ');
  // the page's own grass governor only counted frames under 250 ms, so it never acted on slow GPUs
  s = replaceOnce(s, 'if (!RENDER && !document.hidden && raw < 0.25){ qAcc += raw; qN++; }', '/* grass density is set by adaptive-quality.js */', page);
  s = replaceOnce(s, 'const GRASS_LAYERS = [grassClose, grassMid, grassFar];', `const GRASS_LAYERS = [grassClose, grassMid, grassFar];
const QUALITY = { shadowEvery: 1 };
// Live view only (offline renders keep full quality): resolution, grass and shadow cadence follow the GPU.
if (!RENDER) adaptQuality({
  renderer,
  cap: Math.min(window.devicePixelRatio || 1, ${cap}),
  setScale: s => { dpr = s; renderer.setPixelRatio(s); composer.setPixelRatio(s); resize(); },
  setGrass: q => { for (const L of GRASS_LAYERS) L.geo.instanceCount = Math.floor(L.count * q); },
  setShadowEvery: n => { QUALITY.shadowEvery = n; },
  msaaTargets: [composer.renderTarget1, composer.renderTarget2],
});`, page);
  // the painted-landscape engine: terrain grid by GPU class (built once, at load)…
  s = s.replace(/const CX = (-?[\d.]+), CZ = (-?[\d.]+), NX = (\d+), NZ = (\d+);/, (_, cx, cz, nx, nz) =>
    `const CX = ${cx}, CZ = ${cz}, [NX, NZ] = terrainGrid(renderer, RENDER, [${nx}, ${nz}]);`);
  // …near-shadow refresh every n frames on the lighter rungs…
  if (s.includes('shadowNear.shadow.needsUpdate = true;')) {
    s = replaceOnce(s, 'shadowNear.shadow.needsUpdate = true;', 'if (RENDER || shadowFrame % QUALITY.shadowEvery === 0) shadowNear.shadow.needsUpdate = true;', page);
  }
  // (the reflection stays at view resolution: below it, the ripple distortion makes it swim)
  await writeFile(path, s);
  console.log('adaptive: patched', page);
}

/* 2. Sable, the guest character, travelled inside four pages as 2.6 MB of base64 placed *before* the
      scene code, so every visit downloaded it before anything could start, though only Guests and the
      Rigging Bench use it. Move it to one binary file (a third smaller) fetched when it's needed. */
const SABLE = { 'merced-river.html': 'guestSable', 'fog-hollow.html': 'guestSable', 'isle-of-the-dead.html': 'guestSable', 'rigging-bench.html': 'sableData' };
const LOOP = 'for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);';
const FETCH = "const res = await fetch('models/sable.glb'); if (!res.ok) throw new Error('HTTP ' + res.status); const bin = await res.arrayBuffer();";
let sableHash = null;

for (const [page, id] of Object.entries(SABLE)) {
  const path = join(DIR, page);
  let s = await readFile(path, 'utf8');
  const open = `<script type="text/plain" id="${id}">`;
  const at = s.indexOf(open);
  if (at < 0) { console.log('sable: already external', page); continue; }
  const end = s.indexOf('</script>', at);
  const bytes = Buffer.from(s.slice(at + open.length, end).trim(), 'base64');
  const hash = createHash('sha1').update(bytes).digest('hex');
  if (sableHash && hash !== sableHash) throw new Error(`${page}: embedded Sable differs from the other pages`);
  if (!sableHash) {
    await mkdir(join(DIR, 'models'), { recursive: true });
    await writeFile(join(DIR, 'models', 'sable.glb'), bytes);
    sableHash = hash;
  }
  s = s.slice(0, at) + s.slice(end + '</script>'.length);
  const decode = `const s = atob(document.getElementById('${id}').textContent.trim()), bin = new Uint8Array(s.length);`;
  const i = s.indexOf(decode), j = s.indexOf(LOOP, i);
  if (i < 0 || j < 0) throw new Error(`${page}: Sable decoder not found`);
  s = s.slice(0, i) + FETCH + s.slice(j + LOOP.length);
  await writeFile(path, s);
  console.log('sable: now external in', page, `(${(bytes.length / 1e6).toFixed(2)} MB)`);
}
