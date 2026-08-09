/**
 * Step-index bounds for the first-run wizard.
 *
 * This exists as a separate pure function for a reason worth recording. The clamp used to live
 * inline in the two onClick handlers, where it was unreachable by any browser-level test: the
 * buttons carry `disabled` at the bounds, and React will not dispatch the handler for them even
 * if you strip the attribute from the DOM first. Mutation testing proved it - deleting the clamp
 * entirely left the end-to-end suite green, because the disabled attribute swallowed every click
 * before the handler ran.
 *
 * Two defenses, only one of them observable, and the tests could not tell them apart. Pulling the
 * clamp out here makes the second one directly testable, and keeps the component honest about
 * which defense is doing the work.
 */
export function clampStep(next: number, count: number): number {
  if (count < 1) return 0;
  return Math.min(count - 1, Math.max(0, next));
}
