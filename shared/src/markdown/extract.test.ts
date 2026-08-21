import { describe, expect, it } from 'vitest';
import {
  extractProps,
  listTaskItems,
  renameTagInContent,
  setAllTasks,
  toggleTask,
  withImpliedAncestors,
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

  it('toggles a single task without touching the rest', () => {
    const out = toggleTask(doc, 0, true);
    expect(out).toBe('Intro\n\n- [x] first\n- [x] second\n- [ ] third');
    expect(toggleTask(out, 1, false)).toContain('- [ ] second');
  });

  it('checks and unchecks all', () => {
    expect(setAllTasks(doc, true)).toBe('Intro\n\n- [x] first\n- [x] second\n- [x] third');
    expect(setAllTasks(doc, false)).toBe('Intro\n\n- [ ] first\n- [ ] second\n- [ ] third');
  });

  it('is a no-op for out-of-range index', () => {
    expect(toggleTask(doc, 99, true)).toBe(doc);
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
