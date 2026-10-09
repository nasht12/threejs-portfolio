// Capture a poster still for each scene that has no rendered video.
// Usage: node scripts/capture-posters.mjs [scene-id ...]
// Renders with SwiftShader (CPU WebGL) on purpose: stills are cheap, and it keeps this off the shared GPU queue.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = join(import.meta.dirname, '..', 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png' };
const SCENES = { 'dents-du-midi': 9000, 'gulf-stream-study': 7000, 'indigo-ridge': 9000, 'rigging-bench': 12000 }; // id -> settle time (ms)

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  let body;
  try { body = await readFile(join(ROOT, path)); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu'] });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.warn(`[${id}] page error:`, e.message));
  await page.goto(`${base}/scenes/${id}.html`, { waitUntil: 'load' });
  await page.waitForTimeout(SCENES[id] ?? 8000);
  // The largest canvas is the scene (some pages also draw small UI canvases). Hide every element
  // that isn't the canvas or one of its ancestors, so the poster shows the scene, not its controls.
  const clip = await page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth*b.clientHeight - a.clientWidth*a.clientHeight)[0];
    for (const el of document.body.querySelectorAll('*')) if (el !== c && !el.contains(c)) el.style.visibility = 'hidden';
    const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(ROOT, 'media', `${id}.jpg`), type: 'jpeg', quality: 88, clip, timeout: 90000 });
  console.log('captured', id, clip);
  await page.close();
}
await browser.close();
server.close();
