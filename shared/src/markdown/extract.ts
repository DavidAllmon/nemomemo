import type { Code, InlineCode, Link, ListItem, Node, Parent, Root, Text } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

const processor = unified().use(remarkParse).use(remarkGfm);

export function parseMarkdown(content: string): Root {
  return processor.parse(content) as Root;
}

/**
 * Tag grammar: `#` followed by letters/numbers/underscore, may contain `/` for
 * hierarchy and `-` inside segments. Mirrors memos' pragmatic subset.
 */
const TAG_REGEX = /(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_][\p{L}\p{N}_-]*)*)/gu;
const MENTION_REGEX = /(^|[\s(])@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,30}[a-zA-Z0-9])?)/g;
const URL_REGEX = /https?:\/\/\S+/;

export interface MemoProperty {
  hasLink: boolean;
  hasCode: boolean;
  hasTaskList: boolean;
  hasIncompleteTasks: boolean;
}

export interface ExtractedProps {
  /** Unique tags including implied ancestors (`a/b` implies `a`). */
  tags: string[];
  /** Unique @usernames mentioned in plain text. */
  mentions: string[];
  property: MemoProperty;
}

/** Expand `dev/git/hooks` into `dev`, `dev/git`, `dev/git/hooks`. */
export function withImpliedAncestors(tags: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const tag of tags) {
    const segments = tag.split('/');
    for (let i = 1; i <= segments.length; i++) {
      out.add(segments.slice(0, i).join('/'));
    }
  }
  return [...out].sort();
}

function isInsideLink(ancestors: Node[]): boolean {
  return ancestors.some((node) => node.type === 'link' || node.type === 'linkReference');
}

/**
 * One AST walk over the raw markdown producing everything the rest of the app
 * derives from content: tags, mentions, and the has_* filter properties.
 */
export function extractProps(content: string): ExtractedProps {
  const tree = parseMarkdown(content);
  const tags = new Set<string>();
  const mentions = new Set<string>();
  let hasLink = false;
  let hasCode = false;
  let hasTaskList = false;
  let hasIncompleteTasks = false;

  const ancestors: Node[] = [];
  const walk = (node: Node) => {
    switch (node.type) {
      case 'link':
      case 'linkReference':
      case 'image':
        if (node.type !== 'image') hasLink = true;
        break;
      case 'code':
      case 'inlineCode':
        hasCode = true;
        break;
      case 'listItem': {
        const item = node as ListItem;
        if (typeof item.checked === 'boolean') {
          hasTaskList = true;
          if (item.checked === false) hasIncompleteTasks = true;
        }
        break;
      }
      case 'text': {
        const text = (node as Text).value;
        if (URL_REGEX.test(text)) hasLink = true;
        if (!isInsideLink(ancestors)) {
          for (const match of text.matchAll(TAG_REGEX)) {
            tags.add(match[2]!);
          }
          for (const match of text.matchAll(MENTION_REGEX)) {
            mentions.add(match[2]!);
          }
        }
        break;
      }
    }
    const children = (node as Parent).children;
    if (children) {
      ancestors.push(node);
      for (const child of children) walk(child);
      ancestors.pop();
    }
  };
  walk(tree);

  return {
    tags: withImpliedAncestors(tags),
    mentions: [...mentions].sort(),
    property: { hasLink, hasCode, hasTaskList, hasIncompleteTasks },
  };
}

// ---------- Task-list source manipulation ----------

export interface TaskItem {
  /** Index in document order — matches the checkbox order react-markdown renders. */
  index: number;
  checked: boolean;
  /** Offset in `content` of the `[` of the checkbox marker. */
  markerOffset: number;
}

/**
 * Locate every task checkbox's exact source span so the UI can splice
 * `[ ]` <-> `[x]` without re-serializing the document (memos' mechanic).
 */
export function listTaskItems(content: string): TaskItem[] {
  const tree = parseMarkdown(content);
  const items: TaskItem[] = [];
  visit(tree, 'listItem', (node: ListItem) => {
    if (typeof node.checked !== 'boolean') return;
    const start = node.position?.start.offset;
    if (start == null) return;
    // The checkbox marker appears shortly after the list marker: `- [ ] ...`
    const window = content.slice(start, start + 16);
    const bracket = window.search(/\[[ xX]\]/);
    if (bracket === -1) return;
    items.push({ index: items.length, checked: node.checked, markerOffset: start + bracket });
  });
  return items;
}

/** Toggle one task (by document-order index) and return the new content. */
export function toggleTask(content: string, taskIndex: number, checked: boolean): string {
  const items = listTaskItems(content);
  const item = items[taskIndex];
  if (!item) return content;
  const mark = checked ? 'x' : ' ';
  return content.slice(0, item.markerOffset) + `[${mark}]` + content.slice(item.markerOffset + 3);
}

/** Check or uncheck every task in the document. */
export function setAllTasks(content: string, checked: boolean): string {
  const items = listTaskItems(content);
  const mark = checked ? 'x' : ' ';
  let out = content;
  // Splice back-to-front so earlier offsets stay valid.
  for (const item of [...items].reverse()) {
    out = out.slice(0, item.markerOffset) + `[${mark}]` + out.slice(item.markerOffset + 3);
  }
  return out;
}

/**
 * Rename a tag across the document, including descendant tags
 * (`#a` -> `#b` also rewrites `#a/x`). Skips code spans by only rewriting
 * text positions found via the AST walk.
 */
export function renameTagInContent(content: string, from: string, to: string): string {
  const tree = parseMarkdown(content);
  const edits: { start: number; end: number; replacement: string }[] = [];
  const collect = (node: Node, insideLink: boolean) => {
    if (node.type === 'text' && !insideLink) {
      const text = node as Text;
      const base = text.position?.start.offset;
      if (base != null) {
        for (const match of text.value.matchAll(TAG_REGEX)) {
          const tag = match[2]!;
          if (tag === from || tag.startsWith(from + '/')) {
            const tagStart = base + match.index! + match[1]!.length + 1; // +1 skips '#'
            edits.push({
              start: tagStart,
              end: tagStart + from.length,
              replacement: to,
            });
          }
        }
      }
    }
    const children = (node as Parent).children;
    if (children) {
      const nextInsideLink = insideLink || node.type === 'link' || node.type === 'linkReference';
      for (const child of children) collect(child, nextInsideLink);
    }
  };
  collect(tree, false);
  let out = content;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
  }
  return out;
}
