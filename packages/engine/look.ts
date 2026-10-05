// How a board looks, shared by the SVG export, the CLI and the board element.
// Themes ported from open-source editor themes. Each project ships a light and
// a dark variant authored together, so no half is invented here.
//
// Per theme: paper and ink are the project's own background and foreground; an
// accent becomes an arrow colour only above 3:1 against that paper (WCAG 1.4.11
// for graphical objects — a stroke half a cell wide is one); the highlight is
// reserved before the arrows are chosen, so the marker for the longest pieces
// can never be an ordinary colour. `everforest-light` and `ayu-light` carry one
// arrow colour: their accents are built for thin glyphs on near-white paper and
// only one of each clears the floor.

export interface BoardTheme {
  paper: string
  ink: string
  highlight: string
  /** Arrow colours; may be a single colour, which paints a monochrome board. */
  palette: readonly string[]
  /** The upstream project these values come from. */
  source: string
  licence: string
  url: string
}

/** The four colours a board is drawn in. */
export interface BoardColours {
  paper: string
  ink: string
  highlight: string
  palette: readonly string[]
}

/** What a board is drawn in when nothing names a colour; `toSvg` without options draws the same. */
export const DEFAULT_COLOURS: Readonly<BoardColours> = {
  paper: '#f6f6fa',
  ink: '#232447',
  highlight: '#e8467c',
  palette: [],
}

/**
 * Cells of margin unless a view says otherwise; with none, an edge cell's
 * arrowhead ends two hundredths of a cell from the paper's edge.
 */
export const DEFAULT_PAD = 4
/** The point grid is off unless a view asks for it. */
export const DEFAULT_SHOW_POINTS = false
/** The point grid's dot colour. */
export const DEFAULT_POINT_COLOR = '#c9c9d6'
/** The point grid's dot radius, in cells. */
export const DEFAULT_POINT_RADIUS = 0.06

/** The margin a view may ask for, in whole cells: a margin, not a board dimension. */
export const PAD_RANGE: Readonly<{ min: number; max: number }> = { min: 0, max: 16 }
/** A dot's radius in cells; past half a cell it overlaps its neighbours. */
export const POINT_RADIUS_RANGE: Readonly<{ min: number; max: number }> = { min: 0, max: 0.5 }
/** Arrow colours a view may state. */
export const PALETTE_CAP = 8

/** A colour as a view stores it: `#rrggbb`, which a colour input can show and a CLI can type. */
export function isHexColour(c: unknown): c is string {
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)
}

const CATPPUCCIN = { source: 'Catppuccin', licence: 'MIT', url: 'https://github.com/catppuccin/catppuccin' }
const GRUVBOX = { source: 'gruvbox', licence: 'MIT', url: 'https://github.com/morhetz/gruvbox' }
const TOKYONIGHT = { source: 'Tokyo Night', licence: 'Apache-2.0', url: 'https://github.com/folke/tokyonight.nvim' }
const EVERFOREST = { source: 'Everforest', licence: 'MIT', url: 'https://github.com/sainnhe/everforest' }
const ROSE_PINE = { source: 'Rosé Pine', licence: 'MIT', url: 'https://github.com/rose-pine/rose-pine-theme' }
const AYU = { source: 'Ayu', licence: 'MIT', url: 'https://github.com/ayu-theme/ayu-colors' }

export const THEMES: Readonly<Record<string, BoardTheme>> = {
  'catppuccin-mocha': {
    paper: '#1e1e2e',
    ink: '#cdd6f4',
    highlight: '#a6e3a1',
    palette: ['#f5e0dc', '#cba6f7', '#f38ba8', '#89dceb', '#fab387'],
    ...CATPPUCCIN,
  },
  'gruvbox-dark': {
    paper: '#282828',
    ink: '#ebdbb2',
    highlight: '#d3869b',
    palette: ['#fabd2f', '#83a598', '#fb4934', '#fe8019', '#8ec07c'],
    ...GRUVBOX,
  },
  'tokyonight-storm': {
    paper: '#24283b',
    ink: '#c0caf5',
    highlight: '#1abc9c',
    palette: ['#7dcfff', '#ff9e64', '#9ece6a', '#9d7cd8', '#f7768e'],
    ...TOKYONIGHT,
  },
  'everforest-dark': {
    paper: '#2d353b',
    ink: '#d3c6aa',
    highlight: '#d699b6',
    palette: ['#dbbc7f', '#7fbbb3', '#e67e80', '#a7c080', '#e69875'],
    ...EVERFOREST,
  },
  'rose-pine-moon': {
    paper: '#232136',
    ink: '#e0def4',
    highlight: '#c4a7e7',
    palette: ['#f6c177', '#3e8fb0', '#eb6f92', '#9ccfd8', '#ea9a97'],
    ...ROSE_PINE,
  },
  'ayu-dark': {
    paper: '#10141c',
    ink: '#bfbdb6',
    highlight: '#aad94c',
    palette: ['#95e6cb', '#ff8f40', '#d2a6ff', '#59c2ff', '#f07178'],
    ...AYU,
  },
  'catppuccin-latte': {
    paper: '#eff1f5',
    ink: '#4c4f69',
    highlight: '#179299',
    palette: ['#d20f39', '#1e66f5', '#8839ef', '#e64553'],
    ...CATPPUCCIN,
  },
  'gruvbox-light': {
    paper: '#fbf1c7',
    ink: '#3c3836',
    highlight: '#8f3f71',
    palette: ['#9d0006', '#076678', '#79740e', '#427b58', '#b57614'],
    ...GRUVBOX,
  },
  'tokyonight-day': {
    paper: '#e1e2e7',
    ink: '#3760bf',
    highlight: '#f52a65',
    palette: ['#7847bd', '#b15c00', '#118c74', '#007197', '#8c6c3e'],
    ...TOKYONIGHT,
  },
  'everforest-light': {
    paper: '#fdf6e3',
    ink: '#5c6a72',
    highlight: '#3a94c5',
    palette: ['#f85552'],
    ...EVERFOREST,
  },
  'rose-pine-dawn': {
    paper: '#faf4ed',
    ink: '#464261',
    highlight: '#b4637a',
    palette: ['#286983', '#907aa9', '#56949f'],
    ...ROSE_PINE,
  },
  'ayu-light': {
    paper: '#fcfcfc',
    // This theme has no accent to spare: its highlight is the ink, which stands
    // far enough from the one arrow colour for the longest pieces to read.
    ink: '#5c6166',
    highlight: '#5c6166',
    palette: ['#a37acc'],
    ...AYU,
  },
}

/** The theme of that name, or null — an unknown name is ignored, never thrown on. */
export function themeOf(name: string): BoardTheme | null {
  return Object.hasOwn(THEMES, name) ? THEMES[name] ?? null : null
}

/**
 * The colours a board is drawn with: its defaults, then the named theme, then
 * whatever the host stated. Stated beats named beats default, field by field;
 * the lab's SVG export resolves through this too, so the file and the screen agree.
 */
export function resolveColours(theme: string, stated: Partial<BoardColours>): BoardColours {
  const t = themeOf(theme)
  const merged: BoardColours = {
    paper: DEFAULT_COLOURS.paper,
    ink: DEFAULT_COLOURS.ink,
    highlight: DEFAULT_COLOURS.highlight,
    palette: DEFAULT_COLOURS.palette,
    ...(t === null ? {} : { paper: t.paper, ink: t.ink, highlight: t.highlight, palette: t.palette }),
    ...stated,
  }
  return { paper: merged.paper, ink: merged.ink, highlight: merged.highlight, palette: merged.palette }
}
