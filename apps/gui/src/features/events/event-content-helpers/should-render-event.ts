/**
 * PORTED and adapted from Agent Canvas 1.12.0
 * `components/conversation-events/chat/event-content-helpers/should-render-event.ts` (MIT).
 *
 * Unlike Canvas, this is deliberately permissive. This GUI has no alternate
 * renderer for hidden native events: an event with a native discriminator must
 * reach the renderer, where unfamiliar kinds are visibly marked UNHANDLED.
 * Missing a discriminator is not a native signal and therefore renders null.
 */
import { eventKind } from '../event-types';

export function shouldRenderEvent(event: unknown): boolean {
  return eventKind(event) !== null;
}
