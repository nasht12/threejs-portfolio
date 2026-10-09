import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';

/*
 * Procedural textures, generated once on the CPU at startup (about 30 ms) instead of downloaded.
 * The plaster is tileable value noise: integer frequencies wrapped modulo the grid.
 */

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(u: number, v: number, f: number, seed: number) {
  const x = u * f, y = v * f;
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = x - xi, ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const x0 = ((xi % f) + f) % f, y0 = ((yi % f) + f) % f, x1 = (x0 + 1) % f, y1 = (y0 + 1) % f;
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const OCTAVES: readonly [number, number][] = [[3, 1], [7, 0.55], [15, 0.32], [31, 0.2], [63, 0.12], [127, 0.07]];

function plasterHeights(size: number) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const [f, a] of OCTAVES) v += a * valueNoise(x / size, y / size, f, 11);
      h[y * size + x] = v;
    }
  }
  return h;
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  return { c, ctx, img: ctx.createImageData(size, size) };
}

let plaster: { normal: CanvasTexture; color: CanvasTexture } | null = null;

/** Normal map (relief) and colour map (tonal mottling) for the wall, sharing one height field. */
export function plasterTextures(size = 512) {
  if (plaster) return plaster;
  const h = plasterHeights(size);
  const n = canvas(size), col = canvas(size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  const strength = 3.2;
  let lo = Infinity, hi = -Infinity;
  for (const v of h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // canvas rows run downward, texture v runs upward: the y gradient flips sign
      let nx = -(at(x + 1, y) - at(x - 1, y)) * strength;
      let ny = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      n.img.data[i] = (nx * 0.5 + 0.5) * 255;
      n.img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      n.img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      n.img.data[i + 3] = 255;
      const t = (h[y * size + x] - lo) / (hi - lo); // 0..1
      const g = 205 + t * 50;
      col.img.data[i] = g; col.img.data[i + 1] = g; col.img.data[i + 2] = g; col.img.data[i + 3] = 255;
    }
  }
  n.ctx.putImageData(n.img, 0, 0);
  col.ctx.putImageData(col.img, 0, 0);
  const normal = new CanvasTexture(n.c), color = new CanvasTexture(col.c);
  normal.colorSpace = NoColorSpace;
  color.colorSpace = SRGBColorSpace;
  for (const t of [normal, color]) { t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 4; }
  plaster = { normal, color };
  return plaster;
}

let pool: CanvasTexture | null = null;

/** Soft radial falloff used for the light pool each picture lamp throws on the wall. */
export function poolTexture() {
  if (pool) return pool;
  const { c, ctx } = canvas(256);
  const g = ctx.createRadialGradient(128, 72, 0, 128, 112, 116);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.45)');
  g.addColorStop(0.7, 'rgba(255,255,255,.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  pool = new CanvasTexture(c);
  pool.colorSpace = SRGBColorSpace;
  return pool;
}
