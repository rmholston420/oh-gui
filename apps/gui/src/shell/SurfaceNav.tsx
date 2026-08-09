/**
 * Left-rail surface navigation.
 *
 * REQ-03-007 enumerates the rail's contents -- projects, conversations, worktrees, automations,
 * the "needs you" inbox, settings, and the plan tree -- and does not name plugins. Plugins are
 * mounted under **Settings** rather than as a new top-level entry, because a read-only view of
 * which plugins the agent-server discovered is configuration inspection, not a workspace object
 * of the same kind as a conversation or a worktree. Promoting it to a peer of those would be
 * widening REQ-03-007 without an ADR.
 *
 * Only the groups backed by a built surface are rendered. The rail does not advertise
 * destinations that do not exist yet: a disabled row for every unbuilt spec item would be a
 * to-do list wearing navigation's clothes.
 */
export type Surface = 'run' | 'plugins';

export interface SurfaceNavProps {
  readonly current: Surface;
  readonly onSelect: (surface: Surface) => void;
}

interface NavItem {
  readonly surface: Surface;
  readonly label: string;
  readonly hint: string;
}

const GROUPS: ReadonlyArray<{ heading: string; items: readonly NavItem[] }> = [
  {
    heading: 'Workspace',
    items: [{ surface: 'run', label: 'Run', hint: 'The active conversation and its actions' }],
  },
  {
    heading: 'Settings',
    items: [
      { surface: 'plugins', label: 'Plugins', hint: 'Plugins the agent-server discovered' },
    ],
  },
];

export function SurfaceNav({ current, onSelect }: SurfaceNavProps) {
  return (
    <nav aria-label="Surfaces" className="oh-nav">
      {GROUPS.map((group) => (
        <div key={group.heading} className="oh-nav__group">
          <h2 className="oh-nav__heading">{group.heading}</h2>
          <ul className="oh-nav__list">
            {group.items.map((item) => {
              const isCurrent = item.surface === current;
              return (
                <li key={item.surface}>
                  <button
                    type="button"
                    className="oh-nav__item"
                    // `aria-current="page"` and not `aria-pressed`: these are destinations, and a
                    // screen reader should say "current page", not "pressed". The distinction is
                    // the difference between navigation and a toggle group.
                    aria-current={isCurrent ? 'page' : undefined}
                    data-current={isCurrent ? 'true' : 'false'}
                    title={item.hint}
                    onClick={() => onSelect(item.surface)}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default SurfaceNav;
