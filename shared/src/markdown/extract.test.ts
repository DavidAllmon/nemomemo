import { describe, expect, it } from 'vitest';
import {
  buildMemoPayload,
  extractProps,
  listTaskItems,
  renameTagInContent,
  setAllTasks,
  toggleTaskAt,
  withImpliedAncestors,
  isValidTagName,
} from './extract.js';

describe('extractProps', () => {
  it('extracts flat and nested tags with implied ancestors', () => {
    const { tags } = extractProps('Working on #dev/git today, also #reading');
    expect(tags).toEqual(['dev', 'dev/git', 'reading']);
  });

  it('ignores tags inside links and code', () => {
    const { tags } = extractProps('[link](https://example.com/#anchor) and `#notatag` here #real');
    expect(tags).toEqual(['real']);
  });

  it('extracts mentions', () => {
    const { mentions } = extractProps('cc @marlin and @dory-fish');
    expect(mentions).toEqual(['dory-fish', 'marlin']);
  });

  it('detects has_link from markdown links and bare urls', () => {
    expect(extractProps('see [docs](https://x.dev)').property.hasLink).toBe(true);
    expect(extractProps('see https://x.dev').property.hasLink).toBe(true);
    expect(extractProps('no links').property.hasLink).toBe(false);
  });

  it('detects code', () => {
    expect(extractProps('`inline`').property.hasCode).toBe(true);
    expect(extractProps('```js\nlet x = 1\n```').property.hasCode).toBe(true);
    expect(extractProps('plain').property.hasCode).toBe(false);
  });

  it('detects task lists and incomplete tasks', () => {
    const done = extractProps('- [x] shipped');
    expect(done.property.hasTaskList).toBe(true);
    expect(done.property.hasIncompleteTasks).toBe(false);
    const open = extractProps('- [x] shipped\n- [ ] pending');
    expect(open.property.hasIncompleteTasks).toBe(true);
    expect(extractProps('- plain item').property.hasTaskList).toBe(false);
  });
});

describe('withImpliedAncestors', () => {
  it('expands hierarchies', () => {
    expect(withImpliedAncestors(['a/b/c'])).toEqual(['a', 'a/b', 'a/b/c']);
  });
});

describe('task splicing', () => {
  const doc = 'Intro\n\n- [ ] first\n- [x] second\n- [ ] third';

  it('lists tasks in document order with offsets', () => {
    const items = listTaskItems(doc);
    expect(items.map((t) => t.checked)).toEqual([false, true, false]);
    for (const item of items) {
      expect(['[ ]', '[x]']).toContain(doc.slice(item.markerOffset, item.markerOffset + 3));
    }
  });

  it('toggleTaskAt splices exactly the marker at the given offset', () => {
    const items = listTaskItems(doc);
    const out = toggleTaskAt(doc, items[0]!.markerOffset, true);
    expect(out).toBe('Intro\n\n- [x] first\n- [x] second\n- [ ] third');
    expect(toggleTaskAt(out, items[1]!.markerOffset, false)).toContain('- [ ] second');
  });

  it('toggleTaskAt is a no-op when no marker sits near the offset', () => {
    expect(toggleTaskAt(doc, 0, true)).toBe(doc);
  });

  it('checks and unchecks all', () => {
    expect(setAllTasks(doc, true)).toBe('Intro\n\n- [x] first\n- [x] second\n- [x] third');
    expect(setAllTasks(doc, false)).toBe('Intro\n\n- [ ] first\n- [ ] second\n- [ ] third');
  });

  it('counts incomplete tasks', () => {
    const { property } = extractProps('- [ ] one\n- [x] done\n- [ ] two');
    expect(property.incompleteTasks).toBe(2);
    expect(property.hasIncompleteTasks).toBe(true);
    expect(extractProps('- [x] done').property.incompleteTasks).toBe(0);
    expect(extractProps('plain text').property.incompleteTasks).toBe(0);
  });

  it('buildMemoPayload serializes tags + property and returns mentions', () => {
    const { payload, mentions } = buildMemoPayload('#reef hi @marlin\n\n- [ ] task');
    const parsed = JSON.parse(payload) as {
      tags: string[];
      property: { incompleteTasks: number };
    };
    expect(parsed.tags).toEqual(['reef']);
    expect(parsed.property.incompleteTasks).toBe(1);
    expect(mentions).toEqual(['marlin']);
  });
});

describe('renameTagInContent', () => {
  it('renames a tag and its descendants', () => {
    const out = renameTagInContent('note #work and #work/deep plus #working', 'work', 'job');
    expect(out).toBe('note #job and #job/deep plus #working');
  });

  it('does not rewrite inside code fences', () => {
    const doc = '```\n#work\n```\n#work';
    expect(renameTagInContent(doc, 'work', 'job')).toBe('```\n#work\n```\n#job');
  });
});

describe('isValidTagName', () => {
  it('accepts the tag grammar, hierarchy included', () => {
    for (const name of ['reef', 'reef/notes', 'héllo', 'a-b_c', 'a/b/c', '日記', 'v2']) {
      expect(isValidTagName(name), name).toBe(true);
    }
  });

  it('rejects anything the inline tokenizer would never match', () => {
    for (const name of ['', 'a/', 'a//b', '-a', 'a b', '#a', '/a', 'a/-b']) {
      expect(isValidTagName(name), name).toBe(false);
    }
  });
});
