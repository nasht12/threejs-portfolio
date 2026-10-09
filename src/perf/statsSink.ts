/** Where the stats panel lives in the DOM. The frame probe writes text into it directly, never through React state. */
export const statsSink: { el: HTMLElement | null } = { el: null };
