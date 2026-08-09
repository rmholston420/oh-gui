/**
 * docs/specs/07-visual-design.md §7.1 and §7.3.
 *
 * `contrast` is intentionally stored alongside every token rather than in a
 * separate audit sheet. The measured ratio is checked by tokens.test.ts so a
 * colour change cannot leave a stale accessibility claim behind.
 */
export type ThemeTokenName =
  | 'base'
  | 'panel-sunken'
  | 'panel'
  | 'panel-raised'
  | 'text'
  | 'text-muted'
  | 'interactive-border'
  | 'focus-ring'
  | 'agent-active'
  | 'agent-active-bright'
  | 'diff-add'
  | 'diff-delete'
  | 'status-pass'
  | 'status-fail';

export interface ContrastMeasurement {
  /** Token/background used as the measured comparison surface. */
  readonly against: ThemeTokenName;
  /** WCAG relative-luminance contrast ratio, rounded to two decimal places. */
  readonly ratio: number;
}

export interface ThemeToken {
  readonly cssVariable: `--oh-${string}`;
  readonly value: `#${string}`;
  readonly contrast: ContrastMeasurement;
}

/**
 * The only green/red tokens are diff or pass/fail tokens. Do not add a
 * generic "success", "warning", or "error" token: §7.1 reserves those hues.
 *
 * The deep-lapis panels use the exact spec endpoints (#040814 → #0B132B) and
 * an intentionally low-luminance intermediate step for material layering.
 */
export const themeTokens: Readonly<Record<ThemeTokenName, ThemeToken>> = {
  base: {
    cssVariable: '--oh-base',
    value: '#040814',
    contrast: { against: 'base', ratio: 1 },
  },
  'panel-sunken': {
    cssVariable: '--oh-panel-sunken',
    value: '#060B19',
    contrast: { against: 'base', ratio: 1.02 },
  },
  panel: {
    cssVariable: '--oh-panel',
    value: '#070D1F',
    contrast: { against: 'base', ratio: 1.03 },
  },
  'panel-raised': {
    cssVariable: '--oh-panel-raised',
    value: '#0B132B',
    contrast: { against: 'base', ratio: 1.09 },
  },
  text: {
    cssVariable: '--oh-text',
    value: '#F8FAFC',
    contrast: { against: 'base', ratio: 19.12 },
  },
  'text-muted': {
    cssVariable: '--oh-text-muted',
    value: '#B8C4D8',
    contrast: { against: 'base', ratio: 11.36 },
  },
  'interactive-border': {
    cssVariable: '--oh-interactive-border',
    value: '#718096',
    contrast: { against: 'base', ratio: 4.98 },
  },
  'focus-ring': {
    cssVariable: '--oh-focus-ring',
    value: '#93C5FD',
    contrast: { against: 'base', ratio: 11.09 },
  },
  // Reserved exclusively for an agent actively executing or generating.
  'agent-active': {
    cssVariable: '--oh-agent-active',
    value: '#F59E0B',
    contrast: { against: 'base', ratio: 9.31 },
  },
  'agent-active-bright': {
    cssVariable: '--oh-agent-active-bright',
    value: '#FBBF24',
    contrast: { against: 'base', ratio: 11.98 },
  },
  // Green/red are deliberately limited to diff and pass/fail semantics.
  'diff-add': {
    cssVariable: '--oh-diff-add',
    value: '#86EFAC',
    contrast: { against: 'base', ratio: 14.24 },
  },
  'diff-delete': {
    cssVariable: '--oh-diff-delete',
    value: '#FDA4AF',
    contrast: { against: 'base', ratio: 10.58 },
  },
  'status-pass': {
    cssVariable: '--oh-status-pass',
    value: '#86EFAC',
    contrast: { against: 'base', ratio: 14.24 },
  },
  'status-fail': {
    cssVariable: '--oh-status-fail',
    value: '#FCA5A5',
    contrast: { against: 'base', ratio: 10.54 },
  },
} as const;

export const TABULAR_NUMERALS_STYLE = {
  fontVariantNumeric: 'tabular-nums',
} as const;

function relativeLuminance(hex: ThemeToken['value']): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

export function contrastRatio(foreground: ThemeToken['value'], background: ThemeToken['value']): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const light = Math.max(foregroundLuminance, backgroundLuminance);
  const dark = Math.min(foregroundLuminance, backgroundLuminance);
  return (light + 0.05) / (dark + 0.05);
}
