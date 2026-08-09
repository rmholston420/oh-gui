import { describe, expect, it } from 'vitest';
import { contrastRatio, themeTokens } from './tokens';

describe('theme tokens', () => {
  it('keeps the deep-lapis panel stack and agent-active amber exact to §7.1', () => {
    expect(themeTokens.base.value).toBe('#040814');
    expect(themeTokens['panel-raised'].value).toBe('#0B132B');
    expect(themeTokens['agent-active'].value).toBe('#F59E0B');
    expect(themeTokens['agent-active-bright'].value).toBe('#FBBF24');
  });

  it('stores a measured and reproducible contrast ratio for every token', () => {
    for (const [name, token] of Object.entries(themeTokens)) {
      const comparisonToken = themeTokens[token.contrast.against];
      expect(contrastRatio(token.value, comparisonToken.value), name).toBeCloseTo(
        token.contrast.ratio,
        2,
      );
    }
  });

  it('contains green/red only in diff or pass/fail semantic tokens', () => {
    const greenOrRedNames = Object.keys(themeTokens).filter(
      (name) => name.includes('diff') || name.includes('pass') || name.includes('fail'),
    );
    expect(greenOrRedNames).toEqual(['diff-add', 'diff-delete', 'status-pass', 'status-fail']);
  });
});
