export interface Work {
  id: string;
  title: string;
  /** The painting or reference the scene answers, when there is one. */
  after?: string;
  blurb: string;
  /** What the scene demonstrates, in the words a reviewer would search for. */
  tech: string[];
  /** Poster still, relative to the site root. */
  poster: string;
  /** Optional 6 s preview loop shown when the visitor steps up to the frame. */
  loop?: string;
  /** Width / height of the poster. */
  aspect: number;
  /** The live scene, relative to the site root. */
  scene: string;
  /** How to drive the live scene, shown above it. */
  controls: string;
  /** Approximate first-visit download for the live scene. */
  size: string;
}

export const WORKS: readonly Work[] = [
  {
    id: 'merced-river',
    title: 'Merced River',
    after: 'After Albert Bierstadt, 1866',
    blurb: 'Late light through a storm; the river holds the cliffs still while two canoes cross and horses graze the meadow.',
    tech: [
      'One height field in JS and GLSL, so instanced grass sits exactly on the terrain',
      'Triplanar rock scans with distance-faded detail',
      'Skinned glTF horses and a CC0 mocap crowd (meshopt)',
      'Kuwahara oil-paint pass and 3D LUT grading',
      'Script-driven camera on a fixed time step: renders are frame-for-frame repeatable',
    ],
    poster: 'media/merced-river.jpg',
    loop: 'media/merced-river.mp4',
    aspect: 16 / 9,
    scene: 'scenes/merced-river.html',
    controls: 'Drag to look · scroll to zoom · W A S D to walk',
    size: '≈ 14 MB',
  },
  {
    id: 'isle-of-the-dead',
    title: 'Isle of the Dead',
    after: 'After Arnold Böcklin, 1880',
    blurb: 'Evening on a still sea: the last light on the rock, the cypresses already dark, a boat crossing to the landing.',
    tech: [
      'Procedural cliffs: stone masses with bedding ledges and jointed faces',
      'Instanced cypresses and grass on a shared JS/GLSL terrain',
      'Walkable island with preset viewpoints',
      'Post chain: bloom, oil paint, LUT, grain',
    ],
    poster: 'media/isle-of-the-dead.jpg',
    loop: 'media/isle-of-the-dead.mp4',
    aspect: 1008 / 720,
    scene: 'scenes/isle-of-the-dead.html',
    controls: 'Drag to look · scroll to zoom · W A S D to walk',
    size: '≈ 14 MB',
  },
  {
    id: 'fog-hollow',
    title: 'Fog Hollow',
    after: 'After the three.js fog-scattering example',
    blurb: 'Dawn fog lies in the hollow; the low sun breaks through the firs and the far trees dissolve.',
    tech: [
      'Depth-weighted fog blur that never bleeds crisp foreground outward',
      'Crepuscular rays marched toward the sun',
      'First-person walk along the trail',
      'Weather and time-of-day presets',
    ],
    poster: 'media/fog-hollow.jpg',
    loop: 'media/fog-hollow.mp4',
    aspect: 16 / 9,
    scene: 'scenes/fog-hollow.html',
    controls: 'Drag to look · W A S D to walk · Shift to hurry',
    size: '≈ 14 MB',
  },
  {
    id: 'indigo-ridge',
    title: 'Indigo Ridge',
    blurb: 'Blue hour on a grass ridge: a walker climbs past a lone tree as the light goes.',
    tech: [
      'Character built in code: coat, sleeves and boots lofted onto a skeleton, no model file',
      'Grass that follows the camera across a shared JS/GLSL terrain',
      'Four lighting setups and live wind direction and speed',
    ],
    poster: 'media/indigo-ridge.jpg',
    aspect: 16 / 9,
    scene: 'scenes/indigo-ridge.html',
    controls: 'Drag to orbit · right-drag to pan · scroll to zoom',
    size: '≈ 1 MB',
  },
  {
    id: 'dents-du-midi',
    title: 'Dents du Midi',
    after: 'After Gustave Courbet, 1877',
    blurb: 'A goatherd rests on the knoll above the lake while the herd grazes; cloud shadows cross the massif.',
    tech: [
      'Cloud density baked to a world-space texture each frame, so cloud shadows fall everywhere cheaply',
      'Herd and goatherd with soft contact shadows',
      'Oil-paint and natural looks',
    ],
    poster: 'media/dents-du-midi.jpg',
    aspect: 16 / 9,
    scene: 'scenes/dents-du-midi.html',
    controls: 'Drag to look around · scroll to zoom',
    size: '≈ 1 MB',
  },
  {
    id: 'gulf-stream-study',
    title: 'Gulf Stream Study',
    after: 'After Winslow Homer, 1899',
    blurb: 'Mast broken, cane spilled across the deck, sharks working the wake. A sail stands on the horizon.',
    tech: [
      'One wave formula on the CPU and the GPU, so the boat and sharks ride the surface they are drawn on',
      'Procedural sky and exponential fog',
      'A single 20 KB file',
    ],
    poster: 'media/gulf-stream-study.jpg',
    aspect: 16 / 9,
    scene: 'scenes/gulf-stream-study.html',
    controls: 'Watch, or drag to look around',
    size: '≈ 1 MB',
  },
  {
    id: 'rigging-bench',
    title: 'Rigging Bench',
    blurb: 'Drop in a humanoid model and watch it move: bones are matched automatically and CC0 motion capture is retargeted onto it.',
    tech: [
      'Automatic bone mapping by name, then by hierarchy',
      'Mocap retargeting with per-bone rest-pose correction',
      'Sable character cut from 7.2 MB to 1.9 MB with glTF-Transform (meshopt, quantize, simplify)',
    ],
    poster: 'media/rigging-bench.jpg',
    aspect: 934 / 720,
    scene: 'scenes/rigging-bench.html',
    controls: 'Drag to orbit · drop a .glb, .fbx or .obj onto the bench',
    size: '≈ 3 MB',
  },
];
