import { describe, expect, it } from 'vitest';
import { untrustedContentStatus } from './untrusted-content';

describe('GUI-local untrusted-content provenance', () => {
  it('does not manufacture an SDK-native signal when the local field is absent', () => {
    expect(untrustedContentStatus(undefined)).toBe('unavailable');
  });

  it('keeps an uncomputed local ancestry distinct from a computed empty result', () => {
    expect(
      untrustedContentStatus({
        source: 'gui-local',
        thirdPartyUntrustedContextIds: null,
      }),
    ).toBe('gui-local-uncomputed');
    expect(
      untrustedContentStatus({
        source: 'gui-local',
        thirdPartyUntrustedContextIds: [],
      }),
    ).toBe('gui-local-clear');
  });

  it('marks a non-empty GUI-local ancestry as untrusted-content influence', () => {
    expect(
      untrustedContentStatus({
        source: 'gui-local',
        thirdPartyUntrustedContextIds: ['context-item-17'],
      }),
    ).toBe('gui-local-influenced');
  });
});
