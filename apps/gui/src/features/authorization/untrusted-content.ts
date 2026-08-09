/**
 * GUI-local untrusted-content provenance for the authorization card.
 *
 * The pinned 1.41.0 SDK's `ActionEvent` has no trust class, context-provenance collection, or
 * untrusted-content flag. This is consequently a local input, never a claim about a native SDK
 * field and never sent to Agent Server. A producer may pass it only after its own provenance
 * tracker has traced the action back to the relevant context items.
 *
 * `thirdPartyUntrustedContextIds` intentionally uses three states:
 * - `undefined` (the containing field is absent): this GUI has no provenance capability/input
 * - `null`: GUI-local provenance exists but was not computed for this action
 * - `[]`: GUI-local provenance was computed and found no untrusted influence
 *
 * The last two must not collapse into the same UI state. An empty result is a finding; null is not.
 */

/** Explicitly non-SDK-native provenance passed to the authorization presentation layer. */
export interface GuiLocalUntrustedContentProvenance {
  /** Runtime marker retained so the source remains inspectable in logs and fixtures. */
  readonly source: 'gui-local';
  /**
   * Context-item ids that the GUI-local tracker found on this action's ancestry.
   * `null` means the tracker did not compute ancestry; an empty array means it did and found none.
   */
  readonly thirdPartyUntrustedContextIds: readonly string[] | null;
}

export type UntrustedContentStatus =
  | 'unavailable'
  | 'gui-local-uncomputed'
  | 'gui-local-clear'
  | 'gui-local-influenced';

/**
 * Classify a provenance input without promoting a missing or uncomputed value into a clean result.
 */
export function untrustedContentStatus(
  provenance: GuiLocalUntrustedContentProvenance | undefined,
): UntrustedContentStatus {
  if (provenance === undefined) return 'unavailable';
  if (provenance.thirdPartyUntrustedContextIds === null) return 'gui-local-uncomputed';
  return provenance.thirdPartyUntrustedContextIds.length > 0
    ? 'gui-local-influenced'
    : 'gui-local-clear';
}
