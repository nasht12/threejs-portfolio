/**
 * Adaptive quality for the live scenes: keeps them moving smoothly on whatever GPU the visitor has.
 *
 * The scenes were tuned on a discrete GPU: up to 2x pixel ratio, a 4x multisampled post chain and
 * ~570k animated grass blades. On integrated graphics that measured 2-5 fps. This walks a ladder of
 * settings (render scale, grass density, multisampling) one rung at a time: down while the median
 * frame runs long, up while there is headroom. A rung that proved too slow isn't retried for a
 * while, so it settles instead of oscillating. Decisions are made on time, not frame count, so a
 * 3 fps machine is rescued within seconds.
 *
 * Shared by the scene pages; wired in by scripts/patch-scenes.mjs. Plain JS, no build step.
 */
export const OPTS = {
  slowMs: 1000 / 40, // median frame above this: step down
  verySlowMs: 1000 / 15, // this far behind: step down two rungs at once
  fastMs: 1000 / 57, // median frame under this: step up
  windowMs: 600, // judge after this much time…
  minFrames: 6, // …and at least this many frames
  stallMs: 1000, // a longer gap is a stall or a hidden tab, not a frame
  settleMs: 500, // ignore frames right after a change while buffers reallocate
  retryMs: 20000, // how long a rung that was too slow stays off-limits
};

/** Rungs from best to lightest. Above 1x the ladder only adds resolution; below it, grass thins first. */
export function buildLadder(cap) {
  const top = [];
  for (let s = cap; s > 1.0001; s = Math.round(s * 0.85 * 1000) / 1000) top.push({ scale: s, grass: 1, msaa: true, shadowEvery: 1 });
  return [
    ...top,
    { scale: 1, grass: 1, msaa: true, shadowEvery: 1 },
    { scale: 1, grass: 0.7, msaa: true, shadowEvery: 1 },
    { scale: 0.85, grass: 0.5, msaa: true, shadowEvery: 2 },
    { scale: 0.75, grass: 0.35, msaa: true, shadowEvery: 2 },
    { scale: 0.65, grass: 0.25, msaa: false, shadowEvery: 3, reflect: 0.5 },
    { scale: 0.55, grass: 0.15, msaa: false, shadowEvery: 3, reflect: 0.5 },
    { scale: 0.5, grass: 0.08, msaa: false, shadowEvery: 4, reflect: 0.5 },
  ];
}

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Pure decision: the rung to use next, given the median frame time of the last window.
 * `best` is the highest rung currently allowed (rungs that were too slow recently are excluded).
 */
export function nextRung(medianMs, rung, count, best = 0, o = OPTS) {
  if (medianMs > o.slowMs) return Math.min(count - 1, rung + (medianMs > o.verySlowMs ? 2 : 1));
  if (medianMs < o.fastMs && rung > best) return rung - 1;
  return rung;
}

/** Integrated or software GPUs start a few rungs down instead of spending seconds at a crawl. */
export function looksIntegrated(rendererName = '') {
  return /intel|uhd|iris|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe|software|microsoft basic/i.test(rendererName);
}

export function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } catch { return ''; }
}

/**
 * Terrain grid size, decided once at load (the mesh is built once): integrated GPUs get half the
 * segments per side, a quarter of the triangles. The grid is warped finest near the viewpoint,
 * so the cliffs keep their silhouette.
 */
export function terrainGrid(renderer, offline, full) {
  if (offline || !looksIntegrated(gpuName(renderer))) return full;
  return full.map(n => Math.round(n / 2));
}

/**
 * Start the controller.
 * - setScale(s): set the renderer/composer pixel ratio and re-run the page's resize
 * - setGrass(q): draw this fraction of the grass instances (they're stored in random order, so it thins evenly)
 * - msaaTargets: render targets to switch to 0 samples on the lightest rungs
 * - setShadowEvery(n): refresh the near shadow map every n frames
 * - setReflect(f): planar-reflection resolution as a fraction of the view (applied by setScale's resize)
 */
export function adaptQuality({ renderer, cap, setScale, setGrass = () => {}, setShadowEvery = () => {}, setReflect = () => {}, msaaTargets = [], opts = OPTS }) {
  const o = opts;
  const ladder = buildLadder(cap);
  const base = ladder.findIndex(r => r.scale === 1 && r.grass === 1);
  let rung = looksIntegrated(gpuName(renderer)) ? Math.min(ladder.length - 1, base + 3) : base;
  let best = 0, retryAt = Infinity, frames = [], windowStart = 0, last = 0, settleUntil = 0, msaa = true;

  function apply() {
    const r = ladder[rung];
    setReflect(r.reflect ?? 1);
    setScale(r.scale);
    setGrass(r.grass);
    setShadowEvery(r.shadowEvery);
    if (r.msaa !== msaa) {
      msaa = r.msaa;
      for (const rt of msaaTargets) { rt.samples = msaa ? 4 : 0; rt.dispose(); }
    }
    const d = document.documentElement.dataset;
    d.renderScale = r.scale.toFixed(2);
    d.grass = r.grass.toFixed(2);
    d.qualityRung = `${rung}/${ladder.length - 1}`;
  }
  apply();

  function tick(t) {
    requestAnimationFrame(tick);
    const gap = t - last;
    last = t;
    if (document.hidden || gap <= 0 || gap > o.stallMs || t < settleUntil) { frames = []; windowStart = t; return; }
    if (t > retryAt) { best = 0; retryAt = Infinity; }
    frames.push(gap);
    if (t - windowStart < o.windowMs || frames.length < o.minFrames) return;
    const next = nextRung(median(frames), rung, ladder.length, best, o);
    frames = [];
    windowStart = t;
    if (next === rung) return;
    if (next > rung) { best = Math.max(best, rung + 1); retryAt = t + o.retryMs; } // this rung was too much: don't climb back to it for a while
    rung = next;
    apply();
    settleUntil = t + o.settleMs;
  }
  requestAnimationFrame(tick);
}
