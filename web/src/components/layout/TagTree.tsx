import { ChevronRight, List, ListTree } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMemoFilters } from '@/hooks/use-memo-filters.js';
import { useTags, useViewer } from '@/hooks/queries.js';
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

export function TagTree() {
  const { data: viewer } = useViewer();
  const { data: tags } = useTags(!!viewer);
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

  if (!viewer || entries.length === 0) return null;

  const setMode = (mode: boolean) => {
    setTreeMode(mode);
    try {
      localStorage.setItem('nemo-tag-tree', String(mode));
    } catch {
      // ignore
    }
  };

  const TagRow = ({ name, label, count, depth }: { name: string; label: string; count: number; depth: number }) => (
    <button
      aria-pressed={activeTag === name}
      onClick={() => toggleChip({ type: 'tagSearch', value: name })}
      className={cn(
        'flex w-full items-center gap-1 rounded-lg px-2 py-1 text-[13px] hover:bg-accent',
        activeTag === name && 'bg-ocean-soft text-ocean',
      )}
      style={{ paddingInlineStart: `${8 + depth * 14}px` }}
    >
      <span className="font-bold text-ocean">#</span>
      <span className="truncate">{label}</span>
      <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{count}</span>
    </button>
  );

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
        <div className="flex-1">
          <TagRow name={node.name} label={node.label} count={node.count} depth={depth} />
        </div>
      </div>
      {expanded.has(node.name) ? node.children.map((child) => renderNode(child, depth + 1)) : null}
    </div>
  );

  return (
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
          : entries.map(([name, count]) => {
              const segments = name.split('/');
              return (
                <button
                  key={name}
                  aria-pressed={activeTag === name}
                  onClick={() => toggleChip({ type: 'tagSearch', value: name })}
                  className={cn(
                    'flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] hover:bg-accent',
                    activeTag === name && 'bg-ocean-soft text-ocean',
                  )}
                >
                  <span className="font-bold text-ocean">#</span>
                  <span className="truncate">
                    {segments.length > 1 ? (
                      <>
                        <span className="text-muted-foreground/70">
                          {segments.slice(0, -1).join('/')}
                          <span className="opacity-40">/</span>
                        </span>
                        {segments[segments.length - 1]}
                      </>
                    ) : (
                      name
                    )}
                  </span>
                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{count}</span>
                </button>
              );
            })}
      </div>
    </section>
  );
}
