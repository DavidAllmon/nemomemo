import 'highlight.js/styles/github.css';
import { Check, Copy } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toggleTaskAt } from '@nemomemo/shared';
import type { Node, Parent, Text } from 'mdast';
import { useMemoFilters } from '@/hooks/use-memo-filters.js';
import { cn } from '@/lib/utils.js';

const TAG_REGEX = /(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_][\p{L}\p{N}_-]*)*)/gu;
const MENTION_REGEX = /(^|[\s(])@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,30}[a-zA-Z0-9])?)/g;

/** Split text nodes so `#tag` and `@user` become link nodes we can style. */
function remarkTagsMentions() {
  return (tree: Node) => {
    const walk = (node: Node, insideLink: boolean) => {
      const parent = node as Parent;
      if (!parent.children) return;
      const nextInsideLink = insideLink || node.type === 'link' || node.type === 'linkReference';
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i]!;
        if (child.type === 'text' && !nextInsideLink) {
          const value = (child as Text).value;
          const pieces: Node[] = [];
          let cursor = 0;
          const matches = [
            ...[...value.matchAll(TAG_REGEX)].map((m) => ({ m, kind: 'tag' as const })),
            ...[...value.matchAll(MENTION_REGEX)].map((m) => ({ m, kind: 'mention' as const })),
          ].sort((a, b) => a.m.index! - b.m.index!);
          for (const { m, kind } of matches) {
            const start = m.index! + m[1]!.length;
            if (start < cursor) continue;
            if (start > cursor) pieces.push({ type: 'text', value: value.slice(cursor, start) } as Text);
            const raw = value.slice(start, start + 1 + m[2]!.length);
            pieces.push({
              type: 'link',
              url: `#${kind}:${m[2]}`,
              children: [{ type: 'text', value: raw }],
            } as unknown as Node);
            cursor = start + raw.length;
          }
          if (pieces.length > 0) {
            if (cursor < value.length) pieces.push({ type: 'text', value: value.slice(cursor) } as Text);
            parent.children.splice(i, 1, ...(pieces as Parent['children']));
            i += pieces.length - 1;
            continue;
          }
        }
        walk(child, nextInsideLink);
      }
    };
    walk(tree, false);
  };
}

/**
 * The checkbox <input> hast node is synthetic (no position), but its parent
 * <li> keeps the mdast listItem position. Stamp the offset onto the input at
 * parse time so the renderer can splice the exact source span.
 */
function rehypeCheckboxOffsets() {
  interface HastElement {
    type: string;
    tagName?: string;
    properties?: Record<string, unknown>;
    children?: HastElement[];
    position?: { start?: { offset?: number } };
  }
  return (tree: HastElement) => {
    const walk = (node: HastElement) => {
      if (node.tagName === 'li' && node.position?.start?.offset != null) {
        const input = node.children?.find(
          (child) => child.tagName === 'input' && child.properties?.type === 'checkbox',
        );
        if (input) {
          input.properties = { ...input.properties, dataOffset: String(node.position.start.offset) };
        }
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
  };
}

function CodeBlock({ children, ...props }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      <pre {...props}>{children}</pre>
      <button
        aria-label="Copy code"
        onClick={(event) => {
          const pre = (event.currentTarget.previousSibling as HTMLElement | null)?.textContent ?? '';
          void navigator.clipboard.writeText(pre);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-md border border-border bg-card p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        {copied ? <Check className="size-3.5 text-ocean" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

type RehypeHighlight = typeof import('rehype-highlight').default;

// highlight.js is a large chunk most feeds never need — fetch it only once a
// memo with a fenced code block actually renders, then reuse module-wide.
let loadedHighlight: RehypeHighlight | null = null;

function useRehypeHighlight(content: string): RehypeHighlight | null {
  const wantsHighlight = content.includes('```');
  const [plugin, setPlugin] = useState<RehypeHighlight | null>(loadedHighlight);
  useEffect(() => {
    if (!wantsHighlight || plugin != null) return;
    let cancelled = false;
    void import('rehype-highlight').then((module) => {
      loadedHighlight = module.default;
      if (!cancelled) setPlugin(() => module.default);
    });
    return () => {
      cancelled = true;
    };
  }, [wantsHighlight, plugin]);
  return wantsHighlight ? plugin : null;
}

export function MemoContent({
  content,
  onContentChange,
  className,
}: {
  content: string;
  /** When provided, task checkboxes become interactive and splice the source. */
  onContentChange?: (next: string) => void;
  className?: string;
}) {
  const { toggleChip } = useMemoFilters();
  const plugins = useMemo(() => [remarkGfm, remarkTagsMentions], []);
  const rehypeHighlight = useRehypeHighlight(content);
  const rehypePlugins = useMemo(
    () => (rehypeHighlight ? [rehypeCheckboxOffsets, rehypeHighlight] : [rehypeCheckboxOffsets]),
    [rehypeHighlight],
  );

  return (
    <div className={cn('memo-content text-[15px]', className)}>
      <Markdown
        remarkPlugins={plugins}
        rehypePlugins={rehypePlugins}
        components={{
          a({ href, children, ...props }) {
            if (href?.startsWith('#tag:')) {
              const tag = href.slice(5);
              return (
                <button
                  onClick={() => toggleChip({ type: 'tagSearch', value: tag })}
                  className="inline-flex items-center rounded-full bg-ocean-soft px-1.5 py-0 align-baseline font-semibold !text-ocean !no-underline hover:opacity-80"
                >
                  {children}
                </button>
              );
            }
            if (href?.startsWith('#mention:')) {
              return (
                <a href={`/u/${href.slice(9)}`} className="font-semibold">
                  {children}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
                {children}
              </a>
            );
          },
          input({ checked, disabled, node, ...props }) {
            void disabled;
            void node;
            const raw = (props as Record<string, unknown>)['data-offset'];
            delete (props as Record<string, unknown>)['data-offset'];
            const offset = typeof raw === 'string' ? Number(raw) : null;
            return (
              <input
                type="checkbox"
                checked={!!checked}
                disabled={!onContentChange || offset == null}
                onChange={(event) => {
                  if (offset != null) {
                    onContentChange?.(toggleTaskAt(content, offset, event.currentTarget.checked));
                  }
                }}
                className="mr-1.5 size-3.5 translate-y-px accent-[var(--primary)] disabled:opacity-70"
                {...props}
              />
            );
          },
          pre({ children }) {
            return <CodeBlock>{children}</CodeBlock>;
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
