// Pure palette data shared by the web panel (useTheme) and the mobile app; mirrors
// styles/theme.css because antd and React Native need literal colours.
export type StylePreset = 'mono' | 'pastel' | 'ocean' | 'emerald' | 'obsidian' | 'energy';
export const STYLE_PRESETS: StylePreset[] = [
  'mono',
  'pastel',
  'ocean',
  'emerald',
  'obsidian',
  'energy',
];

// Энергия comes in series, after the editions of Red Bull cans.
export type EnergyEdition = 'classic' | 'sugarfree' | 'winter' | 'coconut' | 'tropical' | 'red';
export const ENERGY_EDITIONS: EnergyEdition[] = [
  'classic',
  'sugarfree',
  'winter',
  'coconut',
  'tropical',
  'red',
];

export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  elevated: string;
  border: string;
  borderStrong: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accentHover: string;
  accentActive: string;
  onAccent: string;
  accentSoft: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  chart: [string, string, string];
}

const DARK: Palette = {
  bg: '#0a0a0a',
  surface: '#141414',
  surface2: '#1b1b1b',
  elevated: '#1a1a1a',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  text: '#f5f5f5',
  text2: '#b4b4b4',
  text3: '#8f8f8f',
  accent: '#f5f5f5',
  accentHover: '#ffffff',
  accentActive: '#d9d9d9',
  onAccent: '#0a0a0a',
  accentSoft: 'rgba(255, 255, 255, 0.08)',
  success: '#7dcea0',
  warning: '#e2b86b',
  error: '#ec7a7a',
  info: '#9db8db',
  chart: ['#f5f5f5', '#9db8db', '#e2b86b'],
};

const ULTRA: Palette = {
  ...DARK,
  bg: '#000000',
  surface: '#0a0a0a',
  surface2: '#111111',
  elevated: '#0f0f0f',
  border: 'rgba(255, 255, 255, 0.07)',
  borderStrong: 'rgba(255, 255, 255, 0.12)',
};

const LIGHT: Palette = {
  bg: '#f3f3f2',
  surface: '#ffffff',
  surface2: '#f4f4f3',
  elevated: '#ffffff',
  border: 'rgba(0, 0, 0, 0.08)',
  borderStrong: 'rgba(0, 0, 0, 0.15)',
  text: '#111111',
  text2: '#4d4d4d',
  text3: '#666666',
  accent: '#111111',
  accentHover: '#2b2b2b',
  accentActive: '#000000',
  onAccent: '#ffffff',
  accentSoft: 'rgba(0, 0, 0, 0.05)',
  success: '#1f7a45',
  warning: '#8a5a10',
  error: '#b3362f',
  info: '#33608f',
  chart: ['#111111', '#33608f', '#8a5a10'],
};

// Pastel: lemon / pink / lilac / navy on near-black graphite or lavender paper.
const PASTEL_DARK: Palette = {
  bg: '#0b0b0d',
  surface: '#19191c',
  surface2: '#222226',
  elevated: '#1f1f23',
  border: 'rgba(255, 255, 255, 0.07)',
  borderStrong: 'rgba(255, 255, 255, 0.13)',
  text: '#f4f3fa',
  text2: '#bdbbcf',
  text3: '#918fa6',
  accent: '#a8a3f6',
  accentHover: '#bcb8f9',
  accentActive: '#938dec',
  onAccent: '#16163a',
  accentSoft: 'rgba(168, 163, 246, 0.14)',
  success: '#8fd8ae',
  warning: '#f8ffa1',
  error: '#ff8fa3',
  info: '#a9c0ff',
  chart: ['#a8a3f6', '#f6d5ee', '#f8ffa1'],
};

const PASTEL_ULTRA: Palette = {
  ...PASTEL_DARK,
  bg: '#000000',
  surface: '#111113',
  surface2: '#18181b',
  elevated: '#151518',
  border: 'rgba(255, 255, 255, 0.07)',
  borderStrong: 'rgba(255, 255, 255, 0.12)',
};

const PASTEL_LIGHT: Palette = {
  bg: '#f4f3fb',
  surface: '#ffffff',
  surface2: '#efeef9',
  elevated: '#ffffff',
  border: 'rgba(36, 49, 107, 0.10)',
  borderStrong: 'rgba(36, 49, 107, 0.18)',
  text: '#16163a',
  text2: '#45456a',
  text3: '#5e5e80',
  accent: '#24316b',
  accentHover: '#2f3e85',
  accentActive: '#1a2452',
  onAccent: '#ffffff',
  accentSoft: 'rgba(168, 163, 246, 0.22)',
  success: '#1f7a45',
  warning: '#7d6a00',
  error: '#b3364f',
  info: '#3a4fb0',
  chart: ['#24316b', '#8b84ee', '#c25a9f'],
};

// Ocean: a clear blue accent on blue-tinted graphite or cool paper.
const OCEAN_DARK: Palette = {
  bg: '#0a0d14',
  surface: '#121722',
  surface2: '#19202d',
  elevated: '#161c28',
  border: 'rgba(148, 180, 255, 0.08)',
  borderStrong: 'rgba(148, 180, 255, 0.15)',
  text: '#eef2fa',
  text2: '#aeb8cc',
  text3: '#8591a8',
  accent: '#2f74ff',
  accentHover: '#4b88ff',
  accentActive: '#1f5fe0',
  onAccent: '#ffffff',
  accentSoft: 'rgba(47, 116, 255, 0.16)',
  success: '#6fd3a0',
  warning: '#e8bd6a',
  error: '#f07a7a',
  info: '#7fb0ff',
  chart: ['#2f74ff', '#7fb0ff', '#e8bd6a'],
};

const OCEAN_ULTRA: Palette = {
  ...OCEAN_DARK,
  bg: '#000000',
  surface: '#080b12',
  surface2: '#0e131c',
  elevated: '#0b1018',
  border: 'rgba(148, 180, 255, 0.07)',
  borderStrong: 'rgba(148, 180, 255, 0.13)',
};

const OCEAN_LIGHT: Palette = {
  bg: '#f2f5fb',
  surface: '#ffffff',
  surface2: '#eef2fa',
  elevated: '#ffffff',
  border: 'rgba(20, 40, 90, 0.09)',
  borderStrong: 'rgba(20, 40, 90, 0.16)',
  text: '#0e1a33',
  text2: '#3f4d68',
  text3: '#5b6884',
  accent: '#1f5fd6',
  accentHover: '#2c6ff0',
  accentActive: '#1a4fb3',
  onAccent: '#ffffff',
  accentSoft: 'rgba(31, 95, 214, 0.1)',
  success: '#1f7a45',
  warning: '#8a5a10',
  error: '#b3362f',
  info: '#1f5fd6',
  chart: ['#1f5fd6', '#5f8fe6', '#8a5a10'],
};

// Emerald: a fresh green accent on green-tinted graphite or mint paper.
const EMERALD_DARK: Palette = {
  bg: '#090c0b',
  surface: '#121715',
  surface2: '#19201d',
  elevated: '#161c19',
  border: 'rgba(160, 255, 210, 0.07)',
  borderStrong: 'rgba(160, 255, 210, 0.14)',
  text: '#edf5f1',
  text2: '#adbdb5',
  text3: '#85968e',
  accent: '#34d399',
  accentHover: '#52deab',
  accentActive: '#22b583',
  onAccent: '#04140d',
  accentSoft: 'rgba(52, 211, 153, 0.14)',
  success: '#34d399',
  warning: '#e8c06a',
  error: '#f07a7a',
  info: '#8ab8e0',
  chart: ['#34d399', '#8ab8e0', '#e8c06a'],
};

const EMERALD_ULTRA: Palette = {
  ...EMERALD_DARK,
  bg: '#000000',
  surface: '#080b0a',
  surface2: '#0e1311',
  elevated: '#0b0f0d',
  border: 'rgba(160, 255, 210, 0.06)',
  borderStrong: 'rgba(160, 255, 210, 0.12)',
};

const EMERALD_LIGHT: Palette = {
  bg: '#f2f6f4',
  surface: '#ffffff',
  surface2: '#edf3f0',
  elevated: '#ffffff',
  border: 'rgba(10, 60, 40, 0.09)',
  borderStrong: 'rgba(10, 60, 40, 0.16)',
  text: '#0c1f17',
  text2: '#3d5249',
  text3: '#586c63',
  accent: '#0f7a55',
  accentHover: '#138c62',
  accentActive: '#0b6646',
  onAccent: '#ffffff',
  accentSoft: 'rgba(15, 122, 85, 0.1)',
  success: '#1f7a45',
  warning: '#8a5a10',
  error: '#b3362f',
  info: '#2f6690',
  chart: ['#0f7a55', '#4fae8a', '#8a5a10'],
};

const OBSIDIAN_DARK: Palette = {
  bg: '#050506',
  surface: '#0f0f10',
  surface2: '#18181a',
  elevated: '#141416',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.17)',
  text: '#f2f2f2',
  text2: '#b5b5b5',
  text3: '#8c8c8c',
  accent: '#ececec',
  accentHover: '#ffffff',
  accentActive: '#cfcfcf',
  onAccent: '#0a0a0a',
  accentSoft: 'rgba(255, 255, 255, 0.07)',
  success: '#8fe3b0',
  warning: '#e9c46a',
  error: '#ff8f8f',
  info: '#a9c7ff',
  chart: ['#ececec', '#a9c7ff', '#e9c46a'],
};

const OBSIDIAN_ULTRA: Palette = {
  ...OBSIDIAN_DARK,
  bg: '#000000',
  surface: '#0a0a0a',
  surface2: '#111112',
  elevated: '#0e0e0f',
};

const OBSIDIAN_LIGHT: Palette = {
  bg: '#e9e9e9',
  surface: '#f7f7f7',
  surface2: '#f0f0f0',
  elevated: '#ffffff',
  border: 'rgba(0, 0, 0, 0.08)',
  borderStrong: 'rgba(0, 0, 0, 0.17)',
  text: '#0d0d0d',
  text2: '#424242',
  text3: '#626262',
  accent: '#111111',
  accentHover: '#000000',
  accentActive: '#2a2a2a',
  onAccent: '#ffffff',
  accentSoft: 'rgba(0, 0, 0, 0.05)',
  success: '#1f7a45',
  warning: '#8a5a10',
  error: '#b3362f',
  info: '#33608f',
  chart: ['#111111', '#33608f', '#8a5a10'],
};

const CLASSIC_DARK: Palette = {
  bg: '#0b1330',
  surface: '#121e48',
  surface2: '#192858',
  elevated: '#16224f',
  border: 'rgba(200, 210, 235, 0.12)',
  borderStrong: 'rgba(200, 210, 235, 0.24)',
  text: '#eef1f8',
  text2: '#b8c0d8',
  text3: '#8d97b6',
  accent: '#e0174a',
  accentHover: '#f0315f',
  accentActive: '#c20f3e',
  onAccent: '#ffffff',
  accentSoft: 'rgba(224, 23, 74, 0.15)',
  success: '#4fd18b',
  warning: '#ffc906',
  error: '#ff6b81',
  info: '#7aa2ff',
  chart: ['#e0174a', '#ffc906', '#7aa2ff'],
};

const CLASSIC_ULTRA: Palette = {
  ...CLASSIC_DARK,
  bg: '#000000',
  surface: '#080e20',
  surface2: '#0d142c',
  elevated: '#0a0f24',
};

const CLASSIC_LIGHT: Palette = {
  bg: '#e6e9f0',
  surface: '#ffffff',
  surface2: '#eef1f6',
  elevated: '#ffffff',
  border: 'rgba(20, 35, 90, 0.10)',
  borderStrong: 'rgba(20, 35, 90, 0.20)',
  text: '#0f1d4a',
  text2: '#38446e',
  text3: '#56618a',
  accent: '#c8093a',
  accentHover: '#de1a4b',
  accentActive: '#a80731',
  onAccent: '#ffffff',
  accentSoft: 'rgba(200, 9, 58, 0.08)',
  success: '#1f7a45',
  warning: '#8a6200',
  error: '#b3243a',
  info: '#1c2f9e',
  chart: ['#c8093a', '#1c2f9e', '#8a6200'],
};

const SUGARFREE_DARK: Palette = {
  bg: '#08161f',
  surface: '#0f2331',
  surface2: '#152d3f',
  elevated: '#122838',
  border: 'rgba(160, 215, 240, 0.12)',
  borderStrong: 'rgba(160, 215, 240, 0.24)',
  text: '#eaf5fb',
  text2: '#b0cbdb',
  text3: '#86a3b5',
  accent: '#4fb6ec',
  accentHover: '#6cc4f1',
  accentActive: '#2fa2de',
  onAccent: '#05202f',
  accentSoft: 'rgba(79, 182, 236, 0.15)',
  success: '#5fd39b',
  warning: '#f2c25b',
  error: '#ff6b81',
  info: '#8fd0f5',
  chart: ['#4fb6ec', '#e0174a', '#f2c25b'],
};

const SUGARFREE_ULTRA: Palette = {
  ...SUGARFREE_DARK,
  bg: '#000000',
  surface: '#071016',
  surface2: '#0b1720',
  elevated: '#081219',
};

const SUGARFREE_LIGHT: Palette = {
  bg: '#eaf4fa',
  surface: '#ffffff',
  surface2: '#e8f2f8',
  elevated: '#ffffff',
  border: 'rgba(10, 70, 110, 0.10)',
  borderStrong: 'rgba(10, 70, 110, 0.20)',
  text: '#0b2a3d',
  text2: '#33536a',
  text3: '#4f6c80',
  accent: '#0b74ad',
  accentHover: '#1185c4',
  accentActive: '#08618f',
  onAccent: '#ffffff',
  accentSoft: 'rgba(11, 116, 173, 0.09)',
  success: '#1f7a45',
  warning: '#8a5a10',
  error: '#b3243a',
  info: '#0b74ad',
  chart: ['#0b74ad', '#c8093a', '#8a5a10'],
};

const WINTER_DARK: Palette = {
  bg: '#0b1220',
  surface: '#121d31',
  surface2: '#18263e',
  elevated: '#152238',
  border: 'rgba(190, 225, 255, 0.12)',
  borderStrong: 'rgba(190, 225, 255, 0.24)',
  text: '#eef6fd',
  text2: '#bcd0e2',
  text3: '#90a6bb',
  accent: '#9fd4ff',
  accentHover: '#b8e0ff',
  accentActive: '#84c6fa',
  onAccent: '#0b1a2e',
  accentSoft: 'rgba(159, 212, 255, 0.14)',
  success: '#7fe0c0',
  warning: '#f2d07a',
  error: '#ff8a9a',
  info: '#b9dcff',
  chart: ['#9fd4ff', '#ffffff', '#f2d07a'],
};

const WINTER_ULTRA: Palette = {
  ...WINTER_DARK,
  bg: '#000000',
  surface: '#080d16',
  surface2: '#0c131f',
  elevated: '#090f19',
};

const WINTER_LIGHT: Palette = {
  bg: '#eef5fb',
  surface: '#ffffff',
  surface2: '#ebf3fa',
  elevated: '#ffffff',
  border: 'rgba(30, 70, 120, 0.10)',
  borderStrong: 'rgba(30, 70, 120, 0.20)',
  text: '#13253d',
  text2: '#3b5170',
  text3: '#566c88',
  accent: '#2a6fb5',
  accentHover: '#3a80c7',
  accentActive: '#1f5c99',
  onAccent: '#ffffff',
  accentSoft: 'rgba(42, 111, 181, 0.09)',
  success: '#1f7a5e',
  warning: '#8a5a10',
  error: '#b0384a',
  info: '#2a6fb5',
  chart: ['#2a6fb5', '#7fb8e8', '#8a5a10'],
};

const COCONUT_DARK: Palette = {
  bg: '#14110d',
  surface: '#1f1a14',
  surface2: '#28221a',
  elevated: '#241e17',
  border: 'rgba(245, 230, 205, 0.10)',
  borderStrong: 'rgba(245, 230, 205, 0.20)',
  text: '#f7f2e8',
  text2: '#d2c6b2',
  text3: '#a3967f',
  accent: '#3cc6d6',
  accentHover: '#5ad2df',
  accentActive: '#25b0c0',
  onAccent: '#052126',
  accentSoft: 'rgba(60, 198, 214, 0.14)',
  success: '#7fd6a0',
  warning: '#f0c36b',
  error: '#ff8a8a',
  info: '#7fd3e0',
  chart: ['#3cc6d6', '#e3c9a0', '#f0c36b'],
};

const COCONUT_ULTRA: Palette = {
  ...COCONUT_DARK,
  bg: '#000000',
  surface: '#0e0c09',
  surface2: '#14110d',
  elevated: '#100e0a',
};

const COCONUT_LIGHT: Palette = {
  bg: '#f6f2ea',
  surface: '#fffdf9',
  surface2: '#f1ebe0',
  elevated: '#ffffff',
  border: 'rgba(70, 50, 25, 0.10)',
  borderStrong: 'rgba(70, 50, 25, 0.20)',
  text: '#1d2a44',
  text2: '#44506b',
  text3: '#606a82',
  accent: '#0f8ea3',
  accentHover: '#14a0b7',
  accentActive: '#0b7787',
  onAccent: '#ffffff',
  accentSoft: 'rgba(15, 142, 163, 0.09)',
  success: '#2f7a3a',
  warning: '#8a5a10',
  error: '#b3362f',
  info: '#0f7f93',
  chart: ['#0f8ea3', '#a07850', '#8a5a10'],
};

const TROPICAL_DARK: Palette = {
  bg: '#13110a',
  surface: '#1e1a0f',
  surface2: '#272213',
  elevated: '#231e11',
  border: 'rgba(255, 220, 120, 0.11)',
  borderStrong: 'rgba(255, 220, 120, 0.22)',
  text: '#fbf6e6',
  text2: '#d6cba9',
  text3: '#a99d7c',
  accent: '#ffc906',
  accentHover: '#ffd43a',
  accentActive: '#e6b400',
  onAccent: '#1a1404',
  accentSoft: 'rgba(255, 201, 6, 0.13)',
  success: '#6fd39a',
  warning: '#ffb347',
  error: '#ff7a7a',
  info: '#8fc9ff',
  chart: ['#ffc906', '#ff8a00', '#8fc9ff'],
};

const TROPICAL_ULTRA: Palette = {
  ...TROPICAL_DARK,
  bg: '#000000',
  surface: '#0e0c07',
  surface2: '#14110a',
  elevated: '#100e08',
};

const TROPICAL_LIGHT: Palette = {
  bg: '#fff9e6',
  surface: '#ffffff',
  surface2: '#fdf3d4',
  elevated: '#ffffff',
  border: 'rgba(90, 70, 0, 0.11)',
  borderStrong: 'rgba(90, 70, 0, 0.22)',
  text: '#231c05',
  text2: '#4f4420',
  text3: '#6b5f38',
  accent: '#8a6a00',
  accentHover: '#9e7a00',
  accentActive: '#735800',
  onAccent: '#ffffff',
  accentSoft: 'rgba(138, 106, 0, 0.10)',
  success: '#2f7a3a',
  warning: '#8a5a10',
  error: '#b3362f',
  info: '#33608f',
  chart: ['#8a6a00', '#c25e00', '#33608f'],
};

const RED_DARK: Palette = {
  bg: '#170a0d',
  surface: '#241115',
  surface2: '#2f161c',
  elevated: '#2a1419',
  border: 'rgba(255, 190, 200, 0.11)',
  borderStrong: 'rgba(255, 190, 200, 0.22)',
  text: '#fdf0f2',
  text2: '#dcb9bf',
  text3: '#ad8b92',
  accent: '#ff4d64',
  accentHover: '#ff6a7e',
  accentActive: '#e8394f',
  onAccent: '#ffffff',
  accentSoft: 'rgba(255, 77, 100, 0.15)',
  success: '#5fd08a',
  warning: '#f2c25b',
  error: '#ff8a8a',
  info: '#8fc0ff',
  chart: ['#ff4d64', '#5fd08a', '#f2c25b'],
};

const RED_ULTRA: Palette = {
  ...RED_DARK,
  bg: '#000000',
  surface: '#100809',
  surface2: '#180b0e',
  elevated: '#13090b',
};

const RED_LIGHT: Palette = {
  bg: '#fff3f4',
  surface: '#ffffff',
  surface2: '#fdeaed',
  elevated: '#ffffff',
  border: 'rgba(120, 20, 40, 0.10)',
  borderStrong: 'rgba(120, 20, 40, 0.20)',
  text: '#2b0d14',
  text2: '#5b2f38',
  text3: '#7a4f58',
  accent: '#c81d3a',
  accentHover: '#dc2f4c',
  accentActive: '#a8162f',
  onAccent: '#ffffff',
  accentSoft: 'rgba(200, 29, 58, 0.08)',
  success: '#2f8a55',
  warning: '#8a5a10',
  error: '#b3243a',
  info: '#33608f',
  chart: ['#c81d3a', '#2f8a55', '#8a5a10'],
};

export const PALETTES: Record<StylePreset, { dark: Palette; ultra: Palette; light: Palette }> = {
  mono: { dark: DARK, ultra: ULTRA, light: LIGHT },
  pastel: { dark: PASTEL_DARK, ultra: PASTEL_ULTRA, light: PASTEL_LIGHT },
  ocean: { dark: OCEAN_DARK, ultra: OCEAN_ULTRA, light: OCEAN_LIGHT },
  emerald: { dark: EMERALD_DARK, ultra: EMERALD_ULTRA, light: EMERALD_LIGHT },
  obsidian: { dark: OBSIDIAN_DARK, ultra: OBSIDIAN_ULTRA, light: OBSIDIAN_LIGHT },
  energy: { dark: CLASSIC_DARK, ultra: CLASSIC_ULTRA, light: CLASSIC_LIGHT },
};

export const ENERGY_PALETTES: Record<
  EnergyEdition,
  { dark: Palette; ultra: Palette; light: Palette }
> = {
  classic: PALETTES.energy,
  sugarfree: { dark: SUGARFREE_DARK, ultra: SUGARFREE_ULTRA, light: SUGARFREE_LIGHT },
  winter: { dark: WINTER_DARK, ultra: WINTER_ULTRA, light: WINTER_LIGHT },
  coconut: { dark: COCONUT_DARK, ultra: COCONUT_ULTRA, light: COCONUT_LIGHT },
  tropical: { dark: TROPICAL_DARK, ultra: TROPICAL_ULTRA, light: TROPICAL_LIGHT },
  red: { dark: RED_DARK, ultra: RED_ULTRA, light: RED_LIGHT },
};
