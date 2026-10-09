# threejs-portfolio

A ring of portal cards (React 19 + React Three Fiber + Zustand + Vite + TypeScript), after pmndrs' "enter portals"
example, into real-time Three.js scenes. Turning the ring brings a card to the front; going through its portal opens
the live scene full screen. The ring scales to any number of cards. Deployed to GitHub Pages
at https://nasht12.github.io/threejs-portfolio/ by `.github/workflows/deploy.yml` on every push to `main`.

## Commands

| | |
|---|---|
| `npm run dev` | Vite dev server at `/threejs-portfolio/` |
| `npm run typecheck` | `tsc -b` (TypeScript 7) |
| `npm test` | Vitest: store, routing, layout and frame-budget logic |
| `npm run test:e2e` | Playwright against a production build, system Chrome + SwiftShader (no GPU needed) |
| `node scripts/capture-posters.mjs [id…]` | Re-capture poster stills for scenes without rendered video |
| `node scripts/patch-scenes.mjs` | Wire adaptive quality into the scene pages (after re-copying them) |

Done means: typecheck, `npm test` and `npm run test:e2e` all pass. CI runs the same three before deploying.

## Map

- `src/data/works.ts`: the collection. One entry per scene; the only file to touch to add or reword a work.
- `src/state/store.ts`: the single Zustand store (selection, mode, quality tier, event log). Every state change goes through an action here.
- `src/state/route.ts`: hash routes (`#/work/<id>`, `#/scene/<id>`). `src/ui/hooks.ts` syncs them with the store.
- `src/carousel/`: everything inside the `<Canvas>`: `Rig` turns the ring and moves the camera, `Card` is one portal card, `layout.ts` holds all world-space numbers and the fake-window maths, `transition.ts` the shared dive progress.
- `src/gallery/`: `useLoopTexture` (preview video lifecycle) and the first-load `Loader`.
- `src/perf/`: the frame-budget monitor and the stats probe.
- `src/ui/`: DOM: header, caption, list of works, live-region announcer, scene viewer.
- `public/scenes/`: the live scenes, copied from their source project (vanilla three.js, loaded from jsDelivr). Treat them as build inputs, except for one patch: `node scripts/patch-scenes.mjs` wires in `adaptive-quality.js` (idempotent; re-run after re-copying).
- `public/scenes/adaptive-quality.js`: keeps the live scenes smooth on any GPU by walking a ladder of render scale, grass density and MSAA from measured frame times. Its decision logic is unit-tested in `src/perf/adaptive.test.ts`.
- `public/media/`: posters (`<id>.jpg`) and 6 s preview loops (`<id>.mp4`, H.264, about 1 to 2 MB).

## Rules for code in the canvas

- **The canvas renders on demand** (`frameloop="demand"`). Anything that changes what is on screen must call `invalidate()`: store changes, video frames and camera motion already do. If something "only appears after a resize", a render request is missing.
- **No React state per frame.** Per-frame values live in refs and are read in `useFrame`. Read the store with `useGallery.getState()` inside `useFrame`; subscribe with selectors only for things that change the React tree.
- **Never allocate in `useFrame`** (no `new Vector3()` per frame). Allocate once in a ref or `useMemo`.
- **Dispose what you create imperatively.** Declarative JSX objects are disposed by R3F on unmount. Anything made in an effect (video elements, `VideoTexture`, render targets) is torn down in that effect's cleanup; see `useLoopTexture.ts`.
- **One WebGL context at a time.** The carousel canvas is unmounted while a scene is open. Keep it that way.
- **One real portal at a time.** Each `MeshPortalMaterial` renders its world into three screen-sized targets every frame,
  so only the front card gets one. The others fake the same window with a cropped poster (`windowCrop`), which
  matches what the portal shows so the swap at the front doesn't jump. Cards facing away are not drawn.
- **No tone mapping** (`<Canvas flat>`): the home page is photographs; drei's portal shaders would otherwise tone-map them.
- Colour: posters and video are `SRGBColorSpace` and drawn with `toneMapped={false}`, so they match the source exactly.

## Performance tiers

`effectiveQuality()` is `high` or `low`. Low is the Chromebook tier and must stay cheap:

| | high | low |
|---|---|---|
| DPR | 1 to 2 | 1 |
| Preview video | plays inside the front card | posters only |

The tier is decided behind the scenes; there is no visible control. It starts low on machines with ≤ 4 cores or
≤ 4 GB of memory, on slow or metered connections (`navigator.connection`: 2g/3g, downlink under 1.5 Mbps, Save-Data),
drops to low if the first load takes over 6 s, or if the median active frame time over 90 frames exceeds 22 ms.
Nothing raises it again. `?quality=low|high` pins it (demos, tests). Any new effect needs a low-tier answer before it ships.

## Accessibility (a requirement, not polish)

- Everything the canvas offers has a DOM equivalent: the list of works (roving tabindex, arrow keys, Home/End; Enter on the front card goes in) and the caption's "Enter the scene" button. The canvas wrapper is `aria-hidden`.
- Location changes are announced through the polite live region in `Announcer`. Write a message for any new mode.
- Drag slides the cards, scroll (or a trackpad pinch) zooms, clicking the front card dives in: as in the pmndrs example.
- The details bar along the bottom (title, description, "Enter the scene") is hidden until the front card is hovered; it also opens
  whenever keyboard focus is on the list or the panel, and on touch screens or narrow windows it stays open at the bottom.
- Opening a scene moves focus to its Back button; closing returns focus to where it was. Escape closes from inside the iframe too.
- No single-character shortcuts. `prefers-reduced-motion` snaps the ring, skips the dive animation and keeps video off.
- The axe test in `e2e/gallery.spec.ts` must stay at zero WCAG A/AA violations.

## Adding a scene

1. Copy the page into `public/scenes/<id>.html`, with any relative assets beside it.
2. Add a poster: a frame from a render (`ffmpeg -ss T -i render.mp4 -frames:v 1 -q:v 3 public/media/<id>.jpg`), or run `node scripts/capture-posters.mjs <id>` after adding its settle time there.
3. Optional loop: 6 s, 720p, H.264, `-crf 22 -movflags +faststart`, as `public/media/<id>.mp4`.
4. Add the entry to `src/data/works.ts`. Every `tech` line must be something the scene's code actually does.
5. Add the id to the asset test in `e2e/gallery.spec.ts`.
