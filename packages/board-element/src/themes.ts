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
  palette: string[]
  /** The upstream project these values come from. */
  source: string
  licence: string
  url: string
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
