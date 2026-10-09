/**
 * Frame-budget decision, kept pure so it can be tested.
 *
 * The canvas renders on demand, so the gap between two frames is only a frame time while
 * something is moving. Gaps longer than IDLE_GAP_MS are idle time and are dropped.
 */
export const IDLE_GAP_MS = 100;
export const BUDGET_MS = 1000 / 45; // below ~45 fps the light tier is the better experience
export const WINDOW = 90;

export function median(xs: readonly number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Decline only on a full window of active frames whose median is over budget. */
export function shouldDecline(activeFrameMs: readonly number[], budgetMs = BUDGET_MS, window = WINDOW) {
  if (activeFrameMs.length < window) return false;
  return median(activeFrameMs.slice(-window)) > budgetMs;
}
