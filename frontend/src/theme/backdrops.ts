import type { CSSProperties } from 'react';

import type { StylePreset } from './palettes';

// Vector backdrops drawn behind the panel in the preset's own colours (no images, no glow).
export type BackdropId =
  | 'plain'
  | 'topo'
  | 'waves'
  | 'mountains'
  | 'sakura'
  | 'stars'
  | 'ribbons'
  | 'network'
  | 'track'
  | 'can';

export const BACKDROPS: BackdropId[] = [
  'plain',
  'topo',
  'waves',
  'mountains',
  'sakura',
  'stars',
  'ribbons',
  'network',
  'track',
  'can',
];

export const DEFAULT_BACKDROP: Record<StylePreset, BackdropId> = {
  mono: 'topo',
  pastel: 'sakura',
  ocean: 'waves',
  emerald: 'network',
  obsidian: 'stars',
  energy: 'can',
};

export const BACKDROP_W = 1440;
export const BACKDROP_H = 1240;

type Ink = 'text' | 'accent' | 'accent2' | 'sakura';
interface Layer {
  d: string;
  fill: boolean;
  ink: Ink;
  opacity: number;
  width?: number;
}

export interface BackdropPath {
  d: string;
  style: CSSProperties;
}

function rng(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}
const r1 = (v: number) => Math.round(v * 10) / 10;
function poly(pts: [number, number][], closed: boolean): string {
  return (
    pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join(' ') + (closed ? ' Z' : '')
  );
}
function circle(cx: number, cy: number, r: number): string {
  return `M${r1(cx - r)} ${r1(cy)} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;
}
type Cmd = [string, ...number[]];
function shape(cmds: Cmd[], tx: number, ty: number, sc: number, rot: number): string {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return (
    cmds
      .map((cm) => {
        let out = cm[0];
        for (let i = 1; i < cm.length; i += 2) {
          const x = (cm[i] as number) * sc;
          const y = (cm[i + 1] as number) * sc;
          out += `${i > 1 ? ' ' : ''}${r1(tx + x * c - y * s)} ${r1(ty + x * s + y * c)}`;
        }
        return out;
      })
      .join(' ') + ' Z'
  );
}
const PETAL: Cmd[] = [
  ['M', 0, -1],
  ['C', 0.55, -0.95, 0.75, 0.25, 0.08, 1],
  ['L', 0, 0.82],
  ['L', -0.08, 1],
  ['C', -0.75, 0.25, -0.55, -0.95, 0, -1],
];
const SPARK: Cmd[] = [
  ['M', 0, -1],
  ['C', 0.07, -0.07, 0.07, -0.07, 1, 0],
  ['C', 0.07, 0.07, 0.07, 0.07, 0, 1],
  ['C', -0.07, 0.07, -0.07, 0.07, -1, 0],
  ['C', -0.07, -0.07, -0.07, -0.07, 0, -1],
];

function build(): Record<BackdropId, Layer[]> {
  const W = BACKDROP_W;
  const H = BACKDROP_H;
  const topo: string[] = [];
  for (const [cx, cy, ph] of [
    [1180, 230, 0],
    [210, 1030, 2],
  ]) {
    for (let k = 1; k <= 13; k++) {
      const pts: [number, number][] = [];
      const r = 30 + k * 40;
      for (let a = 0; a < 72; a++) {
        const t = (a / 72) * Math.PI * 2;
        const rr =
          r * (1 + 0.13 * Math.sin(3 * t + k * 0.32 + ph) + 0.06 * Math.sin(5 * t - k * 0.5));
        pts.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t) * 0.8]);
      }
      topo.push(poly(pts, true));
    }
  }
  const waves: string[] = [];
  const wavesAccent: string[] = [];
  for (let i = 0; i < 22; i++) {
    const pts: [number, number][] = [];
    const y0 = 60 + i * 54;
    for (let x = 0; x <= W; x += 30)
      pts.push([x, y0 + 26 * Math.sin(x / 190 + i * 0.38) + 12 * Math.sin(x / 83 - i * 0.21)]);
    (i % 5 === 2 ? wavesAccent : waves).push(poly(pts, false));
  }
  const ranges: Layer[] = [];
  for (let l = 0; l < 4; l++) {
    const pts: [number, number][] = [[0, H]];
    const base = 760 + l * 105;
    for (let x = 0; x <= W; x += 40) {
      pts.push([
        x,
        base -
          (150 - l * 22) * Math.pow(Math.abs(Math.sin(x / (300 - l * 30) + l * 1.7)), 1.6) -
          30 * Math.sin(x / 70 + l),
      ]);
    }
    pts.push([W, H]);
    ranges.push({ d: poly(pts, true), fill: true, ink: 'accent', opacity: 0.05 + l * 0.035 });
  }
  const rs = rng(7);
  const petalsA: string[] = [];
  const petalsB: string[] = [];
  for (let p = 0; p < 64; p++) {
    const near = p < 40;
    const px = near ? W - Math.pow(rs(), 1.6) * 760 : rs() * W;
    const py = near ? Math.pow(rs(), 1.4) * 620 : 300 + rs() * 900;
    const sc = (near ? 13 : 9) + rs() * (near ? 20 : 11);
    (p % 3 === 0 ? petalsB : petalsA).push(shape(PETAL, px, py, sc, rs() * Math.PI * 2));
  }
  const rst = rng(21);
  const dust: string[] = [];
  for (let d = 0; d < 70; d++) dust.push(shape(SPARK, rst() * W, rst() * H, 4 + rst() * 8, 0));
  const bigStars = [
    shape(SPARK, 1150, 210, 120, 0),
    shape(SPARK, 1300, 360, 60, 0.2),
    shape(SPARK, 1040, 400, 34, -0.15),
  ].join(' ');
  const bands = [
    'M-200 1140 C 260 900, 520 1180, 900 820 S 1400 380, 1700 260',
    'M-200 980 C 300 760, 600 1020, 980 640 S 1500 260, 1700 60',
    'M-200 1300 C 400 1120, 760 1260, 1100 1000 S 1500 760, 1700 700',
  ];
  const rn = rng(5);
  const nodes: [number, number][] = [];
  for (let n = 0; n < 38; n++) nodes.push([60 + rn() * (W - 120), 60 + rn() * (H - 120)]);
  const links: string[] = [];
  const dots: string[] = [];
  const hubs: string[] = [];
  nodes.forEach((a, ai) => {
    nodes.forEach((b, bi) => {
      if (bi > ai && Math.hypot(a[0] - b[0], a[1] - b[1]) < 250)
        links.push(`M${r1(a[0])} ${r1(a[1])} L${r1(b[0])} ${r1(b[1])}`);
    });
    if (ai % 7 === 0) hubs.push(circle(a[0], a[1], 9));
    dots.push(circle(a[0], a[1], ai % 7 === 0 ? 4.5 : 2.6));
  });
  const rr = rng(33);
  const speed: string[] = [];
  for (let i = 0; i < 30; i++) {
    const sy = 80 + rr() * 1080;
    const sx = 520 + rr() * 900;
    const len = 140 + rr() * 420;
    speed.push(`M${r1(sx)} ${r1(sy)} L${r1(sx - len)} ${r1(sy + len * 0.22)}`);
  }
  const checks: string[] = [];
  for (let cy = 0; cy < 6; cy++) {
    for (let cx = 0; cx < 9; cx++) {
      if ((cx + cy) % 2) continue;
      const bx = 1530 + cx * 26;
      const by = 1010 + cy * 26;
      checks.push(
        poly(
          [
            [bx - by * 0.35, by],
            [bx + 26 - by * 0.35, by],
            [bx + 26 - (by + 26) * 0.35, by + 26],
            [bx - (by + 26) * 0.35, by + 26],
          ],
          true,
        ),
      );
    }
  }
  const diamondsA: string[] = [];
  const diamondsB: string[] = [];
  for (let gy = 0; gy < 30; gy++) {
    for (let gx = 0; gx < 30; gx++) {
      const dx = gx * 52 + (gy % 2) * 26;
      const dy = gy * 26 + 380;
      if (dx + (H - dy) * 1.25 > 1150 || dx > W) continue;
      const dm = poly(
        [
          [dx, dy - 24],
          [dx + 24, dy],
          [dx, dy + 24],
          [dx - 24, dy],
        ],
        true,
      );
      ((gx + gy) % 3 === 0 ? diamondsB : diamondsA).push(dm);
    }
  }
  return {
    plain: [],
    topo: [{ d: topo.join(' '), fill: false, ink: 'text', opacity: 0.11, width: 1 }],
    waves: [
      { d: waves.join(' '), fill: false, ink: 'text', opacity: 0.1, width: 1 },
      { d: wavesAccent.join(' '), fill: false, ink: 'accent', opacity: 0.35, width: 1.4 },
    ],
    mountains: [
      { d: circle(1090, 470, 96), fill: false, ink: 'accent', opacity: 0.35, width: 1.5 },
      ...ranges,
    ],
    sakura: [
      { d: petalsA.join(' '), fill: true, ink: 'sakura', opacity: 0.22 },
      { d: petalsB.join(' '), fill: true, ink: 'sakura', opacity: 0.4 },
    ],
    stars: [
      { d: bigStars, fill: false, ink: 'text', opacity: 0.28, width: 1.2 },
      { d: bigStars, fill: true, ink: 'text', opacity: 0.04 },
      { d: dust.join(' '), fill: true, ink: 'text', opacity: 0.22 },
    ],
    ribbons: [
      { d: bands[0], fill: false, ink: 'accent', opacity: 0.07, width: 190 },
      { d: bands[1], fill: false, ink: 'accent', opacity: 0.05, width: 120 },
      { d: bands[2], fill: false, ink: 'text', opacity: 0.04, width: 240 },
      { d: bands.join(' '), fill: false, ink: 'text', opacity: 0.16, width: 1 },
    ],
    network: [
      { d: links.join(' '), fill: false, ink: 'text', opacity: 0.1, width: 1 },
      { d: dots.join(' '), fill: true, ink: 'accent', opacity: 0.45 },
      { d: hubs.join(' '), fill: false, ink: 'accent', opacity: 0.35, width: 1.2 },
    ],
    track: [
      { d: circle(1150, 250, 150), fill: true, ink: 'accent2', opacity: 0.13 },
      {
        d: 'M-120 1180 L 1560 520 M-120 1230 L 1560 570 M-120 1270 L 1560 610',
        fill: false,
        ink: 'accent',
        opacity: 0.3,
        width: 14,
      },
      { d: 'M-120 1206 L 1560 546', fill: false, ink: 'accent2', opacity: 0.45, width: 4 },
      { d: speed.join(' '), fill: false, ink: 'text', opacity: 0.1, width: 1.2 },
      { d: checks.join(' '), fill: true, ink: 'text', opacity: 0.1 },
    ],
    can: [
      { d: diamondsA.join(' '), fill: true, ink: 'text', opacity: 0.06 },
      { d: diamondsB.join(' '), fill: true, ink: 'accent', opacity: 0.1 },
      { d: circle(1130, 300, 170), fill: true, ink: 'accent2', opacity: 0.18 },
      { d: 'M-120 1010 L 1560 330', fill: false, ink: 'accent', opacity: 0.2, width: 54 },
      { d: 'M-120 1066 L 1560 386', fill: false, ink: 'accent2', opacity: 0.4, width: 7 },
    ],
  };
}

let cache: Record<BackdropId, Layer[]> | null = null;

const INK: Record<Ink, string> = {
  text: 'var(--fb-text)',
  accent: 'var(--fb-accent)',
  accent2: 'var(--fb-accent-2, #ffc906)',
  sakura: 'color-mix(in srgb, var(--fb-accent) 12%, #ec8fbe)',
};

// Dark grounds swallow thin lines, so their ink is boosted; opacity 0..90 fades the art.
export function backdropStrength(mode: 'light' | 'dark' | 'amoled', opacity: number): number {
  const base = mode === 'light' ? 1.15 : mode === 'amoled' ? 1.5 : 1.9;
  return base * (1 - Math.min(90, Math.max(0, opacity)) / 100);
}

export function backdropPaths(id: BackdropId, strength: number): BackdropPath[] {
  cache ??= build();
  return (cache[id] ?? []).map((l) => {
    const alpha = Math.min(1, l.opacity * strength);
    return {
      d: l.d,
      style: l.fill
        ? { fill: INK[l.ink], fillOpacity: alpha, stroke: 'none' }
        : {
            fill: 'none',
            stroke: INK[l.ink],
            strokeOpacity: alpha,
            strokeWidth: l.width,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          },
    };
  });
}
