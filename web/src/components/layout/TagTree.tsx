import { ChevronRight, List, ListTree, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMemoFilters } from '@/hooks/use-memo-filters.js';
import { useTags, useTogglePinnedTag, useUserSettings, useViewer } from '@/hooks/queries.js';
import { cn } from '@/lib/utils.js';

interface TagNode {
  name: string; // full path
  label: string; // last segment
  count: number;
  children: TagNode[];
}

function buildTree(tags: Record<string, number>): TagNode[] {
  const roots: TagNode[] = [];
  const byPath = new Map<string, TagNode>();
  for (const name of Object.keys(tags).sort()) {
    const segments = name.split('/');
    const label = segments[segments.length - 1]!;
    const node: TagNode = { name, label, count: tags[name] ?? 0, children: [] };
    byPath.set(name, node);
    if (segments.length === 1) {
      roots.push(node);
    } else {
      const parent = byPath.get(segments.slice(0, -1).join('/'));
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  return roots;
}

/** Full path with the parent segments dimmed — `reef/coral` reads as one chip. */
function TagLabel({ name, leafOnly }: { name: string; leafOnly?: boolean }) {
  const segments = name.split('/');
  if (leafOnly || segments.length === 1) return <>{segments[segments.length - 1]}</>;
  return (
    <>
      <span className="text-muted-foreground/70">
        {segments.slice(0, -1).join('/')}
        <span className="opacity-40">/</span>
      </span>
      {segments[segments.length - 1]}
    </>
  );
}

/** One tag row: the filter toggle, plus a star that never shifts the layout. */
function TagRow({
  name,
  count,
  depth = 0,
  leafOnly,
  active,
  pinned,
  onToggleFilter,
  onTogglePin,
}: {
  name: string;
  count: number;
  depth?: number;
  leafOnly?: boolean;
  active: boolean;
  pinned: boolean;
  onToggleFilter: (name: string) => void;
  onTogglePin: (name: string) => void;
}) {
  return (
    <div className="group flex items-center">
      <button
        aria-pressed={active}
        onClick={() => onToggleFilter(name)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1 rounded-lg px-2 py-1 text-[13px] hover:bg-accent',
          active && 'bg-ocean-soft text-ocean',
        )}
        style={depth ? { paddingInlineStart: `${8 + depth * 14}px` } : undefined}
      >
        <span className="font-bold text-ocean">#</span>
        <span className="truncate">
          <TagLabel name={name} leafOnly={leafOnly} />
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{count}</span>
      </button>
      <button
        aria-label={pinned ? `Unpin #${name}` : `Pin #${name}`}
        aria-pressed={pinned}
        onClick={() => onTogglePin(name)}
        className={cn(
          'ml-0.5 shrink-0 rounded p-1 transition-opacity hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100',
          pinned ? 'text-dory opacity-100' : 'text-muted-foreground opacity-0 hover:text-foreground',
        )}
      >
        <Star className={cn('size-3', pinned && 'fill-current')} />
      </button>
    </div>
  );
}

export function TagTree() {
  const { data: viewer } = useViewer();
  const { data: tags } = useTags(!!viewer);
  const { data: settings } = useUserSettings(!!viewer);
  const togglePin = useTogglePinnedTag();
  const { chips, toggleChip } = useMemoFilters();
  const [treeMode, setTreeMode] = useState(() => {
    try {
      return localStorage.getItem('nemo-tag-tree') === 'true';
    } catch {
      return false;
    }
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const activeTag = chips.find((chip) => chip.type === 'tagSearch')?.value;
  const entries = useMemo(
    () => Object.entries(tags ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [tags],
  );
  const tree = useMemo(() => buildTree(tags ?? {}), [tags]);

  const stored = useMemo(() => settings?.general.pinnedTags ?? [], [settings]);
  // A tag whose last memo is gone drops out of the list rather than rendering a
  // dead row; the stored value stays put, so re-using the tag brings it back.
  const pinned = useMemo(() => stored.filter((tag) => tag in (tags ?? {})), [stored, tags]);
  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  if (!viewer || entries.length === 0) return null;

  const setMode = (mode: boolean) => {
    setTreeMode(mode);
    try {
      localStorage.setItem('nemo-tag-tree', String(mode));
    } catch {
      // ignore
    }
  };

  const toggleFilter = (name: string) => toggleChip({ type: 'tagSearch', value: name });

  const renderNode = (node: TagNode, depth: number): React.ReactNode => (
    <div key={node.name}>
      <div className="flex items-center">
        {node.children.length > 0 ? (
          <button
            aria-label={expanded.has(node.name) ? `Collapse ${node.label}` : `Expand ${node.label}`}
            onClick={() =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(node.name)) next.delete(node.name);
                else next.add(node.name);
                return next;
              })
            }
            className="rounded p-0.5 text-muted-foreground hover:bg-accent"
          >
            <ChevronRight
              className={cn('size-3 transition-transform', expanded.has(node.name) && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <div className="min-w-0 flex-1">
          <TagRow
            name={node.name}
            count={node.count}
            depth={depth}
            leafOnly
            active={activeTag === node.name}
            pinned={pinnedSet.has(node.name)}
            onToggleFilter={toggleFilter}
            onTogglePin={togglePin}
          />
        </div>
      </div>
      {expanded.has(node.name) ? node.children.map((child) => renderNode(child, depth + 1)) : null}
    </div>
  );

  return (
    <>
      {pinned.length > 0 ? (
        <section aria-label="Pinned tags" className="mb-2">
          <p className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Pinned
          </p>
          <div className="flex flex-col">
            {pinned.map((name) => (
              <TagRow
                key={name}
                name={name}
                count={tags?.[name] ?? 0}
                active={activeTag === name}
                pinned
                onToggleFilter={toggleFilter}
                onTogglePin={togglePin}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="Tags">
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tags</span>
          <span className="flex gap-0.5">
            <button
              aria-label="Tags: list"
              aria-pressed={!treeMode}
              onClick={() => setMode(false)}
              className={cn('rounded-md p-1 text-muted-foreground hover:bg-accent', !treeMode && 'bg-accent text-foreground')}
            >
              <List className="size-3.5" />
            </button>
            <button
              aria-label="Tags: tree"
              aria-pressed={treeMode}
              onClick={() => setMode(true)}
              className={cn('rounded-md p-1 text-muted-foreground hover:bg-accent', treeMode && 'bg-accent text-foreground')}
            >
              <ListTree className="size-3.5" />
            </button>
          </span>
        </div>
        <div className="flex flex-col">
          {treeMode
            ? tree.map((node) => renderNode(node, 0))
            : entries.map(([name, count]) => (
                <TagRow
                  key={name}
                  name={name}
                  count={count}
                  active={activeTag === name}
                  pinned={pinnedSet.has(name)}
                  onToggleFilter={toggleFilter}
                  onTogglePin={togglePin}
                />
              ))}
        </div>
      </section>
    </>
  );
}
