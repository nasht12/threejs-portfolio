export const SITE = {
  owner: 'nasht12',
  repo: 'https://github.com/nasht12/threejs-portfolio',
} as const;

/** Resolve a public/ path against the deploy base (the site lives under /threejs-portfolio/ on GitHub Pages). */
export const asset = (path: string) => import.meta.env.BASE_URL + path;
