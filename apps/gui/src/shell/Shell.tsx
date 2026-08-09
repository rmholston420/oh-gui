import { useCallback, useState, type ReactNode } from 'react';
import { type Lens, useLens } from '../features/lens/useLens';
import './Shell.css';
import '../theme/tokens.css';
import { useViewportGate } from './useViewportGate';

export interface ShellRenderContext {
  /** Current semantic-zoom lens; it never represents a route or data source. */
  readonly lens: Lens;
  /** True below 900px; approve/reject/relax consumers must disable themselves. */
  readonly isReadOnlyViewport: boolean;
}

export interface ShellProps {
  readonly children: ReactNode | ((context: ShellRenderContext) => ReactNode);
  readonly leftRail?: ReactNode;
  readonly rightColumn?: ReactNode;
  /** Project/repo/run controls supplied by the integrating surface for Pro's command bar. */
  readonly commandBarContent?: ReactNode;
  /** Optional controlled lens for project-level persistence. */
  readonly lens?: Lens;
  readonly onLensChange?: (lens: Lens) => void;
}

function renderChildren(
  children: ShellProps['children'],
  context: ShellRenderContext,
): ReactNode {
  return typeof children === 'function'
    ? (children as (nextContext: ShellRenderContext) => ReactNode)(context)
    : children;
}

/**
 * Lens presentation shell over a single mounted center surface. It contains no
 * route or data operation; toggling it only changes layout state.
 */
export function Shell({
  children,
  leftRail,
  rightColumn,
  commandBarContent,
  lens: controlledLens,
  onLensChange,
}: ShellProps) {
  const storedLens = useLens();
  const [isLeftRailCollapsed, setIsLeftRailCollapsed] = useState(false);
  const lens = controlledLens ?? storedLens.lens;
  const isReadOnlyViewport = useViewportGate();
  const isPro = lens === 'pro';
  const hasLeftRail = leftRail !== undefined;

  const setLens = useCallback(
    (nextLens: Lens) => {
      if (controlledLens === undefined) storedLens.setLens(nextLens);
      onLensChange?.(nextLens);
    },
    [controlledLens, onLensChange, storedLens],
  );

  const toggleLens = useCallback(() => {
    setLens(lens === 'vibe' ? 'pro' : 'vibe');
  }, [lens, setLens]);

  const content = renderChildren(children, { lens, isReadOnlyViewport });
  const lensTarget = lens === 'vibe' ? 'Pro' : 'Vibe';

  return (
    <div
      className={[
        'oh-shell',
        `oh-shell--${lens}`,
        isLeftRailCollapsed ? 'oh-shell--left-rail-collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-lens={lens}
      data-read-only={String(isReadOnlyViewport)}
      data-testid="shell-root"
    >
      <header className={isPro ? 'oh-shell__command-bar' : 'oh-shell__lens-bar'}>
        {isPro && <div className="oh-shell__command-content">{commandBarContent}</div>}
        <button
          type="button"
          className="oh-shell__lens-toggle"
          aria-label={`Switch to ${lensTarget} lens`}
          aria-pressed={isPro}
          onClick={toggleLens}
        >
          {lens === 'vibe' ? 'Vibe lens' : 'Pro lens'}
        </button>
      </header>

      {isReadOnlyViewport && (
        <p className="oh-shell__read-only-notice" role="status">
          Read-only below 900px. Approve, Reject, and Relax require a viewport at least 900px wide.
        </p>
      )}

      <div className="oh-shell__workspace">
        {isPro && hasLeftRail && (
          <aside className="oh-shell__left-rail" aria-label="Navigation">
            <div className="oh-shell__rail-heading">
              <span>Workspace navigation</span>
              <button
                type="button"
                className="oh-shell__rail-toggle"
                aria-label={isLeftRailCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                aria-expanded={!isLeftRailCollapsed}
                onClick={() => setIsLeftRailCollapsed((collapsed) => !collapsed)}
              >
                {isLeftRailCollapsed ? 'Expand' : 'Collapse'}
              </button>
            </div>
            <div hidden={isLeftRailCollapsed}>{leftRail}</div>
          </aside>
        )}

        <main className="oh-shell__center-stage">{content}</main>

        {isPro && rightColumn !== undefined && (
          <aside className="oh-shell__right-column" aria-label="Conversation">
            {rightColumn}
          </aside>
        )}
      </div>
    </div>
  );
}

export default Shell;
